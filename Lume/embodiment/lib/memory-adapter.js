"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const SOURCES = ["MEMORY_INDEX.md", "MEMORY.md"];
const STRUCTURED = path.join(ROOT, "memory", "lume-records.jsonl");

const STOP_TERMS = new Set([
  "about", "answer", "could", "does", "from", "have", "how", "introduce",
  "lume", "memory", "one", "please", "say", "sentence", "short", "tell",
  "that", "this", "what", "when", "where", "which", "who", "why", "with",
  "would", "your", "yourself",
]);

function terms(query) {
  return [...new Set(String(query).toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])]
    .filter(word => !STOP_TERMS.has(word))
    .slice(0, 8);
}

function searchMemory(query, { limit = 5, maxChars = 3000 } = {}) {
  const words = terms(query);
  if (!words.length) return [];
  const files = SOURCES.map(name => path.join(ROOT, name));
  const daily = path.join(ROOT, "memory");
  if (fs.existsSync(daily)) files.push(...fs.readdirSync(daily).filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().slice(-2).map(name => path.join(daily, name)));
  const hits = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      const score = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
      if (score) hits.push({ source: path.relative(ROOT, file), line: index + 1, score, text: line.slice(0, 500) });
    });
  }
  if (fs.existsSync(STRUCTURED)) {
    for (const [index, line] of fs.readFileSync(STRUCTURED, "utf8").split("\n").filter(Boolean).entries()) {
      try {
        const record = JSON.parse(line); const text = `${record.title || ""}: ${record.summary || ""}`; const lower = text.toLowerCase();
        const score = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
        if (score && !record.archived_at) hits.push({ source: "memory/lume-records.jsonl", line: index + 1, score, text: text.slice(0, 500) });
      } catch (_) {}
    }
  }
  let used = 0;
  return hits.sort((a, b) => b.score - a.score).filter(hit => { used += hit.text.length; return used <= maxChars; }).slice(0, limit);
}

module.exports = { searchMemory };
