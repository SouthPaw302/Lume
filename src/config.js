"use strict";

const os = require("os");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));

const paths = Object.freeze({
  project: PROJECT_ROOT,
  data: DATA_ROOT,
  identity: path.join(PROJECT_ROOT, "Lume", "identity-profile.json"),
  personality: path.join(PROJECT_ROOT, "Lume", "personality.json"),
  records: path.join(DATA_ROOT, "memory", "records.jsonl"),
  episodes: path.join(DATA_ROOT, "memory", "episodes.jsonl"),
  candidates: path.join(DATA_ROOT, "experiments", "candidates.jsonl"),
  evidence: path.join(DATA_ROOT, "experiments", "evidence.jsonl"),
  ledger: path.join(DATA_ROOT, "experiments", "ledger.jsonl"),
  livePolicy: path.join(DATA_ROOT, "policy", "live.json"),
  policyHistory: path.join(DATA_ROOT, "policy", "history")
});

module.exports = { DATA_ROOT, PROJECT_ROOT, paths };
