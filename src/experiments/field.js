"use strict";

const crypto = require("crypto");

const OPERATORS = ["strengthen", "weaken", "invert", "contract", "expand", "split", "merge", "collide", "anchor", "noise-inject", "glider-test", "ask"];
const TARGETS = new Set(["retrieval_depth", "initiative_threshold", "clarification_threshold", "compression_target", "uncertainty_threshold", "reflection_strategy", "memory_source_order"]);

function fieldValue(bytes = crypto.randomBytes(32)) {
  const hex = bytes.toString("hex");
  return { hex, operator: OPERATORS[Number.parseInt(hex.slice(0, 8), 16) % OPERATORS.length] };
}

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }

function transform(policy, proposal) {
  if (!proposal || !TARGETS.has(proposal.target)) throw new Error("FIELD target is not permitted");
  if (!OPERATORS.includes(proposal.operator)) throw new Error("FIELD operator is not permitted");
  const before = structuredClone(policy); const after = structuredClone(policy); const current = after[proposal.target];
  const amount = clamp(Number(proposal.magnitude ?? 0.05), 0.001, 0.15);
  switch (proposal.operator) {
    case "strengthen": after[proposal.target] = clamp(Number(current || 0) + amount); break;
    case "weaken": after[proposal.target] = clamp(Number(current || 0) - amount); break;
    case "invert": after[proposal.target] = 1 - clamp(Number(current || 0)); break;
    case "contract": after[proposal.target] = Math.max(1, Math.floor(Number(current || 1) * (1 - amount))); break;
    case "expand": after[proposal.target] = Math.min(20, Math.ceil(Number(current || 1) * (1 + amount))); break;
    case "split": after[proposal.target] = { strategy: "split", variants: proposal.variants || [] }; break;
    case "merge": after[proposal.target] = { strategy: "merge", variants: proposal.variants || [] }; break;
    case "collide": after[proposal.target] = { strategy: "collide", parents: proposal.parents || [] }; break;
    case "anchor": after[proposal.target] = { strategy: "anchored", value: current }; break;
    case "noise-inject": after[proposal.target] = clamp(Number(current || 0) + (Number(proposal.noise ?? 0) * amount)); break;
    case "glider-test": after[proposal.target] = { strategy: "transfer_test", value: current, contexts: proposal.contexts || [] }; break;
    case "ask": return { before, after: before, mutation: null, question: String(proposal.question || "What observable behavior should change?") };
    default: throw new Error("unsupported FIELD operator");
  }
  return { before, after, mutation: { target: proposal.target, operator: proposal.operator, before: current, after: after[proposal.target] } };
}

module.exports = { OPERATORS, TARGETS, fieldValue, transform };
