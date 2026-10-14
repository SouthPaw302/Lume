"use strict";

const path = require("node:path");
const { atomicJson, readJson, stableHash } = require("../io");
const { PROTECTED_TARGETS } = require("./contracts");

function applyMutation(phenotype, mutation) {
  if (!mutation?.target || PROTECTED_TARGETS.includes(mutation.target)) throw new Error("canary mutation target is not permitted");
  const next = structuredClone(phenotype || {});
  if (mutation.target === "hermes_skills") next.hermes_skills = [...(next.hermes_skills || []), { operation: mutation.operation, value: mutation.value || null, action: mutation.action || null }];
  else if (mutation.target === "identity_layers") next.identity_layers = [...(next.identity_layers || []), mutation.value];
  else if (mutation.target === "workflow_topology") next.workflow_topology = { ...(next.workflow_topology || {}), candidate_rule: mutation.value };
  else next.behavioral_parameters = { ...(next.behavioral_parameters || {}), [mutation.target]: mutation.value ?? { operation: mutation.operation, magnitude: mutation.magnitude } };
  return next;
}

function deploy({ dataDir, candidate, clock = () => new Date() }) {
  const directory = path.join(dataDir, "evolution"); const activePath = path.join(directory, "active-canary.json");
  const active = readJson(activePath, null); if (active?.status === "observing") return active;
  const phenotypePath = path.join(directory, "phenotype.json"); const before = readJson(phenotypePath, { schema_version: 1, hermes_skills: [], identity_layers: [], behavioral_parameters: {}, workflow_topology: {} });
  const after = applyMutation(before, candidate.expressed.mutation);
  const record = { schema_version: 1, candidate_id: candidate.id, family: candidate.family, status: "observing", deployed_at: clock().toISOString(), before, after, before_digest: stableHash(before), after_digest: stableHash(after), rollback_target: "embedded-before-snapshot" };
  atomicJson(phenotypePath, after); atomicJson(activePath, record); return record;
}

function resolve({ dataDir, outcome, reason = "longitudinal observation", clock = () => new Date() }) {
  const directory = path.join(dataDir, "evolution"); const activePath = path.join(directory, "active-canary.json");
  const record = readJson(activePath, null); if (!record || record.status !== "observing") throw new Error("no active canary");
  if (outcome === "rollback") atomicJson(path.join(directory, "phenotype.json"), record.before);
  const next = { ...record, status: outcome === "retain" ? "retained" : "rolled_back", resolved_at: clock().toISOString(), reason };
  atomicJson(activePath, next); return next;
}

module.exports = { applyMutation, deploy, resolve };
