"use strict";

const crypto = require("node:crypto");

const TOPIC = /\b(lume|emergen\w*|hatch\w*|personality|companion|field|memory|brainfuck|cellular automata|snake)\b/i;
const SECRET = /\b(?:sk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|token|password)\s*[:=]\s*\S+)/gi;

function textContent(message) {
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.filter(part => part && part.type === "text").map(part => part.text).join("\n").trim();
}

function sanitize(text, max = 2400) {
  return String(text || "").replace(SECRET, "[REDACTED]").replace(/\0/g, "").trim().slice(0, max);
}

function extractHistoricalEpisodes(rows, source, limit = 50) {
  const episodes = [];
  let pending = null;
  for (const row of rows) {
    if (row.type !== "message") continue;
    const role = row.message?.role;
    const text = sanitize(textContent(row.message));
    if (role === "user") {
      pending = text && TOPIC.test(text) && !/^\[cron:/i.test(text) ? { id: row.id, text, timestamp: row.timestamp } : null;
    } else if (role === "assistant" && pending && text) {
      const sourceDigest = crypto.createHash("sha256").update(`${source}:${pending.id}:${row.id}`).digest("hex");
      episodes.push({ id: `historical-${sourceDigest.slice(0, 16)}`, category: "historical-replay", prompt: pending.text, reference_response: text, required_facts: [], forbidden_facts: [], max_chars: Math.max(500, text.length + 200), provenance: { source_type: "openclaw_transcript", source_file: source, user_message_id: pending.id, assistant_message_id: row.id, digest: sourceDigest, captured_at: pending.timestamp } });
      pending = null;
      if (episodes.length >= limit) break;
    }
  }
  return episodes;
}

module.exports = { extractHistoricalEpisodes, sanitize, textContent };
