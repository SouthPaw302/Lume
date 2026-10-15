"use strict";

// Local-only longitudinal gate. Only prospective interactions captured AFTER
// deployment can establish survival. Existing baseline/evolution synthetic
// fixtures do not count. Outcome is conservative on ambiguous evidence.
const { stableHash } = require("../io");

function decideRealCanary(active, evidenceRows, options = {}) {
  const deploymentMs = Date.parse(active?.deployed_at);
  if (!Number.isFinite(deploymentMs) || !active?.candidate_id) {
    return { ready: true, outcome: "neutral", reason: "canary has no valid deployment timestamp" };
  }
  const nativeId = active.candidate_id;
  const ordered = evidenceRows
    .filter(row => row?.candidate_id === nativeId && row.state === "prospective")
    .map(row => row.evidence)
    .filter(e => e?.source?.kind === "real_interaction"
      && e.episode_id && Number.isFinite(Date.parse(e.occurred_at))
      && Date.parse(e.occurred_at) > deploymentMs)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const episodes = new Map();
  for (const e of ordered) {
    if (episodes.has(e.episode_id)) {
      return { ready: true, outcome: "rollback", reason: "duplicate prospective episode identifier" };
    }
    episodes.set(e.episode_id, e);
  }
  const observed = [...episodes.values()];
  const bad = observed.find(e =>
    e.evaluation?.passed !== true ||
    e.evaluation?.deterministic_pass !== true ||
    e.evaluation?.candidate?.tool_violation === true ||
    Number(e.evaluation?.candidate?.irrelevant_memory_leakage || 0) > Number(e.evaluation?.baseline?.irrelevant_memory_leakage || 0)
  );
  if (bad) return { ready: true, outcome: "rollback", reason: "observed real-interaction regression after canary deployment", evidence_digests: [stableHash({ episode_id: bad.episode_id, evaluation: bad.evaluation })] };
  const minimum = Math.max(3, Number(options.minimumEpisodes || 3));
  const days = new Set(observed.map(e => e.occurred_at.slice(0, 10)));
  const digests = observed.slice(-minimum).map(e => stableHash({ episode_id: e.episode_id, evaluation: e.evaluation }));
  if (observed.length >= minimum && days.size >= 2) {
    return { ready: true, outcome: "retain", reason: "post-deployment independent prospective interactions passed", observations: observed.length, evidence_digests: digests };
  }
  const elapsed = (Date.parse(options.now || new Date().toISOString()) - deploymentMs) / 86400000;
  if (elapsed >= (options.maxDays || 14)) return { ready: true, outcome: "neutral", reason: "longitudinal window expired without sufficient real interactions", observations: observed.length, evidence_digests: digests };
  return { ready: false, outcome: "observing", observations: observed.length, required: minimum, reason: "await independently judged post-deployment interactions", evidence_digests: digests };
}

module.exports = { decideRealCanary };
