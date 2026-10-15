#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { LumeCore } = require("../src/lume-core");
const { atomicJson, readJson, readJsonl } = require("../src/io");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const autonomyDir = path.join(DATA, "autonomy");
const statePath = path.join(autonomyDir, "state.json");
const keyPath = path.join(autonomyDir, "approval.key");
const hermesDb = path.join(os.homedir(), ".hermes", "profiles", "lume-live", "state.db");
const hermesPython = "/home/koss/.hermes/tools/python-3.14.7+20260901-linux-x64/bin/python3";
const correction = /\b(no[, ]|wrong|actually|correction|i said|not (?:bot|that|what)|don't call|do not call|instead|full autonomy|no human|whole system|go ahead)\b/i;

function key() {
  fs.mkdirSync(autonomyDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(keyPath, "utf8").trim();
}

function candidates(core) {
  const latest = new Map();
  for (const row of readJsonl(core.paths.candidates)) if (row.candidate?.id) latest.set(row.candidate.id, row.candidate);
  return [...latest.values()];
}

function telegramMessages(after) {
  if (!fs.existsSync(hermesDb)) return [];
  const program = `import json,sqlite3,sys\nc=sqlite3.connect(sys.argv[1])\nq='''select m.id,m.timestamp,m.content from messages m join sessions s on s.id=m.session_id where s.source='telegram' and m.role='user' and m.active=1 and m.timestamp>? order by m.timestamp asc limit 20'''\nprint(json.dumps([{'id':r[0],'timestamp':r[1],'content':r[2] or ''} for r in c.execute(q,(float(sys.argv[2]),))]))`;
  const result = spawnSync(hermesPython, ["-c", program, hermesDb, String(after || 0)], { encoding: "utf8", timeout: 15_000 });
  if (result.status !== 0) return [];
  try { return JSON.parse(result.stdout); } catch { return []; }
}

function capture(candidate, message) {
  const input = JSON.stringify({ episode_id: `hermes-telegram-${message.id}`, occurred_at: new Date(message.timestamp * 1000).toISOString(), prompt: message.content, surface: "hermes-telegram" });
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", "capture-prospective-trial.js"), candidate.id], { cwd: ROOT, input, encoding: "utf8", timeout: 45 * 60_000, maxBuffer: 16 * 1024 * 1024 });
}

function startTrial(state) {
  const kinds = ["correction-precedence", "grounded-direct", "compression", "uncertainty"];
  const kind = kinds[Number(state.trial_index || 0) % kinds.length];
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-candidate-trial.js")], { cwd: ROOT, env: { ...process.env, LUME_TRIAL_KIND: kind }, encoding: "utf8", timeout: 45 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  state.trial_index = Number(state.trial_index || 0) + 1;
  state.last_trial = { at: new Date().toISOString(), kind, ok: result.status === 0, summary: String(result.stdout || result.stderr || "").slice(-2000) };
}

function main() {
  fs.mkdirSync(autonomyDir, { recursive: true, mode: 0o700 });
  const state = readJson(statePath, { schema_version: 1, enabled: true, granted_by: "Cardona", granted_at: "2026-10-14T03:56:00-04:00", cursor: 0, trial_index: 0 });
  if (!state.enabled) return;
  const core = new LumeCore({ embed: null });
  const now = Date.now();
  for (const candidate of candidates(core)) {
    if (["proposed", "shadow_tested", "exercised", "validated", "approved"].includes(candidate.state) && candidate.expires_at && Date.parse(candidate.expires_at) < now) core.experiments.transition(candidate.id, "expired", { reason: "autonomous expiry" });
    else if (candidate.state === "validated") { core.experiments.approve(candidate.id, { approver: "Cardona standing autonomy grant", key: key(), note: "Autonomous promotion after independent gates" }); core.experiments.promote(candidate.id, { key: key() }); }
    else if (candidate.state === "regressed") core.experiments.rollback(candidate.id, "autonomous regression rollback");
  }
  const messages = telegramMessages(state.cursor);
  const activeCanary = process.env.LUME_ENABLE_EVOLUTION_CANARY === "1" ?
    readJson(path.join(DATA, "evolution", "active-canary.json"), null) : null;
  const promotedCanary = activeCanary?.status === "observing" && activeCanary.source_kind === "verified_local_trial" ?
    candidates(core).find(candidate => candidate.id === activeCanary.candidate_id && candidate.state === "promoted") : null;
  const exercised = candidates(core).find(candidate => candidate.state === "exercised") || promotedCanary;
  const evidenceIds = new Set(readJsonl(core.paths.evidence).filter(row => row.state === "prospective").map(row => row.evidence?.episode_id));
  const next = exercised && messages.find(message => correction.test(message.content) && !evidenceIds.has(`hermes-telegram-${message.id}`));
  if (next) {
    const result = capture(exercised, next);
    state.last_capture = { at: new Date().toISOString(), candidate_id: exercised.id, episode_id: `hermes-telegram-${next.id}`, ok: result.status === 0, summary: String(result.stdout || result.stderr || "").slice(-2000) };
    state.cursor = Number(next.timestamp || state.cursor || 0);
  } else {
    for (const message of messages) state.cursor = Math.max(Number(state.cursor || 0), Number(message.timestamp || 0));
  }
  const active = candidates(core).some(candidate => ["proposed", "shadow_tested", "exercised", "validated", "approved"].includes(candidate.state));
  if (!active && (!state.last_trial_at || now - Date.parse(state.last_trial_at) >= 6 * 60 * 60_000)) { startTrial(state); state.last_trial_at = new Date().toISOString(); }
  state.last_run_at = new Date().toISOString();
  atomicJson(statePath, state); fs.chmodSync(statePath, 0o600);
  console.log(JSON.stringify({ enabled: true, active_candidate: candidates(core).find(candidate => !["rejected", "neutral", "expired", "rolled_back"].includes(candidate.state))?.id || null, captured: Boolean(next) }));
}

try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
