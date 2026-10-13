"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { compilePolicy } = require("../src/policy");

test("bounded policy values compile into observable instructions", () => {
  const instructions = compilePolicy({ uncertainty_threshold: 0.1, retrieval_depth: 2 });
  assert.ok(instructions.some(text => text.includes("canon")));
  assert.ok(instructions.some(text => text.includes("unrelated personal context")));
  assert.deepEqual(compilePolicy({}), []);
});

test("split reflection policy is conditional rather than globally intrusive", () => {
  const instructions = compilePolicy({ reflection_strategy: { strategy: "split", variants: ["direct_answer", "conditional_provenance"] } });
  assert.match(instructions[0], /directly first/);
  assert.match(instructions[0], /only when/);
  assert.match(instructions[0], /unrelated questions/);
});
