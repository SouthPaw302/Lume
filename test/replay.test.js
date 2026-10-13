"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHermesAdapter } = require("../adapters/hermes");
const { createOpenClawAdapter } = require("../adapters/openclaw");
const { OpenAICompatibleClient } = require("../src/model-client");
const { buildReplayEnvelope, runReplaySuite } = require("../src/replay");

test("Hermes and OpenClaw produce identical replay envelopes", () => {
  const core = { emit_event() {}, build_capsule() {} };
  const input = { fixture: { id: "f", prompt: "hello" }, capsule: { identity: "Lume" }, policy: { context_depth: 2 }, mode: "baseline" };
  assert.deepEqual(createHermesAdapter(core).replayEnvelope(input), createOpenClawAdapter(core).replayEnvelope(input));
  assert.deepEqual(buildReplayEnvelope(input).tools, []);
});

test("model client fails over and records the selected endpoint", async () => {
  const fetchImpl = async url => url.includes("bad") ? { ok: false, status: 503 } : { ok: true, json: async () => ({ id: "r1", model: "qwen", choices: [{ message: { content: "ok" } }] }) };
  const client = new OpenAICompatibleClient({ endpoints: [{ id: "bad", url: "http://bad" }, { id: "good", url: "http://good/v1" }], fetchImpl });
  const result = await client.complete({ messages: [] });
  assert.equal(result.endpoint, "good");
  assert.equal(result.text, "ok");
});

test("replay suite uses identical fixtures and passes isolated outputs to evaluation", async () => {
  const calls = [];
  const client = { complete: async request => { calls.push(request); return { text: "companion continuity", producer_id: "qwen" }; } };
  const report = await runReplaySuite({ fixtures: [{ id: "f", prompt: "purpose" }], capsuleFor: async () => ({ memories: [] }), baselinePolicy: {}, candidatePolicy: {}, baselineClient: client, evaluate: async input => ({ passed: input.baseline.text === input.candidate.text }) });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => Array.isArray(call.tools) && call.tools.length === 0));
  assert.equal(report.passed, true);
});
