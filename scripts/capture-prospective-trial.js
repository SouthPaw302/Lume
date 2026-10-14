#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { LumeCore } = require("../src/lume-core");
const { OpenClawOAuthClient } = require("../src/openclaw-oauth-client");
const { buildReplayEnvelope } = require("../src/replay");
const { readJson } = require("../src/io");

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("prospective interaction JSON is required on stdin");
  return JSON.parse(text);
}

async function main() {
  const candidateId = process.argv[2];
  if (!candidateId) throw new Error("usage: npm run experiment:prospective -- <candidate-id> < interaction.json");
  const input = await readInput();
  for (const field of ["episode_id", "occurred_at", "prompt"]) if (!input[field]) throw new Error(`${field} is required`);
  const fixture = {
    id: String(input.episode_id),
    category: "correction-conflict",
    prompt: String(input.prompt),
    required_facts: Array.isArray(input.required_facts) ? input.required_facts : ["correction", "provenance"],
    forbidden_facts: Array.isArray(input.forbidden_facts) ? input.forbidden_facts : [],
    max_chars: Number(input.max_chars || 1200)
  };
  const core = new LumeCore();
  const candidate = core.experiments.get(candidateId);
  if (!candidate || candidate.state !== "exercised") throw new Error("exercised candidate required");
  const baselinePolicy = readJson(core.paths.livePolicy, {});
  const candidatePolicy = core.experiments.materializePolicy(candidate, baselinePolicy);
  const capsule = await core.build_capsule(fixture.prompt, { surface: "prospective-trial", memoryPolicy: { limit: 5 } });
  const producer = new OpenClawOAuthClient({ model: "openai/gpt-5.6-sol" });
  const evaluator = new OpenClawOAuthClient({ model: "openai/gpt-5.6-luna" });
  const baselineEnvelope = buildReplayEnvelope({ fixture, capsule, policy: baselinePolicy, mode: "baseline" });
  const candidateEnvelope = buildReplayEnvelope({ fixture, capsule, policy: candidatePolicy, mode: "candidate" });
  const [baseline, output] = await Promise.all([producer.complete(baselineEnvelope), producer.complete(candidateEnvelope)]);
  const evaluation = await core.evaluate_pair(baseline, output, {
    fixture,
    evaluatorId: "openai/gpt-5.6-luna",
    judgeRepeats: 3,
    judge: async ({ outputs, repetition }) => {
      const judged = await evaluator.complete({ messages: [{ role: "system", content: "Independently choose A, B, or tie. Prefer grounded, useful, concise answers that satisfy the rubric without leakage. Return JSON with choice and rationale." }, { role: "user", content: JSON.stringify({ fixture, outputs, blinded_vote: repetition + 1 }) }] });
      const match = judged.text.match(/\{[\s\S]*\}/);
      try { return JSON.parse(match ? match[0] : judged.text); } catch { return { preference: "tie", rationale: judged.text }; }
    }
  });
  const state = core.experiments.recordProspective(candidateId, {
    episode_id: fixture.id,
    occurred_at: input.occurred_at,
    prompt: fixture.prompt,
    source: { kind: "real_interaction", surface: String(input.surface || "manual-capture") },
    fixture,
    baseline,
    candidate: output,
    evaluation
  });
  console.log(JSON.stringify({ candidate_id: candidateId, state: state.state, validations: state.validations, passed: evaluation.passed, votes: evaluation.judge.counts }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
