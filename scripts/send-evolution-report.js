#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const os = require("node:os"); const path = require("node:path");
const { readJson } = require("../src/io"); const { asTelegram, buildReport } = require("../src/evolution/report");
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const message = asTelegram(buildReport(readJson(path.join(data, "evolution", "state.json"), {})));
if (process.argv.includes("--dry-run")) { console.log(message); process.exit(0); }
const target = process.env.TELEGRAM_REPORT_TARGET ? `telegram:${process.env.TELEGRAM_REPORT_TARGET}` : "telegram";
const result = spawnSync("lume-live", ["send", "--to", target, "--json", message], { encoding: "utf8", timeout: 60_000 });
if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "Telegram delivery failed").trim());
console.log(String(result.stdout).trim());
