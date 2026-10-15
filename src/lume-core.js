"use strict";

const { buildCapsule } = require("./capsule");
const path = require("node:path");
const { readJson } = require("./io");
const { transform } = require("./experiments/field");
const { compilePolicy } = require("./policy");
const { paths } = require("./config");
const { createEmbeddingProvider } = require("./embeddings");
const { EventBridge } = require("./events");
const { ExperimentEngine } = require("./experiment-engine");
const { DevelopmentalMemory } = require("./memory");

class LumeCore {
  constructor(options = {}) {
    this.paths = { ...paths, ...(options.paths || {}) };
    this.memory = new DevelopmentalMemory({ recordsPath: this.paths.records, episodesPath: this.paths.episodes, embed: options.embed === undefined ? createEmbeddingProvider(options.embedding) : options.embed, clock: options.clock });
    this.experiments = new ExperimentEngine({ candidatesPath: this.paths.candidates, evidencePath: this.paths.evidence, ledgerPath: this.paths.ledger, livePolicyPath: this.paths.livePolicy, policyHistoryPath: this.paths.policyHistory, clock: options.clock });
    this.events = new EventBridge({ dataRoot: this.paths.data, clock: options.DateClass || Date, onChange: options.onEvent });
  }

  async build_capsule(query, context = {}) {
    const capsule = await buildCapsule({ query, context, memory: this.memory, identityPath: this.paths.identity, personalityPath: this.paths.personality });
    // Approved native policy affects Hermes only; replay and other surfaces stay unchanged.
    if (context.surface === "hermes") {
      const approved = compilePolicy(readJson(this.paths.livePolicy, {}));
      if (approved.length) capsule.approved_behavior = { source: "approved_local_policy", instructions: approved };
    }
    // Strictly opt-in and Hermes-only: do not pollute baseline replay,
    // evaluations, normal Hatch requests, or Lume's standing live policy.
    if (process.env.LUME_ENABLE_EVOLUTION_CANARY !== "1" || context.surface !== "hermes") return capsule;
    const active = readJson(path.join(this.paths.data, "evolution", "active-canary.json"), null);
    if (active?.status !== "observing" || active.source_kind !== "verified_local_trial") return capsule;
    const mutation = active.expression?.mutation;
    const safeTargets = new Set(["uncertainty_threshold", "initiative_threshold", "clarification_threshold", "retrieval_depth", "compression_target", "reflection_strategy"]);
    if (!safeTargets.has(mutation?.target)) return capsule;
    try {
      const baseline = readJson(this.paths.livePolicy, {});
      const updated = transform(baseline, mutation).after;
      const before = new Set(compilePolicy(baseline));
      const additions = compilePolicy(updated).filter(instruction => !before.has(instruction));
      if (additions.length) capsule.experimental_behavior = {
        candidate_id: active.candidate_id,
        label: "temporary_reversible_canary",
        instructions: additions
      };
    } catch (_) { /* An invalid mutation never changes the live capsule. */ }
    return capsule;
  }
  retrieve_memory(query, policy = {}) { return this.memory.retrieve(query, policy); }
  record_episode(event) { return this.memory.recordEpisode(event); }
  propose_adaptation(hypothesis, mutation, options = {}) { return this.experiments.propose({ hypothesis, mutation, ...options }); }
  run_episode(candidate, fixture, options) { return this.experiments.runEpisode({ candidateId: candidate, fixture, ...options }); }
  evaluate_pair(baseline, candidate, options) { return this.experiments.evaluatePair({ baseline, candidate, ...options }); }
  build_approval_card(id) { return this.experiments.approvalCard(id); }
  promote_candidate(id, approval) { return this.experiments.promote(id, approval); }
  rollback_candidate(id, reason) { return this.experiments.rollback(id, reason); }
  emit_event(type, task, metadata = {}) { return this.events.emit(type, task, metadata); }
}

module.exports = { LumeCore };
