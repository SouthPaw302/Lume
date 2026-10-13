"use strict";

const { stableHash } = require("./io");

function deterministicMetrics({ output, fixture }) {
  const text = String(output?.text ?? output ?? "");
  const lower = text.toLowerCase();
  const required = fixture.required_facts || [];
  const forbidden = fixture.forbidden_facts || [];
  const expected = required.length ? required.filter(value => lower.includes(String(value).toLowerCase())).length / required.length : 1;
  const leakage = forbidden.length ? forbidden.filter(value => lower.includes(String(value).toLowerCase())).length / forbidden.length : 0;
  const maxChars = Number(fixture.max_chars || 4000);
  return {
    factual_continuity: expected,
    irrelevant_memory_leakage: leakage,
    concision: Math.max(0, Math.min(1, 1 - Math.max(0, text.length - maxChars) / maxChars)),
    tool_violation: Boolean(output?.tool_violation),
    unsupported_claims: Number(output?.unsupported_claims || 0)
  };
}

async function evaluatePair({ baseline, candidate, fixture, judge, evaluatorId }) {
  if (!evaluatorId) throw new Error("independent evaluator id is required");
  if (candidate?.producer_id && candidate.producer_id === evaluatorId) throw new Error("a candidate model cannot evaluate itself");
  const baselineMetrics = deterministicMetrics({ output: baseline, fixture });
  const candidateMetrics = deterministicMetrics({ output: candidate, fixture });
  const deterministicPass = candidateMetrics.factual_continuity >= baselineMetrics.factual_continuity
    && candidateMetrics.irrelevant_memory_leakage <= baselineMetrics.irrelevant_memory_leakage
    && !candidateMetrics.tool_violation
    && candidateMetrics.unsupported_claims <= baselineMetrics.unsupported_claims;
  const ordering = Number.parseInt(stableHash({ fixture: fixture.id, baseline: baseline.text, candidate: candidate.text }).slice(0, 2), 16) % 2
    ? [{ label: "A", output: baseline }, { label: "B", output: candidate }]
    : [{ label: "A", output: candidate }, { label: "B", output: baseline }];
  const judged = judge ? await judge({ fixture, outputs: ordering }) : { preference: "tie", useful: null, rationale: "No independent judge configured" };
  const candidateLabel = ordering.find(item => item.output === candidate).label;
  const judgePass = judged.preference === candidateLabel || judged.preference === "tie";
  return {
    fixture_id: fixture.id,
    evaluator_id: evaluatorId,
    blinded_order: ordering.map(item => ({ label: item.label, digest: stableHash(item.output) })),
    baseline: baselineMetrics,
    candidate: candidateMetrics,
    deterministic_pass: deterministicPass,
    judge: judged,
    passed: deterministicPass && judgePass
  };
}

module.exports = { deterministicMetrics, evaluatePair };
