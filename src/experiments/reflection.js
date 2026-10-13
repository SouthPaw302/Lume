"use strict";

function proposeReflection({ episode, observation, correction, hypothesis, mutation, expires_at }) {
  if (!episode?.id) throw new Error("reflection requires an observed episode");
  if (!observation || !hypothesis || !mutation) throw new Error("reflection requires observation, hypothesis, and mutation");
  return {
    source_kind: "self_reflection",
    source_episode_id: episode.id,
    observation: String(observation).slice(0, 1000),
    correction: String(correction || "").slice(0, 1000),
    hypothesis: String(hypothesis).slice(0, 1000),
    mutation,
    expires_at,
    may_self_score: false
  };
}

function proposeFromBook({ citation, passage, recentEpisode, interpretations, hypothesis, mutation, expires_at }) {
  if (!citation || !passage || !recentEpisode?.id) throw new Error("book proposal requires citation, passage, and recent episode");
  if (!Array.isArray(interpretations) || interpretations.length < 2) throw new Error("book proposal requires competing interpretations");
  return {
    source_kind: "book_reflection",
    citation,
    passage_digest_input: String(passage).slice(0, 2000),
    source_episode_id: recentEpisode.id,
    interpretations: interpretations.map(value => String(value).slice(0, 1000)),
    hypothesis: String(hypothesis).slice(0, 1000),
    mutation,
    expires_at,
    may_self_score: false
  };
}

module.exports = { proposeFromBook, proposeReflection };
