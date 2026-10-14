#!/usr/bin/env node
"use strict";

const os = require("node:os");
const path = require("node:path");
const { readJson } = require("../src/io");
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const state = readJson(path.join(data, "evolution", "state.json"), {});
const population = state.population || [];
const report = {
  schema_version: 1, verified_at: new Date().toISOString(), generation: state.generation || 0,
  jobs_completed: population.length, population_size: population.length,
  lineage_diversity: new Set(population.map(item => item.family)).size,
  selected_for_canary: state.survivors || [],
  neutral: population.filter(item => item.status === "neutral").map(item => item.id),
  rejected: population.filter(item => item.status === "rejected").map(item => item.id),
  actual_changes: state.canary ? [{ candidate: state.canary.candidate_id, status: state.canary.status, before_digest: state.canary.before_digest, after_digest: state.canary.after_digest }] : [],
  proposed_changes: population.map(item => ({ candidate: item.id, mutation: item.expressed?.mutation })),
  next_questions: ["Do survivors transfer to unseen seeds?", "Does the local canary preserve continuity over time?"]
};
console.log(JSON.stringify(report, null, 2));
