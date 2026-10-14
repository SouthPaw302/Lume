#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const query = process.argv.slice(2).join(" ").trim();
if (!query) { console.error("usage: npm run archive:search -- <query>"); process.exit(2); }
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const index = path.join(data, "archive", "index.jsonl");
const terms = [...new Set(query.toLowerCase().match(/[a-z0-9_-]{2,}/g) || [])];
const rows = fs.readFileSync(index, "utf8").split("\n").filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const results = rows.map(row => {
  const haystack = `${row.path}\n${row.excerpt}`.toLowerCase();
  const pathText = row.path.toLowerCase();
  const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  const pathHits = terms.reduce((sum, term) => sum + (pathText.includes(term) ? 1 : 0), 0);
  return { row, score: hits + pathHits * 2 };
}).filter(result => result.score > 0).sort((a, b) => b.score - a.score || b.row.modified_at.localeCompare(a.row.modified_at)).slice(0, 12);
for (const { row, score } of results) console.log(JSON.stringify({ score, path: row.path, modified_at: row.modified_at, size: row.size, preview: row.excerpt.replace(/\s+/g, " ").slice(0, 320) }));
