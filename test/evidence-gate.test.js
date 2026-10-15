"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evidenceGate } = require("../src/evolution/evidence-gate");

function trial(id, day, overrides = {}) {
  return {
    candidate_id: "g43-field",
    state: "prospective",
    evidence: {
      episode_id: id,
      occurred_at: day + "T18:00:00.000Z",
      source: { kind: "real_interaction" },
      baseline: { text: "baseline", model: "openai/gpt-5.6-sol" },
      candidate: { text: "candidate", model: "openai/gpt-5.6-sol" },
      evaluation: {
        passed: true,
        deterministic_pass: true,
        evaluator_id: "openai/gpt-5.6-luna",
        baseline: { irrelevant_memory_leakage: 0 },
        candidate: { irrelevant_memory_leakage: 0, tool_violation: false },
        judge: { votes: [{ preference: "B" }, { preference: "B" }, { preference: "tie" }] }
      },
      ...overrides
    }
  };
}

test("synthetic/no-evidence generations must never become live canaries", () => {
  assert.equal(evidenceGate("g43-field", []).eligible, false);
  assert.equal(evidenceGate("g43-field", [{ candidate_id: "g43-field", state: "shadow_tested", evidence: {} }]).eligible, false);
  assert.equal(evidenceGate("g43-field", [trial("one", "2026-10-14")]).eligible, false);
});

test("two independently scored real interactions on separate days qualify", () => {
  const rows = [trial("one", "2026-10-14"), trial("two", "2026-10-15")];
  const result = evidenceGate("g43-field", rows);
  assert.equal(result.eligible, true);
  assert.equal(result.passed_episodes, 2);
  assert.equal(result.observed_days, 2);
  assert.equal(result.evidence_ids.length, 2);
});

test("duplicate episode IDs and same-day interactions do not qualify", () => {
  assert.equal(evidenceGate("g43-field", [trial("same", "2026-10-14"), trial("same", "2026-10-15")]).eligible, false);
  assert.equal(evidenceGate("g43-field", [trial("one", "2026-10-14"), trial("two", "2026-10-14")]).eligible, false);
});

test("reject self-scoring, missing judged votes, regression, leakage, and fabricated source", () => {
  const good = trial("good", "2026-10-14");
  const bad = [
    trial("self", "2026-10-15", { evaluation: { ...good.evidence.evaluation, evaluator_id: "openai/gpt-5.6-sol" } }),
    trial("judgeless", "2026-10-16", { evaluation: { ...good.evidence.evaluation, judge: { votes: [] } } }),
    trial("regress", "2026-10-17", { evaluation: { ...good.evidence.evaluation, deterministic_pass: false } }),
    trial("leak", "2026-10-18", { evaluation: { ...good.evidence.evaluation, candidate: { irrelevant_memory_leakage: 1, tool_violation: false } } }),
    trial("proxy", "2026-10-19", { source: { kind: "deterministic_transfer_proxy" } }),
    trial("wrongCandidate", "2026-10-20")
  ];
  bad[5].candidate_id = "g44-field";
  const output = evidenceGate("g43-field", [good, ...bad]);
  assert.equal(output.eligible, false);
  assert.deepEqual(output.evidence_ids, ["good"]);
});
