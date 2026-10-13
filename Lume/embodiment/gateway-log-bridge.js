"use strict";

const { spawn } = require("child_process");

// This bridge never asks a model to interpret activity. It maps only explicit,
// observable gateway log records to state events. Unknown log records are ignored.
function extractText(record) {
  if (typeof record === "string") return record;
  if (!record || typeof record !== "object") return "";
  return Object.values(record).flatMap(value => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") return [JSON.stringify(value)];
    return [];
  }).join(" ");
}

function mapGatewayRecord(record) {
  const text = extractText(record).toLowerCase();
  const detail = text.slice(0, 240) || null;
  const base = { task_id: typeof record?.task_id === "string" ? record.task_id : "gateway-log", source: "openclaw.gateway-log", timestamp: new Date().toISOString(), detail };
  if (/\b(browser|web_fetch|search_query)\b/.test(text)) return { ...base, event: "browser.searching" };
  if (/\b(exec_command|tools\.exec|shell)\b/.test(text)) return { ...base, event: "shell.running" };
  if (/\bmodel\b.*\b(start|stream|request)\b/.test(text)) return { ...base, event: "model.started" };
  if (/\bmodel\b.*\b(error|failed)\b/.test(text)) return { ...base, event: "model.failed" };
  return null;
}

function startGatewayLogBridge({ emit, journalctl = "/usr/bin/journalctl" }) {
  // The Gateway's user-service journal is already on this machine. Following it
  // avoids launching another OpenClaw CLI/runtime just to observe activity.
  const child = spawn(journalctl, ["--user-unit=openclaw-gateway.service", "--follow", "--lines=0", "--output=json"], { stdio: ["ignore", "pipe", "pipe"] });
  let pending = "";
  child.stdout.on("data", chunk => {
    pending += chunk.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      try {
        const mapped = mapGatewayRecord(JSON.parse(line));
        if (mapped) emit(mapped);
      } catch (_) { /* malformed or non-JSON gateway output is intentionally ignored */ }
    }
  });
  child.on("error", () => {});
  return () => child.kill("SIGTERM");
}

module.exports = { mapGatewayRecord, startGatewayLogBridge };
