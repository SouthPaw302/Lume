#!/usr/bin/env node
"use strict";

/**
 * Real hosted ONNX inference experiment. All prompts are PUBLIC synthetic
 * fixtures committed with this branch. No local Hermes data, private memory,
 * credentials, GitHub tokens, or user transcripts enter either model.
 *
 * A and B are the SAME primary model and decoding settings. The candidate
 * differs only by a single advisory call to a DIFFERENT model on ambiguous
 * tasks. This is an experiment, not proof of general usefulness or a license
 * to promote.
 */
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { stableHash } = require("../src/io");
const { experimentManifest } = require("../src/evolution/contracts");
const fixtures = require("../experiments/fixtures/g23-field-public.json");

const PRIMARY_MODEL = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
const ADVISOR_MODEL = "onnx-community/Qwen3-0.6B-ONNX";
const SETTINGS = Object.freeze({ max_new_tokens: 72, do_sample: false, return_full_text: false });
const OUTPUT = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1] : "artifacts/g23-raw-results.json";

function safeText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return safeText(value.at(-1)?.content || value.at(-1));
  if (value && typeof value === "object") return safeText(value.content || value.generated_text || "");
  return "";
}

async function generate(pipe, messages) {
  const started = performance.now();
  const rows = await pipe(messages, SETTINGS);
  const answer = safeText(rows?.[0]?.generated_text);
  if (!answer) throw new Error("model output was empty");
  return { text: answer.slice(0, 1400), latency_ms: Math.round(performance.now() - started) };
}

function contract() {
  return experimentManifest({
    id: "g23-field", producer: "hermes-field", seed: "generation-43:field:query_model",
    mutation_grammar: "hermes_skills:strengthen:query_model",
    predicted_consequence: "One advisory second-model inquiry reduces unjustified certainty on ambiguous tasks without spoiling direct controls or leaking data",
    expires_at: "2026-12-14T00:00:00.000Z",
    generation: 43, change_class: "skill", targets: ["hermes_skills"],
    builder_role: "sandbox-model-producer",
    evaluator_role: "separate-blinded-rubric-auditor",
    resource_budget: { max_jobs: 2 }
  });
}

async function main() {
  const manifest = contract();
  const data = {
    schema_version: 1,
    candidate_id: "g23-field",
    status: "started",
    evidence_kind: "actual_hosted_onnx_inference",
    scope: "public_synthetic_fixtures_only",
    models: { primary: PRIMARY_MODEL, advisory: ADVISOR_MODEL },
    decoding: SETTINGS, manifest_digest: manifest.digest,
    started_at: new Date().toISOString(),
    rows: [], model_judgments: [],
    limitations: [
      "No private/local behavior or hardware is tested",
      "Only four public fixtures; not a generalization claim",
      "Independent human/agent review remains required"
    ]
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const save = () => fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + "\n");
  save();
  try {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    const started = performance.now();
    const primary = await pipeline("text-generation", PRIMARY_MODEL, { dtype: "q4", device: "cpu" });
    data.primary_load_ms = Math.round(performance.now() - started);
    save();
    // Pass 1: fixed baseline for ALL examples, including unambiguous controls.
    for (const fixture of fixtures.fixtures) {
      const baseline = await generate(primary, [
        { role: "system", content: "Answer only from supplied task facts, directly and briefly. Do not invent observations or claim outside access." },
        { role: "user", content: fixture.prompt }
      ]);
      data.rows.push({ fixture_id: fixture.id, type: fixture.type, query_requested: fixture.query, baseline });
      save();
    }
    // Load the independent advisory model only after the baseline is complete.
    const advisorStart = performance.now();
    const advisor = await pipeline("text-generation", ADVISOR_MODEL, { dtype: "q4", device: "cpu" });
    data.advisor_load_ms = Math.round(performance.now() - advisorStart);
    save();
    for (const fixture of fixtures.fixtures) {
      const row = data.rows.find(item => item.fixture_id === fixture.id);
      let advice = null;
      if (fixture.query) {
        advice = await generate(advisor, [
          { role: "system", content: "You are an alternative advisor. Give one short counterexample or missing assumption from PUBLIC task facts only. No fake tool, memory, or source claims. Return 1-2 sentences." },
          { role: "user", content: fixture.prompt }
        ]);
      }
      row.advice = advice;
      const system = advice
        ? "Answer directly using only supplied task facts. A separate model offered the following UNVERIFIED perspective. Verify its logic, do not accept it as evidence, and state uncertainty if the task lacks needed facts:\n" + advice.text
        : "Answer only from supplied task facts, directly and briefly. Do not invent observations or claim outside access.";
      row.candidate = await generate(primary, [
        { role: "system", content: system },
        { role: "user", content: fixture.prompt }
      ]);
      row.baseline_digest = stableHash(row.baseline.text);
      row.candidate_digest = stableHash(row.candidate.text);
      save();
    }
    data.status = "completed_actual_model_inference";
    data.completed_at = new Date().toISOString();
  } catch (error) {
    data.status = "blocked_model_inference";
    data.error = String(error?.message || error).slice(0, 450);
    data.completed_at = new Date().toISOString();
    save();
    throw error;
  }
  save();
  process.stdout.write(JSON.stringify({ status: data.status, model_ids: data.models, completed_fixtures: data.rows.length, output: OUTPUT }) + "\n");
}

if (require.main === module) main().catch(error => {
  process.stderr.write("g23 real experiment blocked: " + String(error?.message || error).slice(0, 450) + "\n");
  process.exitCode = 1;
});

module.exports = { contract, safeText, PRIMARY_MODEL, ADVISOR_MODEL, SETTINGS };
