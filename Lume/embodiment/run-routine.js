"use strict";
const { spawn } = require("child_process");
const path = require("path");
const { appendRoutineResult } = require("./lib/routine-digest");

const args = process.argv.slice(2);
const divider = args.indexOf("--");
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; };
const id = option("--id");
const label = option("--label") || id;
const project = option("--project");
const command = divider >= 0 ? args.slice(divider + 1) : [];
if (!id || !command.length) { process.stderr.write("usage: run-routine.js --id ID [--label LABEL] -- command [args...]\n"); process.exit(2); }

const endpoint = `http://127.0.0.1:${Number(process.env.LUME_PORT || 8788)}/api/events`;
async function emit(event) {
  const metadata = project === "research" ? { project_id: "research", project_label: "Lume Research", project_accent: "#9b8cff" }
    : project === "aurelian" ? { project_id: "aurelian", project_label: "Aurelian", project_accent: "#f0b866" } : {};
  try { await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, task_id: id, source: "lume.routine", timestamp: new Date().toISOString(), label, foreground: false, metadata }) }); } catch (_) {}
}

(async () => {
  await emit("routine.started");
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", env: process.env });
  child.on("error", async error => {
    appendRoutineResult(path.join(__dirname, "state", "routine-results.jsonl"), { id, status: "failed", summary: error.message });
    await emit("routine.failed"); process.exit(1);
  });
  child.on("exit", async (code, signal) => {
    const ok = code === 0;
    appendRoutineResult(path.join(__dirname, "state", "routine-results.jsonl"), { id, status: ok ? "completed" : "failed", summary: ok ? "DONE" : `exit=${code ?? "none"} signal=${signal || "none"}` });
    await emit(ok ? "routine.completed" : "routine.failed");
    process.exit(ok ? 0 : (code || 1));
  });
})();
