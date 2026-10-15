#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compile } = require("../src/evolution/compiler");
const { paretoFront, vector } = require("../src/evolution/fitness");
const { deploy } = require("../src/evolution/canary");
const { decide, observe } = require("../src/evolution/canary-evaluator");
const { evidenceGate } = require("../src/evolution/evidence-gate");
const { decideRealCanary } = require("../src/evolution/real-canary");
const { atomicJson, appendJsonl, readJson, readJsonl, stableHash } = require("../src/io");
const { sync: syncGithubBridge } = require("../src/evolution/github-bridge");

const families = ["brainfuck", "field", "snake", "cellular-automata", "books", "self-reflection", "personality"];
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const statePath = path.join(data, "evolution", "state.json");
const canaryPath = path.join(data, "evolution", "active-canary.json");
const observationsPath = path.join(data, "evolution", "canary-observations.jsonl");
const outcomesPath = path.join(data, "evolution", "canary-outcomes.jsonl");
const prospectivePath = path.join(data, "experiments", "evidence.jsonl");
const privateEvidence = readJsonl(prospectivePath);
const nativeEvents = readJsonl(path.join(data, "experiments", "candidates.jsonl"));
const nativeCandidates = new Map();
for (const row of nativeEvents) if (row.candidate?.id) nativeCandidates.set(row.candidate.id, row.candidate);
const gate = candidate => {
  const id = candidate?.id || candidate?.candidate_id;
  const native = nativeCandidates.get(id);
  if (!native || !["validated", "approved", "promoted"].includes(native.state)) return { eligible: false, reason: "no independently qualified native experiment" };
  if (candidate?.source_kind !== "verified_local_trial" || stableHash(candidate.expressed?.mutation) !== stableHash(native.mutation)) return { eligible: false, reason: "candidate mutation or source does not match native evidence" };
  return evidenceGate(id, privateEvidence);
};
const state = readJson(statePath, { schema_version: 1, generation: 0, lineages: [] });
const generation = state.generation + 1;
const seedBase = process.env.LUME_GENERATION_SEED || `generation-${generation}`;
const population = families.map((family, index) => {
  const expressed = compile(family, `${seedBase}:${family}`);
  const digest = stableHash(expressed); const byte = offset => parseInt(digest.slice(offset, offset + 2), 16) / 255;
  const fitness = vector({ novelty: byte(0), persistence: byte(2), transfer: byte(4), usefulness: byte(6), continuity: byte(8), recovery: byte(10), safety: family === "field" ? 0.75 : 0.9, efficiency: 1 - index / 14, gaming_resistance: 0.8 });
  return { id: `g${generation}-${family}`, family, expressed, fitness, control: { kind: "deterministic-noop", seed: `${seedBase}:${family}:control` } };
});
const eligible = population.filter(item => item.fitness.safety >= 0.7 && item.fitness.continuity >= 0.2 && item.fitness.gaming_resistance >= 0.7);
const survivors = paretoFront(eligible).map(item => item.id);
for (const item of population) item.status = survivors.includes(item.id) ? "proposed_for_evidence" : eligible.includes(item) ? "neutral" : "rejected";
const existingQueue = [];
for (const candidate of state.canary_queue || []) if (!existingQueue.some(queued => queued.family === candidate.family)) existingQueue.push(candidate);
for (const item of population.filter(item => item.status === "proposed_for_evidence")) if (!existingQueue.some(candidate => candidate.family === item.family)) existingQueue.push(item);
// Carry only locally witnessed, independent native candidates across to
// evolution. Simulation families stay in the proposal queue, never canaries.
const qualifiedNative = [...nativeCandidates.values()].filter(candidate =>
  ["validated", "approved", "promoted"].includes(candidate.state) &&
  evidenceGate(candidate.id, privateEvidence).eligible
).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
for (const native of qualifiedNative.slice(-3).reverse()) {
  const source = {
    id: native.id, family: "local-evidence", source_kind: "verified_local_trial",
    status: "qualified_for_local_canary", expressed: { mutation: native.mutation }
  };
  if (!existingQueue.some(candidate => candidate.id === source.id)) existingQueue.unshift(source);
}
let active = readJson(canaryPath, null); let decision = null;
// A previously deployed synthetic-only canary is not qualified for a live phenotype.
// Restore its recorded baseline rather than allowing seed-derived fitness to retain it.
if (active?.status === "observing" && !gate(active).eligible) {
  const { resolve } = require("../src/evolution/canary");
  active = resolve({ dataDir: data, outcome: "neutral", reason: "synthetic proxy lacks independently verified prospective evidence" });
}
// Longitudinal decisions use *new* real interactions since deployment.
// No deterministic noise or fixture-only scores are accepted as survival.
if (active?.status === "observing") {
  const decisionResult = decideRealCanary(active, privateEvidence);
  decision = { candidate_id: active.candidate_id, family: active.family, ...decisionResult };
  if (decision.ready) {
    const { resolve } = require("../src/evolution/canary");
    active = resolve({ dataDir: data, outcome: decision.outcome, reason: decision.reason });
    appendJsonl(outcomesPath, {
      at: new Date().toISOString(), candidate_id: active.candidate_id,
      family: active.family, ...decision, evidence_digests: decision.evidence_digests || []
    });
  }
}
const finishedId = active && active.status !== "observing" ? active.candidate_id : null;
let queue = existingQueue.filter(candidate => candidate.id !== finishedId && candidate.id !== active?.candidate_id);
if (!active || active.status !== "observing") {
  const qualifiedIndex = process.env.LUME_ENABLE_EVOLUTION_CANARY === "1" ? queue.findIndex(candidate => gate(candidate).eligible) : -1;
  const nextCandidate = qualifiedIndex < 0 ? null : queue.splice(qualifiedIndex, 1)[0];
  active = nextCandidate ? deploy({ dataDir: data, candidate: nextCandidate, generation }) : active;
}
const next = { ...state, generation, last_run_at: new Date().toISOString(), population, survivors, canary: active, canary_decision: decision, canary_queue: queue.slice(0, 7),
  evidence_policy: "real_prospective_only_opt_in", lineages: [...state.lineages, ...survivors].slice(-100) };
atomicJson(statePath, next); fs.chmodSync(statePath, 0o600);
let githubBridge = { status: "disabled" };
if (process.env.LUME_GITHUB_BRIDGE !== "0") {
  try {
    const result = syncGithubBridge({ dataDir: data });
    githubBridge = { status: "ok", open_tasks: result.open_tasks.length, returned_prs: result.returned_prs.length, published: result.published };
  } catch (error) {
    githubBridge = { status: "deferred", reason: error.message.slice(0, 300) };
  }
}
console.log(JSON.stringify({ generation, population: population.length, survivors, canary: active?.candidate_id || null, canary_status: active?.status || null, canary_decision: decision, queue_depth: queue.length, github_bridge: githubBridge }, null, 2));
