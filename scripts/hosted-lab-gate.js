#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const { stableHash } = require("../src/io");
const STAGES = new Set(["promotion", "longitudinal-survival"]);
function record(stage, env = process.env) {
  if (!STAGES.has(stage)) throw Error("unsupported hosted lab stage");
  const value = { schema_version: 1, stage, outcome: "blocked_pending_private_local_evidence", eligible: false, promotion_authorized: false, local_canary_verified: false, independent_evaluation_verified: false, source: "hosted_github_actions", run_id: env.GITHUB_RUN_ID || null, reason: "Hosted runners lack private device-side trial and longitudinal evidence" };
  return { ...value, digest: stableHash(value) };
}
if (require.main === module) {
  try {
    const stage = process.argv[2]; const status = record(stage);
    const output = JSON.stringify(status, null, 2) + "\n";
    fs.writeFileSync("hosted-" + stage + "-gate.json", output, { mode: 0o600 });
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### " + stage + ": BLOCKED — no local evidence\n\n" + status.reason + "\n\n");
    process.stdout.write(output);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { record };
