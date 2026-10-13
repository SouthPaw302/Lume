"use strict";
const fs = require("fs");
const path = require("path");
const { searchMemory } = require("./memory-adapter");

const LUME_ROOT = path.resolve(__dirname, "../..");
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; } }

function buildIdentityCapsule(query = "") {
  const identity = readJson(path.join(LUME_ROOT, "identity-profile.json"), {});
  const personality = readJson(path.join(LUME_ROOT, "personality.json"), { traits: {} });
  return {
    identity: {
      name: identity.name,
      role: identity.role,
      voiceStyle: identity.voiceStyle,
      developmentalDirection: identity.developmentalDirection,
      lineage: identity.lineage,
      principles: identity.principles || [],
    },
    core_traits: Object.fromEntries(Object.entries(personality.traits || {}).map(([name, trait]) => [name, { value: trait.value, confidence: trait.confidence }])),
    relevant_memories: query ? searchMemory(query, { limit: 5, maxChars: 2400 }) : [],
  };
}

module.exports = { buildIdentityCapsule };
