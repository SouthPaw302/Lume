#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const archive = path.resolve(process.env.LUME_ARCHIVE_ROOT || "/home/koss/clawd");
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const destination = path.join(data, "archive", "index.jsonl");
const roots = ["memory", "canon/notes", "SECOND_BRAIN", "research_loop", "reports", "nightly"];
const textExtensions = new Set([".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".csv", ".py", ".js"]);
const skipNames = new Set(["node_modules", ".git", "__pycache__", ".venv", "models", "tmp"]);
const records = [];

function walk(directory) {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (skipNames.has(entry.name) || entry.name.startsWith(".venv-")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) add(absolute);
  }
}

function add(absolute) {
  let stat;
  try { stat = fs.statSync(absolute); } catch { return; }
  const relative = path.relative(archive, absolute);
  const ext = path.extname(absolute).toLowerCase();
  let excerpt = "";
  if (textExtensions.has(ext) && stat.size <= 2 * 1024 * 1024) {
    try { excerpt = fs.readFileSync(absolute, "utf8").replace(/\0/g, "").slice(0, 12_000); } catch {}
  }
  records.push({ path: relative, source: "clawd-archive", size: stat.size, modified_at: stat.mtime.toISOString(), excerpt });
}

for (const root of roots) walk(path.join(archive, root));
for (const name of ["IDENTITY.md", "SOUL.md", "USER.md", "MEMORY.md", "MEMORY_INDEX.md", "PROJECT-MAP.md", "PROJECT-SUSPENDED.md"]) {
  const file = path.join(archive, name); if (fs.existsSync(file)) add(file);
}
records.sort((a, b) => a.path.localeCompare(b.path));
fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
const temporary = `${destination}.${process.pid}.tmp`;
fs.writeFileSync(temporary, records.map(record => JSON.stringify(record)).join("\n") + "\n", { mode: 0o600 });
fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o600);
console.log(JSON.stringify({ destination, records: records.length, archive }));
