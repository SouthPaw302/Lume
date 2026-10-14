"use strict";

const brainfuck = require("../experiments/brainfuck");
const snake = require("../experiments/snake");
const automata = require("../experiments/automata");
const { fieldValue } = require("../experiments/field");
const { stableHash } = require("../io");

function base(family, seed, mutation, predicted) {
  return { family, seed, mutation, predicted_consequence: predicted, executable: true, digest: stableHash({ family, seed, mutation, predicted }) };
}

function compile(family, seed, context = {}) {
  if (family === "brainfuck") {
    const program = brainfuck.generate(seed, context.length || 48); const result = brainfuck.run(program, context.input || []);
    return base(family, seed, brainfuck.outputToMutation(result), "bounded parameter variation from a replayable program");
  }
  if (family === "field") {
    const choice = fieldValue(Buffer.from(stableHash(seed), "hex"));
    const actions = ["observe_episode", "query_model", "alter_skill", "spawn_github_task", "combine_lineages", "change_allocation", "propose_code"];
    return base(family, seed, { target: "hermes_skills", operation: choice.operator, action: actions[parseInt(choice.hex.slice(8, 16), 16) % actions.length] }, "cross-boundary bounded Hermes/GitHub action");
  }
  if (family === "snake") {
    const genome = { exploration: (parseInt(stableHash(seed).slice(0, 2), 16) / 255), persistence: (parseInt(stableHash(seed).slice(2, 4), 16) / 255) };
    const result = snake.simulate(genome, seed);
    return base(family, seed, { target: "hermes_skills", operation: "set_strategy", value: { ...genome, recovery: Math.max(0, 1 - result.collisions / 20), memory_horizon: 3 + Math.round(genome.persistence * 9) } }, "change persistence, exploration, recovery, and stopping behavior");
  }
  if (family === "cellular-automata") {
    const result = automata.run(seed);
    return base(family, seed, { target: "workflow_topology", operation: "set_coordination_rule", value: { recurrence: result.recurrence, recovery: 1 - result.perturbation_difference, specialization: result.diversity } }, "coordination rule derived from perturbation-tested structure");
  }
  if (family === "books") return base(family, seed, { target: "hermes_skills", operation: "add_expiring_strategy", value: { strategy: "seek a competing interpretation before acting", expires_after_generations: 3 } }, "transfer a competing interpretation to an unrelated task");
  if (family === "self-reflection") return base(family, seed, { target: "hermes_skills", operation: "revise_from_error", value: { observation_id: context.observation_id || `observation-${seed}`, predicted: context.predicted || "success", observed: context.observed || "correction" } }, "revise a procedure from a prediction/outcome mismatch");
  if (family === "personality") return base(family, seed, { target: "identity_layers", operation: "propose_patch", value: { trait: context.trait || "patient persistence", evidence_required: 3, contexts_required: 2 } }, "identity-layer change after repeated cross-context evidence");
  throw new Error(`unknown experiment family: ${family}`);
}

module.exports = { compile };
