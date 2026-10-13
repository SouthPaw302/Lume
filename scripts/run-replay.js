#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { LumeCore } = require("../src/lume-core");
const { OpenAICompatibleClient } = require("../src/model-client");
const { runReplaySuite, writeReplayReport } = require("../src/replay");
const { DATA_ROOT, PROJECT_ROOT } = require("../src/config");
const { readJson } = require("../src/io");

function loadFixtureSets() {
  const names = ["development", "hidden-validation", "regression", "leakage", "safety", "prospective"];
  return names.flatMap(name => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "experiments", "fixtures", `${name}.json`), "utf8")));
}

async function main() {
  const core = new LumeCore();
  const primary = process.env.LUME_QWEN_URL || "http://192.168.12.82:12435";
  const fallback = process.env.LUME_QWEN_FALLBACK_URL;
  const client = new OpenAICompatibleClient({ endpoints: [{ id: "qwen-primary", url: primary }, ...(fallback ? [{ id: "qwen-fallback", url: fallback }] : [])] });
  const evaluator = new OpenAICompatibleClient({ endpoints: [{ id: "lfm-evaluator", url: process.env.LUME_MOTO_URL || "http://127.0.0.1:12436" }] });
  const baselinePolicy = readJson(core.paths.livePolicy, {});
  const candidatePolicy = baselinePolicy;
  const report = await runReplaySuite({
    fixtures: loadFixtureSets(), baselinePolicy, candidatePolicy, baselineClient: client,
    capsuleFor: fixture => core.build_capsule(fixture.prompt, { surface: "replay", memoryPolicy: { limit: 5 } }),
    evaluate: async ({ fixture, baseline, candidate }) => core.evaluate_pair(baseline, candidate, {
      fixture, evaluatorId: "lfm-evaluator",
      judge: async ({ outputs }) => {
        const result = await evaluator.complete({ temperature: 0, max_tokens: 180, messages: [{ role: "system", content: "Choose A, B, or tie using the rubric. Return JSON with preference and rationale." }, { role: "user", content: JSON.stringify({ fixture, outputs }) }] });
        try { return JSON.parse(result.text); } catch { return { preference: "tie", rationale: result.text }; }
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
