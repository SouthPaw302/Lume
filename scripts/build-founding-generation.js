#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inventory } = require("../src/evolution/provenance");
const root = path.resolve(__dirname, "..");
const archive = process.env.LUME_ARCHIVE_ROOT || "/home/koss/clawd";
const output = path.join(root, "provenance", "founding-generation.json");
const value = inventory([root, archive], root);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
console.log(JSON.stringify({ output, records: value.records.length, corpus_digest: value.corpus_digest }));
