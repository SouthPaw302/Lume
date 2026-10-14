"use strict";

const { stableHash } = require("../io");

const CHANGE_CLASSES = new Set(["parameter", "skill", "policy", "workflow", "code", "identity", "routing", "experiment"]);
const PROTECTED_TARGETS = ["promotion-verifier", "evidence-ledger", "secret-filter", "active-evaluator"];

function required(value, name) {
  if (value === undefined || value === null || value === "") throw new Error(`${name} is required`);
  return value;
}

function genome(input = {}) {
  const value = {
    schema_version: 1,
    id: required(input.id, "genome.id"),
    generation: Number(input.generation || 0),
    parents: [...(input.parents || [])],
    identity_layers: [...(input.identity_layers || [])],
    hermes_skills: [...(input.hermes_skills || [])],
    behavioral_parameters: { ...(input.behavioral_parameters || {}) },
    retrieval_policy: { ...(input.retrieval_policy || {}) },
    model_routing: { ...(input.model_routing || {}) },
    experiment_schedules: { ...(input.experiment_schedules || {}) },
    workflow_topology: { ...(input.workflow_topology || {}) },
    code_modules: [...(input.code_modules || [])],
    created_at: required(input.created_at, "genome.created_at")
  };
  return { ...value, digest: stableHash(value) };
}

function experimentManifest(input = {}) {
  if (!CHANGE_CLASSES.has(input.change_class)) throw new Error("unsupported change class");
  const targets = [...(input.targets || [])];
  if (targets.some(target => PROTECTED_TARGETS.includes(target))) throw new Error("protected target cannot be mutated");
  if (input.builder_role && input.builder_role === input.evaluator_role) throw new Error("builder and evaluator must be independent");
  const value = {
    schema_version: 1,
    id: required(input.id, "manifest.id"),
    producer: required(input.producer, "manifest.producer"),
    seed: required(input.seed, "manifest.seed"),
    environment: input.environment || "development",
    parent_lineage: [...(input.parent_lineage || [])],
    mutation_grammar: required(input.mutation_grammar, "manifest.mutation_grammar"),
    resource_budget: { max_jobs: Math.min(12, Math.max(1, Number(input.resource_budget?.max_jobs || 1))), ...(input.resource_budget || {}) },
    predicted_consequence: required(input.predicted_consequence, "manifest.predicted_consequence"),
    expires_at: required(input.expires_at, "manifest.expires_at"),
    change_class: input.change_class,
    targets,
    builder_role: input.builder_role || "builder",
    evaluator_role: input.evaluator_role || "evaluator",
    evaluator_generation: Number(input.evaluator_generation ?? Math.max(0, Number(input.generation || 0) - 1))
  };
  value.resource_budget.max_jobs = Math.min(12, Math.max(1, Number(value.resource_budget.max_jobs || 1)));
  return { ...value, digest: stableHash(value) };
}

function evidenceBundle(input = {}) {
  const value = {
    schema_version: 1,
    candidate_id: required(input.candidate_id, "evidence.candidate_id"),
    baseline: input.baseline || {}, candidate: input.candidate || {},
    deterministic_metrics: input.deterministic_metrics || {},
    model_judgments: input.model_judgments || [],
    provenance_hashes: input.provenance_hashes || [],
    transfer_results: input.transfer_results || [],
    cost: input.cost || {}, failures: input.failures || [], artifacts: input.artifacts || [],
    evaluator_id: required(input.evaluator_id, "evidence.evaluator_id"),
    builder_id: required(input.builder_id, "evidence.builder_id")
  };
  if (value.evaluator_id === value.builder_id) throw new Error("candidate cannot evaluate itself");
  return { ...value, digest: stableHash(value) };
}

function promotionRecord(input = {}) {
  const value = {
    schema_version: 1, candidate_commit: required(input.candidate_commit, "promotion.candidate_commit"),
    ancestry: input.ancestry || [], fitness_vector: input.fitness_vector || {}, auditor_decisions: input.auditor_decisions || [],
    deployment_target: input.deployment_target || "evolution", rollback_commit: required(input.rollback_commit, "promotion.rollback_commit"),
    observed_survival: input.observed_survival || {}, previous_evaluator: required(input.previous_evaluator, "promotion.previous_evaluator")
  };
  return { ...value, digest: stableHash(value) };
}

module.exports = { CHANGE_CLASSES, PROTECTED_TARGETS, evidenceBundle, experimentManifest, genome, promotionRecord };
