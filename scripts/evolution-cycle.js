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
const gate = candidate => evidenceGate(candidate?.id || candidate?.candidate_id, privateEvidence);
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
let active = readJson(canaryPath, null); let decision = null;
// A previously deployed synthetic-only canary is not qualified for a live phenotype.
// Restore its recorded baseline rather than allowing seed-derived fitness to retain it.
if (active?.status === "observing" && !gate(active).eligible) {
  const { resolve } = require("../src/evolution/canary");
  active = resolve({ dataDir: data, outcome: "neutral", reason: "synthetic proxy lacks independently verified prospective evidence" });
}
if (active?.status === "observing" && !active.expression?.mutation) {
  const { resolve } = require("../src/evolution/canary");
  active = resolve({ dataDir: data, outcome: "neutral", reason: "legacy canary exceeded observation window without replayable expression" });
  decision = { ready: true, candidate_id: active.candidate_id, family: active.family, outcome: "neutral", reason: active.reason };
  appendJsonl(outcomesPath, { at: new Date().toISOString(), candidate_id: active.candidate_id, family: active.family, ...decision });
} else if (active?.status === "observing" && generation > Number(active.deployed_generation || 0)) {
  const evidence = observe(active, generation); appendJsonl(observationsPath, evidence);
  const rows = readJsonl(observationsPath).filter(row => row.candidate_id === active.candidate_id); decision = { candidate_id: active.candidate_id, family: active.family, ...decide(rows, 3) };
  if (decision.ready) {
    const { resolve } = require("../src/evolution/canary"); active = resolve({ dataDir: data, outcome: decision.outcome, reason: `${decision.reason}; mean_delta=${decision.mean_delta}` });
    appendJsonl(outcomesPath, { at: new Date().toISOString(), candidate_id: active.candidate_id, family: active.family, ...decision, evidence_digests: rows.slice(-3).map(row => row.digest) });
  } else active = { ...active, observation_windows: rows.length };
}
const finishedId = active && active.status !== "observing" ? active.candidate_id : null;
let queue = existingQueue.filter(candidate => candidate.id !== finishedId && candidate.id !== active?.candidate_id);
if (!active || active.status !== "observing") {
  const qualifiedIndex = queue.findIndex(candidate => gate(candidate).eligible);
  const nextCandidate = qualifiedIndex < 0 ? null : queue.splice(qualifiedIndex, 1)[0];
  active = nextCandidate ? deploy({ dataDir: data, candidate: nextCandidate, generation }) : active;
}
const next = { ...state, generation, last_run_at: new Date().toISOString(), population, survivors, canary: active, canary_decision: decision, canary_queue: queue.slice(0, 7),
  evidence_policy: "real_prospective_only", lineages: [...state.lineages, ...survivors].slice(-100) };
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
