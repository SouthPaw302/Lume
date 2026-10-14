"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { ExperimentEngine } = require("../src/experiment-engine");

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lume-engine-"));
  const engine = new ExperimentEngine({ candidatesPath: path.join(dir, "candidates.jsonl"), evidencePath: path.join(dir, "evidence.jsonl"), ledgerPath: path.join(dir, "ledger.jsonl"), livePolicyPath: path.join(dir, "live.json"), policyHistoryPath: path.join(dir, "history"), clock: () => new Date("2026-10-13T00:00:00Z") });
  return { dir, engine };
}

test("candidate runs are isolated from writes and tools", async () => {
  const { engine } = setup();
  const candidate = engine.propose({ hypothesis: "test", mutation: { target: "initiative_threshold", operator: "strengthen", magnitude: 0.05 }, source: { kind: "test" } });
  const calls = [];
  await engine.runEpisode({ candidateId: candidate.id, fixture: { id: "f" }, baselinePolicy: { initiative_threshold: 0.5 }, runner: async input => { calls.push(input); return { text: "result" }; } });
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.writes === false && call.tools.length === 0));
});

test("promotion requires validation, approval signature, and supports rollback", () => {
  const { engine } = setup(); const key = "a-development-only-key-long-enough";
  let candidate = engine.propose({ hypothesis: "test", mutation: { target: "initiative_threshold", operator: "strengthen", magnitude: 0.05 }, source: { kind: "test" } });
  assert.throws(() => engine.approve(candidate.id, { key }), /promotion gates/);
  candidate = engine.transition(candidate.id, "shadow_tested"); candidate = engine.transition(candidate.id, "exercised"); candidate = engine.transition(candidate.id, "validated", { validations: 2, regression_free: true });
  engine.approve(candidate.id, { key }); const promoted = engine.promote(candidate.id, { key });
  assert.equal(promoted.after.initiative_threshold, 0.05);
  const rollback = engine.rollback(candidate.id, "test rollback"); assert.deepEqual(rollback.restored, {});
});

test("ineffective candidates can be rejected and cannot be revived", () => {
  const { engine } = setup();
  const candidate = engine.propose({ hypothesis: "no measurable effect", mutation: { target: "context_depth", operator: "strengthen", magnitude: 0 }, source: { kind: "negative-control" } });
  const rejected = engine.transition(candidate.id, "rejected", { reason: "matched the negative control" });
  assert.equal(rejected.state, "rejected");
  assert.throws(() => engine.transition(candidate.id, "shadow_tested"), /invalid transition/);
  assert.throws(() => engine.approve(candidate.id, { key: "a-development-only-key-long-enough" }), /promotion gates/);
});

test("approval card exposes evidence, tradeoffs, and rollback before signing", () => {
  const { engine } = setup();
  let candidate = engine.propose({ hypothesis: "more patient repair", mutation: { target: "repair_patience", operator: "strengthen", magnitude: 0.1 }, source: { kind: "reflection" } });
  candidate = engine.transition(candidate.id, "shadow_tested", { fixture_id: "dev-1" });
  candidate = engine.transition(candidate.id, "exercised", { fixture_id: "hidden-1" });
  candidate = engine.transition(candidate.id, "validated", { validations: 2, regression_free: true, fixture_id: "future-1" });
  const card = engine.approvalCard(candidate.id);
  assert.equal(card.approval_ready, true);
  assert.equal(card.affected_behavior, "repair_patience");
  assert.match(card.rollback_action, /^rollback:/);
  assert.ok(card.evidence.length >= 3);
  assert.ok(card.tradeoffs.length > 0);
});

test("two distinct future real interactions validate an exercised candidate", () => {
  const { engine } = setup();
  let candidate = engine.propose({ hypothesis: "correction precedence", mutation: { target: "reflection_strategy", operator: "split", variants: ["correction_supersession"] }, source: { kind: "test" } });
  candidate = engine.transition(candidate.id, "shadow_tested");
  candidate = engine.transition(candidate.id, "exercised", { results: [{ group: "regression", evaluation: { deterministic_pass: true } }] });
  const evidence = episode => ({ episode_id: episode, occurred_at: "2026-10-14T00:00:00Z", prompt: `future ${episode}`, source: { kind: "real_interaction" }, evaluation: { passed: true } });
  const first = engine.recordProspective(candidate.id, evidence("future-1"));
  assert.equal(first.state, "exercised");
  assert.equal(first.validations, 1);
  const second = engine.recordProspective(candidate.id, evidence("future-2"));
  assert.equal(second.state, "validated");
  assert.equal(second.validations, 2);
  assert.equal(second.regression_free, true);
});

test("prospective evidence rejects fabricated timing and duplicate episodes", () => {
  const { engine } = setup();
  let candidate = engine.propose({ hypothesis: "test", mutation: { target: "initiative_threshold", operator: "strengthen", magnitude: 0.05 }, source: { kind: "test" } });
  candidate = engine.transition(candidate.id, "shadow_tested");
  candidate = engine.transition(candidate.id, "exercised", { results: [{ group: "regression", evaluation: { deterministic_pass: true } }] });
  assert.throws(() => engine.recordProspective(candidate.id, { episode_id: "old", occurred_at: "2026-10-12T00:00:00Z", source: { kind: "real_interaction" }, evaluation: { passed: true } }), /after candidate creation/);
  const valid = { episode_id: "future", occurred_at: "2026-10-14T00:00:00Z", source: { kind: "real_interaction" }, evaluation: { passed: true } };
  engine.recordProspective(candidate.id, valid);
  assert.throws(() => engine.recordProspective(candidate.id, valid), /already recorded/);
});
