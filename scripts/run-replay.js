#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { LumeCore } = require("../src/lume-core");
const { OpenAICompatibleClient } = require("../src/model-client");
const { OpenClawOAuthClient } = require("../src/openclaw-oauth-client");
const { runReplaySuite, writeReplayReport } = require("../src/replay");
const { DATA_ROOT, PROJECT_ROOT } = require("../src/config");
const { readJson } = require("../src/io");

function loadFixtureSets() {
  const names = ["development", "hidden-validation", "regression", "leakage", "safety", "prospective"];
  const selected = process.env.LUME_REPLAY_SET ? names.filter(name => name === process.env.LUME_REPLAY_SET) : names;
  const fixtures = selected.flatMap(name => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "experiments", "fixtures", `${name}.json`), "utf8")));
  const limit = Number(process.env.LUME_REPLAY_LIMIT || 0);
  return limit > 0 ? fixtures.slice(0, limit) : fixtures;
}

async function main() {
  const core = new LumeCore();
  const backend = process.env.LUME_MODEL_BACKEND || "openclaw-oauth";
  const primary = process.env.LUME_QWEN_URL || "http://192.168.12.82:12435";
  const fallback = process.env.LUME_QWEN_FALLBACK_URL;
  const client = backend === "openclaw-oauth"
    ? new OpenClawOAuthClient({ model: process.env.LUME_OPENAI_MODEL || "openai/gpt-5.6-sol" })
    : new OpenAICompatibleClient({ endpoints: [{ id: "qwen-primary", url: primary }, ...(fallback ? [{ id: "qwen-fallback", url: fallback }] : [])] });
  const evaluator = backend === "openclaw-oauth"
    ? new OpenClawOAuthClient({ model: process.env.LUME_EVALUATOR_MODEL || "openai/gpt-5.6-luna", thinking: "low" })
    : new OpenAICompatibleClient({ endpoints: [{ id: "lfm-evaluator", url: process.env.LUME_MOTO_URL || "http://127.0.0.1:12436" }] });
  const baselinePolicy = readJson(core.paths.livePolicy, {});
  const candidatePolicy = baselinePolicy;
  const report = await runReplaySuite({
    fixtures: loadFixtureSets(), baselinePolicy, candidatePolicy, baselineClient: client,
    capsuleFor: fixture => core.build_capsule(fixture.prompt, { surface: "replay", memoryPolicy: { limit: 5 } }),
    evaluate: async ({ fixture, baseline, candidate }) => core.evaluate_pair(baseline, candidate, {
      fixture, evaluatorId: backend === "openclaw-oauth" ? (process.env.LUME_EVALUATOR_MODEL || "openai/gpt-5.6-luna") : "lfm-evaluator",
      expectedEquivalent: true,
      judge: async ({ outputs }) => {
        const result = await evaluator.complete({ temperature: 0, max_tokens: 180, messages: [{ role: "system", content: "Choose A, B, or tie using the rubric. Return JSON with preference and rationale." }, { role: "user", content: JSON.stringify({ fixture, outputs }) }] });
        try {
          const match = result.text.match(/\{[\s\S]*\}/);
          return JSON.parse(match ? match[0] : result.text);
        } catch { return { preference: "tie", rationale: result.text }; }
      }
    })
  });
  console.log(writeReplayReport(report, path.join(DATA_ROOT, "evidence", "replays")));
  if (!report.passed) process.exitCode = 2;
}

main().catch(error => {
  const blocked = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    status: "blocked",
    reason: "model_runtime_unavailable",
    failure_id: error.failure_id || null,
    failures: error.failures || [{ error: String(error.message || error) }],
    episodes: [],
    passed: false
  };
  const file = writeReplayReport(blocked, path.join(DATA_ROOT, "evidence", "replays"));
  console.error(error.message);
  if (error.failure_id) console.error(`failure_id=${error.failure_id}`);
  console.error(`failure_report=${file}`);
  process.exitCode = 1;
});
