"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALLOWED_SOURCES = new Set(["user_feedback", "episode", "interaction_pattern", "research_validation"]);
const THRESHOLD = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; } }
function lines(file) { try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); } catch (_) { return []; } }
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); }
function append(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
function changeId(now) { return `dna-${now.getTime()}-${crypto.randomBytes(4).toString("hex")}`; }

function normalizeEvidence(input, now) {
  if (!input || typeof input !== "object") throw new Error("evidence object is required");
  const item = {
    id: String(input.id || "").slice(0, 160),
    trait: String(input.trait || "").slice(0, 60),
    direction: Number(input.direction),
    source: String(input.source || "").slice(0, 60),
    summary: String(input.summary || input.reason || "").slice(0, 300),
    meaningful: input.meaningful === true,
    strength: Math.max(0, Math.min(1, Number(input.strength ?? 0.5))),
    observed_at: new Date(input.observed_at || now).toISOString(),
    recorded_at: now.toISOString(),
  };
  if (!item.id || !item.trait) throw new Error("evidence id and trait are required");
  if (![-1, 1].includes(item.direction)) throw new Error("direction must be -1 or 1");
  if (!ALLOWED_SOURCES.has(item.source)) throw new Error("evidence source is not approved");
  if (!item.meaningful) throw new Error("evidence must be explicitly marked meaningful");
  return item;
}

function evaluateTrait({ store, trait, evidenceRows, auditPath, now }) {
  const current = store.traits[trait];
  if (!current) throw new Error(`unknown personality trait: ${trait}`);
  store.evolution ||= { consumed_evidence: [], rolled_back_changes: [] };
  const consumed = new Set(store.evolution.consumed_evidence || []);
  const eligible = evidenceRows.filter(row => row.trait === trait && row.meaningful && !consumed.has(row.id));
  for (const direction of [1, -1]) {
    const matching = eligible.filter(row => row.direction === direction);
    if (matching.length < THRESHOLD) continue;
    const dates = new Set(matching.map(row => row.observed_at.slice(0, 10)));
    const sources = new Set(matching.map(row => row.source));
    if (dates.size < 2 && sources.size < 2) continue;
    if (current.updated_at && now.getTime() - Date.parse(current.updated_at) < COOLDOWN_MS) return { changed: false, reason: "trait cooldown is active", pending: matching.length };
    const selected = matching.slice(0, THRESHOLD);
    const average = selected.reduce((sum, row) => sum + row.strength, 0) / selected.length;
    const delta = Number((direction * (0.01 + average * 0.02)).toFixed(3));
    const previous = { ...current };
    const next = {
      value: Number(Math.max(0, Math.min(1, current.value + delta)).toFixed(3)),
      confidence: Number(Math.min(1, current.confidence + 0.03).toFixed(3)),
      evidence_count: current.evidence_count + selected.length,
      updated_at: now.toISOString(),
    };
    const id = changeId(now);
    store.traits[trait] = next;
    store.evolution.consumed_evidence.push(...selected.map(row => row.id));
    append(auditPath, { action: "change", change_id: id, trait, previous, next, delta, evidence: selected.map(row => row.id), reason: selected.map(row => row.summary).join("; ").slice(0, 500), timestamp: now.toISOString(), reversible: true });
    return { changed: true, change_id: id, trait, previous, next, delta };
  }
  return { changed: false, reason: "more repeated evidence is required", pending: eligible.length };
}

function recordEvidence({ storePath, evidencePath, auditPath, evidence, now = new Date() }) {
  const item = normalizeEvidence(evidence, now);
  const existing = lines(evidencePath);
  if (existing.some(row => row.id === item.id)) return { recorded: false, changed: false, reason: "evidence already recorded" };
  const store = read(storePath, { schemaVersion: 1, traits: {} });
  if (!store.traits[item.trait]) throw new Error(`unknown personality trait: ${item.trait}`);
  append(evidencePath, item);
  const result = evaluateTrait({ store, trait: item.trait, evidenceRows: [...existing, item], auditPath, now });
  atomic(storePath, store);
  return { recorded: true, ...result };
}

function rollbackTraitChange({ storePath, auditPath, change_id, reason, now = new Date() }) {
  const audits = lines(auditPath);
  const change = audits.find(row => row.action === "change" && row.change_id === change_id);
  if (!change) throw new Error("personality change not found");
  if (audits.some(row => row.action === "rollback" && row.change_id === change_id)) throw new Error("personality change already rolled back");
  const store = read(storePath, { schemaVersion: 1, traits: {} });
  const beforeRollback = store.traits[change.trait];
  store.traits[change.trait] = { ...change.previous, updated_at: now.toISOString() };
  store.evolution ||= { consumed_evidence: [], rolled_back_changes: [] };
  store.evolution.rolled_back_changes.push(change_id);
  atomic(storePath, store);
  append(auditPath, { action: "rollback", change_id, trait: change.trait, previous: beforeRollback, restored: store.traits[change.trait], reason: String(reason || "manual review").slice(0, 300), timestamp: now.toISOString() });
  return { rolled_back: true, change_id, trait: change.trait, restored: store.traits[change.trait] };
}

function presentationFor(store) {
  const value = name => Number(store.traits?.[name]?.value ?? 0.5);
  const confidence = Object.values(store.traits || {}).reduce((sum, trait) => sum + Number(trait.confidence || 0), 0) / Math.max(1, Object.keys(store.traits || {}).length);
  const ranked = Object.entries(store.traits || {}).sort((a, b) => b[1].value - a[1].value);
  return {
    dominant_trait: ranked[0]?.[0] || "balanced",
    motion_scale: Number((0.8 + value("playfulness") * 0.5).toFixed(2)),
    glow_scale: Number((0.75 + value("curiosity") * 0.55).toFixed(2)),
    presence_scale: Number((0.96 + value("initiative") * 0.08).toFixed(3)),
    expression_confidence: Number(confidence.toFixed(3)),
  };
}

// Compatibility helper for callers that already submit a reviewed evidence set.
function proposeTraitChange({ storePath, auditPath, evidencePath = `${auditPath}.evidence`, trait, evidence, direction, reason, now = new Date() }) {
  let result = { changed: false, reason: "at least three distinct evidence IDs are required" };
  if (!Array.isArray(evidence) || new Set(evidence).size < THRESHOLD) return result;
  const store = read(storePath, { schemaVersion: 1, traits: {} });
  if (!store.traits[trait]) {
    store.traits[trait] = { value: 0.5, confidence: 0, evidence_count: 0, updated_at: null };
    atomic(storePath, store);
  }
  [...new Set(evidence)].forEach((id, index) => {
    result = recordEvidence({ storePath, evidencePath, auditPath, now: new Date(now.getTime() + index), evidence: { id, trait, direction, source: index === 0 ? "user_feedback" : "interaction_pattern", summary: reason, meaningful: true, strength: 0.5, observed_at: new Date(now.getTime() - index * 86_400_000) } });
  });
  return result;
}

module.exports = { presentationFor, proposeTraitChange, recordEvidence, rollbackTraitChange };
