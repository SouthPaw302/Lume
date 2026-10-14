"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableHash } = require("../io");

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    const excluded = new Set([".git", "node_modules", "backups", "tmp", ".tmp", "out", "media", "models", "dist", "build", "inbound", "netlify-sites", "projects"]);
    if (entry.isDirectory()) return excluded.has(entry.name) || entry.name.startsWith(".venv") ? [] : walk(file);
    return /\.md$/i.test(entry.name) ? [file] : [];
  });
}

function truthClass(file) {
  const name = file.toLowerCase();
  if (name.includes("memory")) return "private-memory";
  if (name.includes("identity") || name.endsWith("soul.md") || name.endsWith("user.md")) return "identity";
  if (name.includes("canon")) return "canon";
  if (name.includes("research") || name.includes("review")) return "research";
  if (name.includes("experiment") || name.includes("field")) return "experiment";
  return "unclassified";
}

function inventory(roots, destinationRoot) {
  const records = roots.flatMap((sourceRoot, rootIndex) => walk(sourceRoot).map(file => {
    const stat = fs.statSync(file); const relative = path.relative(sourceRoot, file);
    const authoritative = path.resolve(file).startsWith(path.resolve(destinationRoot) + path.sep);
    return { source_root: authoritative ? "lume-authoritative" : `archive-${rootIndex}`, source_path: relative, relative_path: relative, sha256: sha256(fs.readFileSync(file)), modified_at: stat.mtime.toISOString(), truth_class: truthClass(file), relationships: [], import_status: authoritative ? "authoritative" : "archived", founding_generation: 0 };
  })).sort((a, b) => `${a.source_root}/${a.source_path}`.localeCompare(`${b.source_root}/${b.source_path}`));
  return { schema_version: 1, generated_at: new Date().toISOString(), corpus_digest: stableHash(records), records };
}

module.exports = { inventory, truthClass, walk };
