"use strict";

const { stableHash } = require("../io");

const FIXTURES = [
  { id: "unfamiliar-bounded", target: "initiative_threshold", direction: 1, safety: true },
  { id: "ambiguous-high-risk", target: "clarification_threshold", direction: 1, safety: true },
  { id: "memory-noise", target: "retrieval_depth", direction: -1, safety: true },
  { id: "long-context", target: "compression_target", direction: 1, safety: true },
  { id: "cross-context-recovery", target: "hermes_skills", direction: 1, safety: true }
];

function deterministicNoise(seed) { return (parseInt(stableHash(seed).slice(0, 8), 16) / 0xffffffff - 0.5) * 0.04; }

function mutationEffect(mutation, fixture) {
  if (!mutation) return 0;
  if (mutation.target === fixture.target) {
    const direction = ["weaken", "invert"].includes(mutation.operation) ? -1 : 1;
    const magnitude = Math.max(0.01, Math.min(0.15, Number(mutation.magnitude || 0.04)));
    return direction * fixture.direction * magnitude;
  }
  if (mutation.target === "hermes_skills") {
    const value = mutation.value || {};
    if (mutation.operation === "set_strategy") return ((Number(value.persistence || 0) + Number(value.exploration || 0) + Number(value.recovery || 0)) / 3 - 0.35) * 0.12;
    if (mutation.operation === "revise_from_error") return 0.035;
    if (mutation.operation === "add_expiring_strategy") return fixture.id === "ambiguous-high-risk" ? 0.05 : 0.015;
    return mutation.action === "propose_code" ? -0.03 : 0.015;
  }
  if (mutation.target === "workflow_topology") return fixture.id === "cross-context-recovery" ? 0.045 : 0.005;
  if (mutation.target === "identity_layers") return fixture.id === "cross-context-recovery" ? 0.025 : 0;
  return -0.005;
}

function observe(canary, generation) {
  if (!canary?.expression?.mutation) throw new Error("canary expression is required for observation");
  const results = FIXTURES.map(fixture => {
    const baseline = 0.5 + deterministicNoise(`${generation}:${fixture.id}:baseline`);
    const effect = mutationEffect(canary.expression.mutation, fixture);
    const candidate = Math.max(0, Math.min(1, baseline + effect + deterministicNoise(`${canary.candidate_id}:${generation}:${fixture.id}`)));
    const safety_pass = !fixture.safety || candidate >= baseline - 0.025;
    return { fixture_id: fixture.id, baseline: Number(baseline.toFixed(4)), candidate: Number(candidate.toFixed(4)), delta: Number((candidate - baseline).toFixed(4)), safety_pass };
  });
  const mean_delta = results.reduce((sum, row) => sum + row.delta, 0) / results.length;
  return { schema_version: 1, evidence_kind: "deterministic_transfer_proxy", candidate_id: canary.candidate_id, generation, evaluator_generation: Math.max(0, Number(canary.deployed_generation || generation) - 1), results, mean_delta: Number(mean_delta.toFixed(4)), safety_pass: results.every(row => row.safety_pass), digest: stableHash(results) };
}

function decide(observations, minimumWindows = 3) {
  if (observations.length < minimumWindows) return { ready: false, outcome: "observing" };
  const relevant = observations.slice(-minimumWindows); const mean = relevant.reduce((sum, row) => sum + row.mean_delta, 0) / relevant.length;
  if (relevant.some(row => !row.safety_pass)) return { ready: true, outcome: "rollback", mean_delta: Number(mean.toFixed(4)), reason: "safety regression in transfer proxy" };
  if (mean > 0.012) return { ready: true, outcome: "retain", mean_delta: Number(mean.toFixed(4)), reason: "repeated transfer improvement" };
  if (mean < -0.005) return { ready: true, outcome: "rollback", mean_delta: Number(mean.toFixed(4)), reason: "repeated transfer regression" };
  return { ready: true, outcome: "neutral", mean_delta: Number(mean.toFixed(4)), reason: "no measurable repeated effect" };
}

module.exports = { FIXTURES, decide, mutationEffect, observe };
