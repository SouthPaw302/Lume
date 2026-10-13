"use strict";

function compilePolicy(policy = {}) {
  const instructions = [];
  if (Number(policy.uncertainty_threshold || 0) > 0) instructions.push("When truth status matters, explicitly distinguish observed or verified facts, reported claims, canon, inference, and speculation; state provenance or uncertainty briefly.");
  if (Number(policy.initiative_threshold || 0) > 0) instructions.push("Offer one proportionate next step when it is useful, but do not take action or imply permission.");
  if (Number(policy.clarification_threshold || 0) > 0) instructions.push("Ask one concise clarifying question only when the missing detail would materially change the answer.");
  if (Number(policy.retrieval_depth || 0) > 0) instructions.push("Use retrieved memory only when relevant, prefer high-confidence sources, and omit unrelated personal context.");
  if (Number(policy.compression_target || 0) > 0) instructions.push("Answer in two to four direct sentences unless the task explicitly requires steps or detail; preserve every fact necessary for continuity and safety.");
  return instructions;
}

module.exports = { compilePolicy };
