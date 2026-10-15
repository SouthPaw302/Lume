"use strict";

// Candidate eligibility is based on independently evaluated local interaction
// records, never deterministic seeds, heuristic fitness, or hosted CI status.
// Raw prospective evidence remains outside the public repository.
function evidenceGate(candidateId, rows = [], options = {}) {
  const minimumEpisodes = Math.max(2, Number(options.minimumEpisodes || 2));
  const approved = new Map();
  for (const row of rows) {
    if (row?.candidate_id !== candidateId || row.state !== "prospective") continue;
    const e = row.evidence;
    const evaluation = e?.evaluation;
    if (e?.source?.kind !== "real_interaction" || !e.episode_id) continue;
    if (!Number.isFinite(Date.parse(e.occurred_at))) continue;
    if (!e.baseline || !e.candidate || !evaluation) continue;
    if (evaluation.passed !== true || evaluation.deterministic_pass !== true) continue;
    if (evaluation.candidate?.tool_violation || Number(evaluation.candidate?.irrelevant_memory_leakage || 0) > Number(evaluation.baseline?.irrelevant_memory_leakage || 0)) continue;
    const evaluator = String(evaluation.evaluator_id || "").trim();
    const model = String(e.candidate.model || e.candidate.producer_id || "").trim();
    if (!evaluator || !model || evaluator === model) continue;
    if (!Array.isArray(evaluation.judge?.votes) || !evaluation.judge.votes.length) continue;
    approved.set(String(e.episode_id), e);
  }
  const episodes = [...approved.values()].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const days = new Set(episodes.map(e => e.occurred_at.slice(0, 10)));
  const eligible = episodes.length >= minimumEpisodes && days.size >= 2;
  return {
    eligible,
    kind: "independent_prospective_evidence",
    passed_episodes: episodes.length,
    observed_days: days.size,
    reason: eligible ? "independent prospective evidence meets minimum gate" : "requires two separately dated real interactions with independent evaluation, regression safety, and no leakage",
    // Do not copy prompts, private memories, transcripts or raw model outputs into state/reports.
    evidence_ids: episodes.map(e => e.episode_id)
  };
}

module.exports = { evidenceGate };
