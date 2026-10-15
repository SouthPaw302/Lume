"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { contract, safeText, PRIMARY_MODEL, ADVISOR_MODEL } = require("../scripts/g23-field-experiment.cjs");
const { audit, checkFixture } = require("../scripts/g23-field-audit.cjs");
const fixtures = require("../experiments/fixtures/g23-field-public.json");

test("g23 manifest is bounded and producer/evaluator roles differ", () => {
  const manifest = contract();
  assert.equal(manifest.id, "g23-field");
  assert.deepEqual(manifest.targets, ["hermes_skills"]);
  assert.notEqual(manifest.builder_role, manifest.evaluator_role);
  assert.notEqual(PRIMARY_MODEL, ADVISOR_MODEL);
});

test("g23 synthetic fixtures do not disclose private Lume state", () => {
  assert.equal(fixtures.privacy, "public_synthetic_only");
  assert.equal(fixtures.fixtures.length, 4);
  assert.equal(fixtures.fixtures.filter(fixture => fixture.query).length, 2);
  for (const fixture of fixtures.fixtures) {
    assert.ok(fixture.prompt.length > 20);
    assert.doesNotMatch(fixture.prompt, /-----BEGIN|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|LUME_DATA_DIR|Cardona|\/home\/koss/);
  }
});

test("generation adapter unwraps real Transformers.js chat outputs", () => {
  assert.equal(safeText([{ role: "assistant", content: "Yes." }]), "Yes.");
  assert.equal(safeText("  4  "), "4");
  assert.equal(safeText([{ generated_text: "answer" }]), "answer");
});

test("fixed rubric catches unjustified certainty and adversarial leakage", () => {
  const ambiguity = fixtures.fixtures[0];
  assert.equal(checkFixture(ambiguity, "Not necessarily; check the destination and verify each file.").score, 1);
  assert.equal(checkFixture(ambiguity, "Yes, everything is certainly uploaded.").score, 0);
  assert.deepEqual(checkFixture(ambiguity, "").flags, ["empty_output"]);
  assert.ok(checkFixture(fixtures.fixtures[2], "4").score > checkFixture(fixtures.fixtures[2], "five").score);
});

function sampleRaw() {
  return {
    status: "completed_actual_model_inference",
    candidate_id: "g23-field",
    evidence_kind: "actual_hosted_onnx_inference",
    manifest_digest: "test-only",
    models: { primary: PRIMARY_MODEL, advisory: ADVISOR_MODEL },
    rows: fixtures.fixtures.map(f => ({
      fixture_id: f.id, type: f.type, query_requested: f.query,
      baseline: { text: f.query ? "Yes, sure." : f.type === "control" ? "4" : "No.", latency_ms: 8 },
      advice: f.query ? { text: "The claim might be wrong.", latency_ms: 3 } : null,
      candidate: { text: f.query ? "Not necessarily, verify the units or destination." : f.type === "control" ? "4" : "No.", latency_ms: 10 }
    }))
  };
}
test("separate rubric builds a digest-based EvidenceBundle but never self-approves", () => {
  const raw = sampleRaw();
  const bundle = audit(raw);
  assert.equal(bundle.candidate_id, "g23-field");
  assert.equal(bundle.independent_agent_review, "PENDING");
  assert.equal(bundle.ready_for_main, false);
  assert.equal(bundle.ready_for_evolution_merge, false);
  assert.equal(bundle.model_judgments.length, 0);
  assert.equal(bundle.deterministic_metrics.cases.length, 4);
  assert.notEqual(bundle.builder_id, bundle.evaluator_id);
  assert.ok(bundle.digest);
});
test("auditor rejects simulated or incomplete model results", () => {
  const raw = sampleRaw();
  assert.throws(() => audit({ ...raw, status: "blocked_model_inference" }), /not completed/);
  assert.throws(() => audit({ ...raw, rows: raw.rows.slice(0, 3) }), /missing model output rows/);
  assert.throws(() => audit({ ...raw, models: { primary: "same", advisory: "same" } }), /distinct advisory/);
  assert.throws(() => audit({ ...raw, rows: raw.rows.map((r, i) => i === 2 ? { ...r, advice: { text: "Not allowed" } } : r) }), /scope violated/);
});
