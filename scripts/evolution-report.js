#!/usr/bin/env node
"use strict";

const os = require("node:os");
const path = require("node:path");
const { readJson } = require("../src/io");
const { buildReport } = require("../src/evolution/report");
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const state = readJson(path.join(data, "evolution", "state.json"), {});
console.log(JSON.stringify(buildReport(state), null, 2));
