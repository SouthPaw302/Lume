"use strict";

const { readJson } = require("./io");

async function buildCapsule({ query = "", context = {}, memory, identityPath, personalityPath }) {
  const identity = readJson(identityPath, {});
  const personality = readJson(personalityPath, { traits: {} });
  const memories = query ? await memory.retrieve(query, context.memoryPolicy || {}) : [];
  return {
    schema_version: 1,
    identity: {
      name: identity.name || "Lume",
      role: identity.role,
      voice_style: identity.voiceStyle,
      developmental_direction: identity.developmentalDirection,
      lineage: identity.lineage,
      principles: identity.principles || []
    },
    traits: Object.fromEntries(Object.entries(personality.traits || {}).map(([name, value]) => [name, {
      value: Number(value.value || 0), confidence: Number(value.confidence || 0), evidence_count: Number(value.evidence_count || 0)
    }])),
    memories: memories.map(row => ({
      id: row.id, type: row.type, truth_class: row.truth_class, text: row.text,
      confidence: row.confidence, provenance: row.provenance, retrieval_score: row.retrieval.score
    })),
    context: { objective: String(context.objective || "").slice(0, 1200), surface: String(context.surface || "unknown") }
  };
}

module.exports = { buildCapsule };
