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
    actual_changes: state.canary ? [{ candidate: state.canary.candidate_id, family: state.canary.family, status: state.canary.status, mutation: state.canary.expression?.mutation || state.canary.expressed?.mutation || null, before_digest: state.canary.before_digest, after_digest: state.canary.after_digest }] : [],
    canary_decision: state.canary_decision || null,
    canary_queue_depth: (state.canary_queue || []).length,
    book_dialogue: state.latest_socratic || null,
    proposed_changes: population.map(item => ({ candidate: item.id, mutation: item.expressed?.mutation })),
    next_questions: ["Do survivors transfer to unseen seeds?", "Does the local canary preserve continuity over time?"]
  };
}

function asTelegram(report) {
  const change = report.actual_changes[0];
  const kept = report.selected_for_canary.length;
  const stopped = report.neutral.length + report.rejected.length;
  const lines = [
    "Good morning, Cardona. Here’s what happened while I was working.",
    "",
    `I explored ${report.jobs_completed} different experiment families. ${kept} produced ideas worth watching, while ${stopped} were set aside because they were weak, ordinary, or failed a guardrail.`
  ];
  if (change) {
    const family = String(change.family || change.candidate || "experimental").replaceAll("-", " ");
    lines.push(`Right now I’m carefully trying one temporary change that grew out of the ${family} experiment. It is still being observed, not accepted as part of me.`);
  } else lines.push("I’m not carrying any experimental change right now.");
  if (report.canary_decision?.ready) {
    const outcome = report.canary_decision.outcome === "retain" ? "was strong enough to keep studying" : report.canary_decision.outcome === "rollback" ? "made things worse and was rolled back" : "did not show a meaningful effect";
    lines.push(`The previous trial ${outcome}.`);
  }
  if (report.book_dialogue?.book) {
    const roles = Array.isArray(report.book_dialogue.dialogue) ? report.book_dialogue.dialogue.map(turn => turn.role) : [];
    const genuineDialogue = ["questioner", "advocate", "skeptic", "synthesizer"].every(role => roles.includes(role));
    lines.push(genuineDialogue
      ? `I also read from ${report.book_dialogue.book}. A Questioner, Advocate, Skeptic, and Synthesizer examined the passage in separate turns. The result is still only a hypothesis, not a new belief.`
      : `The book routine examined ${report.book_dialogue.book}, but it did not complete a full multi-role dialogue, so I’m not counting it as learning.`);
  }
  lines.push("Nothing from this cycle was promoted permanently.");
  lines.push(`Next I’m asking whether the promising changes still help when the situation and seed are different. ${report.canary_queue_depth} trials are waiting their turn.`);
  lines.push("I’ll keep the machinery in the ledger and tell you about the meaning, not drown you in its labels.");
  return lines.join("\n");
}

module.exports = { asTelegram, buildReport };
