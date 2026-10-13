"use strict";

// Small deterministic adapter for OpenClaw hooks, scripts, and services.
// Usage: node emit-event.js task.started task-123 openclaw "Checking files"
const http = require("http");
const [event, task_id, source, label = ""] = process.argv.slice(2);
if (!event || !task_id || !source) {
  process.stderr.write("usage: emit-event.js <event> <task_id> <source> [label]\n");
  process.exit(2);
}
const payload = JSON.stringify({ event, task_id, source, timestamp: new Date().toISOString(), label, foreground: process.env.LUME_FOREGROUND !== "0", ...(process.env.LUME_PARENT_TASK_ID ? { parent_task_id: process.env.LUME_PARENT_TASK_ID } : {}) });
const request = http.request({ hostname: "127.0.0.1", port: Number(process.env.LUME_PORT || 8788), path: "/api/events", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...(process.env.LUME_EVENT_TOKEN ? { authorization: `Bearer ${process.env.LUME_EVENT_TOKEN}` } : {}) } }, response => {
  response.resume();
  response.on("end", () => process.exit(response.statusCode === 202 ? 0 : 1));
});
request.on("error", error => { process.stderr.write(`${error.message}\n`); process.exit(1); });
request.end(payload);
