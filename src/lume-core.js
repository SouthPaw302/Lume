"use strict";

const { buildCapsule } = require("./capsule");
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

  build_capsule(query, context = {}) { return buildCapsule({ query, context, memory: this.memory, identityPath: this.paths.identity, personalityPath: this.paths.personality }); }
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
