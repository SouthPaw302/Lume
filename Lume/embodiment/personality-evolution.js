"use strict";
const fs = require("fs");
const path = require("path");
const { recordEvidence } = require("./lib/personality-store");

const ROOT = path.resolve(process.env.LUME_PROJECT_ROOT || path.join(__dirname, "../.."));
const DATA_ROOT = path.resolve(process.env.LUME_DATA_DIR || path.join(require("os").homedir(), ".local", "share", "lumeai"));
const LOGS = path.join(ROOT, "research_loop", "logs");
const storePath = path.join(ROOT, "Lume", "personality.json");
const evidencePath = path.join(DATA_ROOT, "personality", "evidence.jsonl");
const auditPath = path.join(DATA_ROOT, "personality", "changes.jsonl");

let recorded = 0;
let evolved = 0;
const changes = [];
for (const file of fs.readdirSync(LOGS).filter(name => name.endsWith(".jsonl")).sort().slice(-45)) {
  const rows = fs.readFileSync(path.join(LOGS, file), "utf8").split("\n").filter(Boolean);
  for (const raw of rows) {
    let row;
    try { row = JSON.parse(raw); } catch (_) { continue; }
    for (const evidence of Array.isArray(row.dna_evidence) ? row.dna_evidence : []) {
      try {
        const result = recordEvidence({ storePath, evidencePath, auditPath, evidence });
        if (result.recorded) recorded += 1;
        if (result.changed) { evolved += 1; changes.push({ change_id: result.change_id, trait: result.trait, delta: result.delta }); }
      } catch (_) {}
    }
  }
}
process.stdout.write(`${JSON.stringify({ status: "DONE", recorded, evolved, changes })}\n`);
