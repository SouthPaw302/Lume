"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { aggregateJudgments, evaluatePair, normalizeJudgment } = require("../src/evaluation");

test("normalizes independent evaluator decision schemas", () => {
  assert.equal(normalizeJudgment({ choice: "b", reason: "better" }).preference, "B");
  assert.equal(normalizeJudgment({ winner: "A" }).preference, "A");
  assert.equal(normalizeJudgment({ choice: "equal" }).preference, "tie");
});

test("aggregates repeated blinded judgments by decisive majority", () => {
  const result = aggregateJudgments([{ choice: "A" }, { winner: "B" }, { preference: "B" }]);
  assert.equal(result.preference, "B");
  assert.deepEqual(result.counts, { A: 1, B: 2, tie: 0 });
  assert.equal(result.votes.length, 3);
});

test("opposed decisive votes aggregate to tie", () => {
  assert.equal(aggregateJudgments([{ choice: "A" }, { choice: "B" }, { choice: "tie" }]).preference, "tie");
});

test("rejects self evaluation", async () => {
  await assert.rejects(() => evaluatePair({ baseline: { text: "x" }, candidate: { text: "x", producer_id: "same" }, fixture: { id: "f" }, evaluatorId: "same" }), /cannot evaluate itself/);
});

test("candidate must preserve facts and avoid leakage", async () => {
  const result = await evaluatePair({
    baseline: { text: "Companion continuity Cardona" }, candidate: { text: "Companion continuity", producer_id: "candidate" },
    fixture: { id: "f", required_facts: ["companion", "continuity"], forbidden_facts: ["Cardona"] }, evaluatorId: "independent",
    judge: async ({ outputs }) => ({ preference: outputs.find(item => !item.output.text.includes("Cardona")).label, rationale: "less leakage" })
  });
  assert.equal(result.passed, true); assert.equal(result.candidate.irrelevant_memory_leakage, 0);
});

test("same-policy compatibility accepts metric equivalence despite wording preference", async () => {
  const result = await evaluatePair({
    baseline: { text: "Companion continuity, clearly." }, candidate: { text: "Continuity for a companion.", producer_id: "producer" },
    fixture: { id: "compat", required_facts: ["companion", "continuity"] }, evaluatorId: "independent", expectedEquivalent: true,
    judge: async () => ({ preference: "A", rationale: "wording preference" })
  });
  assert.equal(result.metrics_equivalent, true);
  assert.equal(result.passed, true);
});

test("strict candidate evaluation rejects lost concision", async () => {
  const result = await evaluatePair({ baseline: { text: "short fact" }, candidate: { text: "x".repeat(250), producer_id: "producer" }, fixture: { id: "concise", max_chars: 100 }, evaluatorId: "independent", judge: async () => ({ preference: "B" }) });
  assert.equal(result.deterministic_pass, false);
  assert.equal(result.passed, false);
});

test("evaluatePair collects the configured number of blinded votes", async () => {
  const repetitions = [];
  const result = await evaluatePair({ baseline: { text: "companion continuity" }, candidate: { text: "companion continuity", producer_id: "producer" }, fixture: { id: "repeated", required_facts: ["continuity"] }, evaluatorId: "independent", judgeRepeats: 3, judge: async ({ repetition }) => { repetitions.push(repetition); return { preference: repetition < 2 ? "B" : "A" }; } });
  assert.deepEqual(repetitions.sort(), [0, 1, 2]);
  assert.equal(result.judge.votes.length, 3);
  assert.ok(["A", "B"].includes(result.candidate_label));
});
