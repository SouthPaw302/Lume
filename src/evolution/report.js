"use strict";

function buildReport(state = {}, now = new Date()) {
  const population = state.population || [];
  return {
    schema_version: 1, verified_at: now.toISOString(), generation: state.generation || 0,
    jobs_completed: population.length, population_size: population.length,
    lineage_diversity: new Set(population.map(item => item.family)).size,
    selected_for_canary: state.survivors || [],
    neutral: population.filter(item => item.status === "neutral").map(item => item.id),
    rejected: population.filter(item => item.status === "rejected").map(item => item.id),
    actual_changes: state.canary ? [{ candidate: state.canary.candidate_id, status: state.canary.status, before_digest: state.canary.before_digest, after_digest: state.canary.after_digest }] : [],
    proposed_changes: population.map(item => ({ candidate: item.id, mutation: item.expressed?.mutation })),
    next_questions: ["Do survivors transfer to unseen seeds?", "Does the local canary preserve continuity over time?"]
  };
}

function asTelegram(report) {
  const change = report.actual_changes[0];
  const lines = [`Lume emergence report — generation ${report.generation}`, `Ran ${report.jobs_completed} experiment families; lineage diversity ${report.lineage_diversity}.`, `Selected ${report.selected_for_canary.length}; neutral ${report.neutral.length}; rejected ${report.rejected.length}.`];
  if (change) lines.push(`Local canary ${change.candidate}: ${change.status}. This is the only applied experimental change.`);
  else lines.push("No experimental change is currently applied.");
  if (report.rejected.length) lines.push(`Rejected: ${report.rejected.join(", ")}.`);
  lines.push(`Next test: ${report.next_questions[0]}`);
  lines.push("OpenAI narration was not required; this report is generated from the verified ledger.");
  return lines.join("\n");
}

module.exports = { asTelegram, buildReport };
