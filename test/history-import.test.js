"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { extractHistoricalEpisodes, sanitize } = require("../src/history-import");

test("historical importer selects Lume exchanges and retains provenance", () => {
  const rows = [
    { type: "message", id: "u1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: [{ type: "text", text: "How should Lume memory work?" }] } },
    { type: "message", id: "a1", message: { role: "assistant", content: [{ type: "text", text: "Use typed records." }] } }
  ];
  const result = extractHistoricalEpisodes(rows, "session.jsonl");
  assert.equal(result.length, 1);
  assert.equal(result[0].provenance.user_message_id, "u1");
});

test("historical importer excludes cron chatter and redacts credential shapes", () => {
  const rows = [{ type: "message", id: "u", message: { role: "user", content: [{ type: "text", text: "[cron:x] Lume memory" }] } }, { type: "message", id: "a", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }];
  assert.equal(extractHistoricalEpisodes(rows, "x").length, 0);
  assert.equal(sanitize("api_key=secret-value"), "[REDACTED]");
});

test("historical importer accepts legacy string content", () => {
  const rows = [{ type: "message", id: "u", message: { role: "user", content: "Lume companion" } }, { type: "message", id: "a", message: { role: "assistant", content: "Present." } }];
  assert.equal(extractHistoricalEpisodes(rows, "legacy").length, 1);
});
