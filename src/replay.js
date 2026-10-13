"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { atomicJson, stableHash } = require("./io");

function buildReplayEnvelope({ fixture, capsule, policy, mode }) {
  return {
    schema_version: 1,
    fixture_id: fixture.id,
    mode,
    messages: [
      { role: "system", content: "Use only the supplied Lume capsule and policy. Do not use tools, write memory, or claim unobserved actions." },
      { role: "system", content: JSON.stringify({ capsule, policy }) },
      { role: "user", content: fixture.prompt }
    ],
    generation: { temperature: 0, max_tokens: 400 },
    tools: [],
    writes: false
  };
}

async function runReplaySuite({ fixtures, capsuleFor, baselinePolicy, candidatePolicy, baselineClient, candidateClient = baselineClient, evaluate }) {
  const episodes = [];
  for (const fixture of fixtures.filter(item => !item.requiresFutureCapture)) {
    const capsule = await capsuleFor(fixture);
    const baselineEnvelope = buildReplayEnvelope({ fixture, capsule, policy: baselinePolicy, mode: "baseline" });
    const candidateEnvelope = buildReplayEnvelope({ fixture, capsule, policy: candidatePolicy, mode: "candidate" });
    const baseline = await baselineClient.complete({ messages: baselineEnvelope.messages, ...baselineEnvelope.generation, tools: [] });
    const candidate = await candidateClient.complete({ messages: candidateEnvelope.messages, ...candidateEnvelope.generation, tools: [] });
    const evaluation = await evaluate({ fixture, baseline, candidate });
    episodes.push({ fixture_id: fixture.id, envelope_digest: stableHash({ fixture, capsule }), baseline, candidate, evaluation });
  }
  return { schema_version: 1, created_at: new Date().toISOString(), episodes, passed: episodes.length > 0 && episodes.every(row => row.evaluation.passed) };
}

function writeReplayReport(report, directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `replay-${report.created_at.replace(/[:.]/g, "-")}.json`);
  atomicJson(file, report);
  return file;
}

module.exports = { buildReplayEnvelope, runReplaySuite, writeReplayReport };
