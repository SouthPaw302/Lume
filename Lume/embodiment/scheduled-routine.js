"use strict";
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(process.env.LUME_PROJECT_ROOT || path.join(__dirname, "../.."));
const PYTHON = "/usr/bin/python3";
const BASH = "/usr/bin/bash";
const ROUTINES = Object.freeze({
  "adaptation-primary": [PYTHON, `${ROOT}/canon/self-review/run_adaptation.py`, "--slot", "primary"],
  "adaptation-secondary": [PYTHON, `${ROOT}/canon/self-review/run_adaptation.py`, "--slot", "secondary"],
  "book-excerpt": [PYTHON, `${ROOT}/scripts/3am_book_job.py`],
  "core-context": [BASH, `${ROOT}/scripts/core_context_digest.sh`],
  "daily-health-check": [BASH, `${ROOT}/scripts/daily_health_check.sh`],
  "deterministic-novelty-trace": [PYTHON, `${ROOT}/scripts/emergence_randomness.py`, "--log-to-memory"],
  "emergence-scan": [PYTHON, `${ROOT}/scripts/emergence_scan.py`, "--log-to-memory"],
  "field-automaton": [PYTHON, `${ROOT}/scripts/field_automaton.py`, "--log-to-memory"],
  "personality-probe": [PYTHON, `${ROOT}/scripts/emergence_personality_probe.py`],
  "personality-evolution": [process.execPath, `${ROOT}/Lume/embodiment/personality-evolution.js`],
  "signal-checkin": [BASH, `${ROOT}/scripts/signal_institution_checkin.sh`],
  "socratic-book-debate": [PYTHON, `${ROOT}/scripts/socratic_book_debate.py`, "--log-to-memory"],
  "telegram-voice-report": [BASH, `${ROOT}/scripts/send_330_voice_report.sh`],
  "tomorrow-experiments": [PYTHON, `${ROOT}/scripts/run_tomorrow_experiments.py`],
  "secondary-brain-export": [PYTHON, `${ROOT}/scripts/secondary_brain_export.py`],
});
const RESEARCH_ROUTINES = new Set(["adaptation-primary", "adaptation-secondary", "book-excerpt", "deterministic-novelty-trace", "emergence-scan", "field-automaton", "personality-probe", "personality-evolution", "socratic-book-debate", "tomorrow-experiments"]);

if (require.main === module) {
  const id = process.argv[2];
  const command = ROUTINES[id];
  if (!command) { process.stderr.write(`unknown scheduled routine: ${id || "<missing>"}\n`); process.exit(2); }
  const runner = path.join(__dirname, "run-routine.js");
  const projectArgs = RESEARCH_ROUTINES.has(id) ? ["--project", "research"] : [];
  const child = spawn(process.execPath, [runner, "--id", id, "--label", id, ...projectArgs, "--", ...command], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...(id === "core-context" ? { LOG_TO_MEMORY: "1" } : {}) },
  });
  child.on("error", error => { process.stderr.write(`${error.message}\n`); process.exit(1); });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

module.exports = { ROUTINES };
