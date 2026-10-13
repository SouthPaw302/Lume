"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALLOWED_DOMAINS = new Set(["memory", "episode", "person", "project", "goal", "task", "routine", "preference", "identity", "interaction_pattern"]);
function load(file) { try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); } catch (_) { return []; } }
function append(file, record) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8"); }

class MemoryStore {
  constructor(filePath) { this.filePath = filePath; }
  list({ domain, includeArchived = false, limit = 50 } = {}) {
    const latest = new Map();
    for (const record of load(this.filePath)) latest.set(record.id, { ...(latest.get(record.id) || {}), ...record });
    return [...latest.values()].filter(item => (!domain || item.domain === domain) && (includeArchived || !item.archived_at)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, Math.min(limit, 100));
  }
  save(input) {
    if (!ALLOWED_DOMAINS.has(input?.domain)) throw new Error("unsupported memory domain");
    const now = new Date().toISOString();
    const provenance = input.provenance && typeof input.provenance === "object" && !Array.isArray(input.provenance)
      ? Object.fromEntries(Object.entries(input.provenance).slice(0, 8).map(([key, value]) => [String(key).slice(0, 60), String(value).slice(0, 240)])) : undefined;
    const record = { id: input.id || crypto.randomUUID(), domain: input.domain, title: String(input.title || "").slice(0, 160), summary: String(input.summary || "").slice(0, 1200), importance: Math.max(0, Math.min(1, Number(input.importance ?? 0.5))), links: Array.isArray(input.links) ? input.links.map(String).slice(0, 20) : [], ...(provenance ? { provenance } : {}), created_at: now, updated_at: now, archived_at: null };
    append(this.filePath, record); return record;
  }
  update(id, changes) {
    const current = this.list({ includeArchived: true, limit: 100 }).find(item => item.id === id);
    if (!current) throw new Error("memory record not found");
    const record = { id, title: changes.title === undefined ? current.title : String(changes.title).slice(0, 160), summary: changes.summary === undefined ? current.summary : String(changes.summary).slice(0, 1200), importance: changes.importance === undefined ? current.importance : Math.max(0, Math.min(1, Number(changes.importance))), links: changes.links === undefined ? current.links : changes.links.map(String).slice(0, 20), updated_at: new Date().toISOString() };
    append(this.filePath, record); return { ...current, ...record };
  }
  archive(id) { const record = { id, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }; append(this.filePath, record); return record; }
  consolidate() { return this.list({ includeArchived: true, limit: 100 }); }
}
module.exports = { ALLOWED_DOMAINS, MemoryStore };
