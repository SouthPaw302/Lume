"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluatePair } = require("../src/evaluation");

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
