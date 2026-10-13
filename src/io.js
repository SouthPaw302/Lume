"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { return fallback; }
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch (_) { return []; }
    });
  } catch (_) { return []; }
}

function atomicJson(file, value, mode = 0o600) {
  ensureParent(file);
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temporary, file);
}

function appendJsonl(file, value, mode = 0o600) {
  ensureParent(file);
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode });
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function stableHash(value) { return sha256(JSON.stringify(stable(value))); }

module.exports = { appendJsonl, atomicJson, ensureParent, readJson, readJsonl, sha256, stable, stableHash };
