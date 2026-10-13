#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extractHistoricalEpisodes } = require("../src/history-import");
const { atomicJson } = require("../src/io");

const source = path.resolve(process.argv[2] || path.join(__dirname, "..", "SECOND_BRAIN", "transcripts"));
const dataRoot = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const destination = path.join(dataRoot, "fixtures", "historical-private.json");
const files = fs.readdirSync(source).filter(name => name.endsWith(".jsonl")).sort();
const episodes = [];

for (const name of files) {
  const rows = fs.readFileSync(path.join(source, name), "utf8").split("\n").filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  episodes.push(...extractHistoricalEpisodes(rows, name, 5));
  if (episodes.length >= 100) break;
}

atomicJson(destination, { schema_version: 1, private: true, generated_at: new Date().toISOString(), source_directory: source, episodes: episodes.slice(0, 100) });
fs.chmodSync(destination, 0o600);
console.log(`${destination} (${Math.min(episodes.length, 100)} episodes)`);
