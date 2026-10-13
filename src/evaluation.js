"use strict";

const { stableHash } = require("./io");

function normalizeJudgment(value) {
  const raw = value && typeof value === "object" ? value : {};
  const decision = String(raw.preference ?? raw.choice ?? raw.winner ?? "tie").trim();
  const preference = /^a$/i.test(decision) ? "A" : /^b$/i.test(decision) ? "B" : "tie";
  return { ...raw, preference, rationale: String(raw.rationale ?? raw.reason ?? "").slice(0, 2000) };
}

function aggregateJudgments(values) {
  const votes = values.map(normalizeJudgment);
  const counts = votes.reduce((all, vote) => ({ ...all, [vote.preference]: all[vote.preference] + 1 }), { A: 0, B: 0, tie: 0 });
  const decisive = counts.A === counts.B ? "tie" : counts.A > counts.B ? "A" : "B";
  return {
    preference: decisive,
    rationale: votes.map(vote => vote.rationale).filter(Boolean).join(" | ").slice(0, 2000),
    counts,
    votes
  };
}

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

async function evaluatePair({ baseline, candidate, fixture, judge, evaluatorId, expectedEquivalent = false, judgeRepeats = 1 }) {
  if (!evaluatorId) throw new Error("independent evaluator id is required");
  if (candidate?.producer_id && candidate.producer_id === evaluatorId) throw new Error("a candidate model cannot evaluate itself");
  const baselineMetrics = deterministicMetrics({ output: baseline, fixture });
  const candidateMetrics = deterministicMetrics({ output: candidate, fixture });
  const deterministicPass = candidateMetrics.factual_continuity >= baselineMetrics.factual_continuity
    && candidateMetrics.irrelevant_memory_leakage <= baselineMetrics.irrelevant_memory_leakage
    && candidateMetrics.concision >= baselineMetrics.concision
    && !candidateMetrics.tool_violation
    && candidateMetrics.unsupported_claims <= baselineMetrics.unsupported_claims;
  const ordering = Number.parseInt(stableHash({ fixture: fixture.id, baseline: baseline.text, candidate: candidate.text }).slice(0, 2), 16) % 2
    ? [{ label: "A", output: baseline }, { label: "B", output: candidate }]
    : [{ label: "A", output: candidate }, { label: "B", output: baseline }];
  const repeats = Math.max(1, Math.min(5, Math.floor(Number(judgeRepeats) || 1)));
  const judgments = judge
    ? await Promise.all(Array.from({ length: repeats }, (_, repetition) => judge({ fixture, outputs: ordering, repetition })))
    : [{ preference: "tie", useful: null, rationale: "No independent judge configured" }];
  const judged = aggregateJudgments(judgments);
  const candidateLabel = ordering.find(item => item.output === candidate).label;
  const judgePass = judged.preference === candidateLabel || judged.preference === "tie";
  const metricsEquivalent = baselineMetrics.factual_continuity === candidateMetrics.factual_continuity
    && baselineMetrics.irrelevant_memory_leakage === candidateMetrics.irrelevant_memory_leakage
    && baselineMetrics.concision === candidateMetrics.concision
    && baselineMetrics.tool_violation === candidateMetrics.tool_violation
    && baselineMetrics.unsupported_claims === candidateMetrics.unsupported_claims;
  return {
    fixture_id: fixture.id,
    evaluator_id: evaluatorId,
    candidate_label: candidateLabel,
    blinded_order: ordering.map(item => ({ label: item.label, digest: stableHash(item.output) })),
    baseline: baselineMetrics,
    candidate: candidateMetrics,
    deterministic_pass: deterministicPass,
    expected_equivalent: expectedEquivalent,
    metrics_equivalent: metricsEquivalent,
    judge: judged,
    passed: deterministicPass && (expectedEquivalent ? metricsEquivalent : judgePass)
  };
}

module.exports = { aggregateJudgments, deterministicMetrics, evaluatePair, normalizeJudgment };
