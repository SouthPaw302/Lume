"use strict";

const DEFAULT_LIMITS = Object.freeze({ objective: 1200, conversation: 6000, memory: 3000, files: 12000, toolOutput: 6000, tried: 2000 });

function trim(value, limit) {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.65);
  const tail = limit - head;
  return `${text.slice(0, head)}\n…[trimmed ${text.length - limit} chars]…\n${text.slice(-tail)}`;
}

function buildTaskContext(input, limits = DEFAULT_LIMITS) {
  if (!input || typeof input.objective !== "string" || !input.objective.trim()) throw new Error("objective is required");
  return {
    objective: trim(input.objective, limits.objective),
    recentConversation: trim(input.recentConversation, limits.conversation),
    relevantMemory: trim(input.relevantMemory, limits.memory),
    requiredFiles: trim(input.requiredFiles, limits.files),
    relevantToolOutput: trim(input.relevantToolOutput, limits.toolOutput),
    alreadyTried: trim(input.alreadyTried, limits.tried),
  };
}

module.exports = { DEFAULT_LIMITS, buildTaskContext, trim };
