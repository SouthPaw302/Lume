"use strict";

const fs = require("fs");
const path = require("path");

function appendRoutineResult(filePath, result) {
  if (!result || typeof result.id !== "string" || !["completed", "failed", "blocked"].includes(result.status)) throw new Error("invalid routine result");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record = {
    id: result.id.slice(0, 160),
    status: result.status,
    summary: String(result.summary || "").slice(0, 500),
    timestamp: result.timestamp || new Date().toISOString(),
  };
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function digest(records) {
  const noteworthy = records.filter(item => item.status !== "completed");
  return {
    total: records.length,
    completed: records.length - noteworthy.length,
    exceptions: noteworthy.slice(-20),
    shouldNotify: noteworthy.length > 0,
  };
}

module.exports = { appendRoutineResult, digest };
