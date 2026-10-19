#!/usr/bin/env node
"use strict";
const fs = require("node:fs"); const { spawnSync } = require("node:child_process");
const os = require("node:os"); const path = require("node:path");
const { readJson } = require("../src/io"); const { asTelegram, buildReport } = require("../src/evolution/report");
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const socraticDir = path.join(data, "experiments", "socratic");
let latestSocratic = null;
try {
  const files = fs.readdirSync(socraticDir).filter(name => /^\d{4}-\d{2}-\d{2}-socratic-book-debate\.json$/.test(name)).sort();
  if (files.length) latestSocratic = readJson(path.join(socraticDir, files.at(-1)), null);
} catch (_) {}
const state = readJson(path.join(data, "evolution", "state.json"), {});
const message = asTelegram(buildReport({ ...state, latest_socratic: latestSocratic }));
if (process.argv.includes("--dry-run")) { console.log(message); process.exit(0); }
const target = process.env.TELEGRAM_REPORT_TARGET ? `telegram:${process.env.TELEGRAM_REPORT_TARGET}` : "telegram";
const reportDir = path.join(data, "reports"); fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
let audioPath = null;
const voice = spawnSync("/usr/bin/curl", ["-fsS", "--max-time", "180", "-H", "content-type: application/json", "--data-binary", "@-", "http://127.0.0.1:8790/synthesize"], { input: JSON.stringify({ text: message }), encoding: "utf8", timeout: 185_000 });
if (voice.status === 0) {
  try {
    const id = JSON.parse(voice.stdout).id;
    const candidate = path.join(__dirname, "..", "Lume", "embodiment", "state", "direct-audio", `${id}.wav`);
    if (/^[a-f0-9]{32}$/.test(id) && fs.existsSync(candidate)) audioPath = candidate;
  } catch (_) {}
}
const ttsScript = process.env.LUME_TTS_SCRIPT || "/home/koss/LumeAI/scripts/tts_report.sh";
let tts = { status: 0, stderr: "" };
if (!audioPath) {
  audioPath = path.join(reportDir, `emergence-${new Date().toISOString().slice(0, 10)}.mp3`);
  tts = spawnSync(ttsScript, ["--text", message, "--out", audioPath], { encoding: "utf8", timeout: 180_000 });
}
const audioReady = Boolean(audioPath && fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0);
let result = spawnSync("lume-live", ["send", "--to", target, "--json", audioReady ? `${message}\n\nMEDIA:${audioPath}` : message], { encoding: "utf8", timeout: 60_000 });
if (result.status !== 0 && audioReady) result = spawnSync("lume-live", ["send", "--to", target, "--json", `${message}\n\nLocal voice attachment failed; text fallback delivered.`], { encoding: "utf8", timeout: 60_000 });
if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "Telegram delivery failed").trim());
console.log(JSON.stringify({ delivery: JSON.parse(String(result.stdout || "{}")), voice: audioReady ? "persistent-piper" : "text-fallback", audio: audioReady ? audioPath : null, tts_error: audioReady ? null : String(tts.stderr || voice.stderr || "local TTS unavailable").trim().slice(0, 500) }, null, 2));
