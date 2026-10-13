"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { appendJsonl, atomicJson, readJson, readJsonl, stableHash } = require("./io");
const { transform } = require("./experiments/field");
const { evaluatePair } = require("./evaluation");

const STATES = new Set(["proposed", "shadow_tested", "exercised", "validated", "approved", "promoted", "neutral", "rejected", "regressed", "rolled_back", "expired"]);
const TRANSITIONS = {
  proposed: new Set(["shadow_tested", "neutral", "rejected", "expired"]),
  shadow_tested: new Set(["exercised", "neutral", "rejected", "expired"]),
  exercised: new Set(["validated", "neutral", "rejected", "regressed", "expired"]),
  validated: new Set(["approved", "regressed", "expired"]),
  approved: new Set(["promoted", "expired"]), promoted: new Set(["rolled_back", "regressed"]),
  regressed: new Set(["rolled_back"])
};

function currentCandidates(file) {
  const map = new Map();
  for (const event of readJsonl(file)) map.set(event.candidate.id, event.candidate);
  return map;
}

function signApproval(payload, key) {
  if (!key || String(key).length < 24) throw new Error("LUME_APPROVAL_KEY must be at least 24 characters");
  return crypto.createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex");
}

class ExperimentEngine {
  constructor({ candidatesPath, evidencePath, ledgerPath, livePolicyPath, policyHistoryPath, clock = () => new Date() }) {
    Object.assign(this, { candidatesPath, evidencePath, ledgerPath, livePolicyPath, policyHistoryPath, clock });
  }

  get(id) { return currentCandidates(this.candidatesPath).get(id) || null; }

  propose({ hypothesis, mutation, source, expires_at, parent_ids = [] }) {
    if (!hypothesis || !mutation || !source) throw new Error("hypothesis, mutation, and source are required");
    const now = this.clock().toISOString();
    const candidate = { id: `candidate-${crypto.randomUUID()}`, state: "proposed", hypothesis: String(hypothesis).slice(0, 1200), mutation, source, parent_ids, created_at: now, expires_at, validations: 0, regression_free: false };
    appendJsonl(this.candidatesPath, { at: now, action: "proposed", candidate });
    return candidate;
  }

  transition(id, state, evidence = {}) {
    if (!STATES.has(state)) throw new Error("invalid experiment state");
    const candidate = this.get(id); if (!candidate) throw new Error("candidate not found");
    if (!TRANSITIONS[candidate.state]?.has(state)) throw new Error(`invalid transition ${candidate.state} -> ${state}`);
    const next = { ...candidate, state, updated_at: this.clock().toISOString() };
    if (state === "validated") { next.validations = Number(evidence.validations || 0); next.regression_free = evidence.regression_free === true; }
    appendJsonl(this.candidatesPath, { at: next.updated_at, action: state, evidence_digest: stableHash(evidence), candidate: next });
    if (Object.keys(evidence).length) appendJsonl(this.evidencePath, { at: next.updated_at, candidate_id: id, state, evidence });
    return next;
  }

  materializePolicy(candidate, baseline) { return transform(baseline, candidate.mutation).after; }

  async runEpisode({ candidateId, fixture, runner, baselinePolicy }) {
    if (typeof runner !== "function") throw new Error("isolated runner is required");
    const candidate = this.get(candidateId); if (!candidate) throw new Error("candidate not found");
    const candidatePolicy = this.materializePolicy(candidate, baselinePolicy);
    const baseline = await runner({ fixture, policy: baselinePolicy, mode: "baseline", writes: false, tools: [] });
    const output = await runner({ fixture, policy: candidatePolicy, mode: "candidate", writes: false, tools: [] });
    const evidence = { fixture_id: fixture.id, baseline_digest: stableHash(baseline), candidate_digest: stableHash(output), baseline, candidate: output };
    appendJsonl(this.evidencePath, { at: this.clock().toISOString(), candidate_id: candidateId, state: "shadow_tested", evidence });
    return { baseline, candidate: output, candidatePolicy, evidence };
  }

  evaluatePair(input) { return evaluatePair(input); }

  approve(candidateId, { approver = "Cardona", key, note = "" }) {
    const candidate = this.get(candidateId);
    if (!candidate || candidate.state !== "validated" || candidate.validations < 2 || !candidate.regression_free) throw new Error("candidate has not met promotion gates");
    const payload = { candidate_id: candidateId, candidate_digest: stableHash(candidate), approver, decision: "approve", note: String(note).slice(0, 500), at: this.clock().toISOString() };
    const approval = { ...payload, signature: signApproval(payload, key) };
    appendJsonl(this.ledgerPath, { action: "approval", ...approval });
    this.transition(candidateId, "approved", { approval });
    return approval;
  }

  promote(candidateId, { key }) {
    const candidate = this.get(candidateId); if (!candidate || candidate.state !== "approved") throw new Error("approved candidate required");
    const approval = readJsonl(this.ledgerPath).reverse().find(row => row.action === "approval" && row.candidate_id === candidateId);
    if (!approval) throw new Error("approval record not found");
    const { signature, action, ...payload } = approval;
    const expected = signApproval(payload, key);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("approval signature is invalid");
    const before = readJson(this.livePolicyPath, {}); const after = this.materializePolicy(candidate, before); const now = this.clock().toISOString();
    fs.mkdirSync(this.policyHistoryPath, { recursive: true });
    const snapshot = path.join(this.policyHistoryPath, `${now.replace(/[:.]/g, "-")}-${candidateId}.json`);
    atomicJson(snapshot, before); atomicJson(this.livePolicyPath, after);
    appendJsonl(this.ledgerPath, { action: "promotion", candidate_id: candidateId, at: now, before_digest: stableHash(before), after_digest: stableHash(after), snapshot });
    this.transition(candidateId, "promoted", { snapshot, before_digest: stableHash(before), after_digest: stableHash(after) });
    return { candidate_id: candidateId, before, after, snapshot };
  }

  rollback(candidateId, reason) {
    const candidate = this.get(candidateId); if (!candidate || !["promoted", "regressed"].includes(candidate.state)) throw new Error("promoted or regressed candidate required");
    const promotion = readJsonl(this.ledgerPath).reverse().find(row => row.action === "promotion" && row.candidate_id === candidateId);
    if (!promotion || !fs.existsSync(promotion.snapshot)) throw new Error("rollback snapshot not found");
    const restored = readJson(promotion.snapshot, {}); atomicJson(this.livePolicyPath, restored);
    appendJsonl(this.ledgerPath, { action: "rollback", candidate_id: candidateId, reason: String(reason || "manual rollback").slice(0, 500), at: this.clock().toISOString(), restored_digest: stableHash(restored) });
    this.transition(candidateId, "rolled_back", { reason, restored_digest: stableHash(restored) });
    return { candidate_id: candidateId, restored };
  }
}

module.exports = { ExperimentEngine, STATES, TRANSITIONS, signApproval };
