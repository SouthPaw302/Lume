#!/usr/bin/env node
"use strict";

const { experimentManifest } = require("../src/evolution/contracts");
const family = process.argv[2] || process.env.LUME_EXPERIMENT_FAMILY || "field";
const generation = Number(process.env.LUME_GENERATION || 1);
const manifest = experimentManifest({
  id: `g${generation}-${family}-${process.env.GITHUB_RUN_ID || "local"}`,
  producer: family, seed: process.env.LUME_SEED || `generation-${generation}:${family}`,
  environment: process.env.LUME_ENVIRONMENT || "development", generation,
  parent_lineage: (process.env.LUME_PARENTS || "founding-generation").split(","),
  mutation_grammar: `${family}/v1`, resource_budget: { max_jobs: Number(process.env.LUME_MAX_JOBS || 12), timeout_minutes: 15 },
  predicted_consequence: `Produce one replayable ${family} mutation for independent evaluation`,
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), change_class: family === "personality" ? "identity" : "skill",
  targets: family === "personality" ? ["identity_layers"] : ["hermes_skills"], builder_role: "candidate-builder", evaluator_role: "independent-evaluator"
});
console.log(JSON.stringify(manifest, null, 2));
