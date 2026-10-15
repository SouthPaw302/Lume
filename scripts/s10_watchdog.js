#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ADB = "/usr/bin/adb";
const SSH = "/usr/bin/ssh";
const SERIAL = "R38M20502AL";
const ROOT = "/home/koss/clawd";
const RECOVERY_SOURCE = path.join(ROOT, "scripts/s10/10-lume-services");
const RECOVERY_REMOTE = "/sdcard/lume-services-watchdog.sh";
const STATE_FILE = path.join(os.homedir(), ".local/state/lume-s10-watchdog/state.json");
const TERMUX_USER_FILE = path.join(os.homedir(), ".local/state/lume-s10-watchdog/termux-user");
const SSH_KEY = path.join(os.homedir(), ".ssh/lume_s10_usb_ed25519");
const SSH_KNOWN_HOSTS = path.join(os.homedir(), ".ssh/lume_s10_known_hosts");
const SSH_LOCAL_PORT = "18022";
const QWEN_LOCAL_PORT = "12435";
const KIWIX_LOCAL_PORT = "18081";
const AURELIAN_LOCAL_PORT = "18082";
const COOLDOWN_MS = 5 * 60 * 1000;
// The S10 has one llama.cpp slot. A long prompt can legitimately occupy it
// for several minutes and temporarily page model weights; do not kill useful
// inference merely because health probes are slow while that slot is busy.
const SLOT_STALL_MS = 30 * 60 * 1000;
const MIN_MODEL_RSS_KB = 1_000_000;
const MAX_MODEL_SWAP_KB = 2_500_000;
const ENDPOINTS = [
  ["qwen", `http://127.0.0.1:${QWEN_LOCAL_PORT}/health`],
  ["kiwix", `http://127.0.0.1:${KIWIX_LOCAL_PORT}/`],
  ["aurelian", `http://127.0.0.1:${AURELIAN_LOCAL_PORT}/health`],
];

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch (_) { return {}; }
}

function writeState(value) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
}

function adb(...args) {
  return execFileSync(ADB, ["-s", SERIAL, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  }).trim();
}

function prepareAdbForward() {
  execFileSync(ADB, ["start-server"], { stdio: "ignore", timeout: 10_000 });
  if (adb("get-state") !== "device") throw new Error("S10 is not available to ADB");
  adb("forward", `tcp:${SSH_LOCAL_PORT}`, "tcp:8022");
  adb("forward", `tcp:${QWEN_LOCAL_PORT}`, "tcp:12435");
  adb("forward", `tcp:${KIWIX_LOCAL_PORT}`, "tcp:8081");
  adb("forward", `tcp:${AURELIAN_LOCAL_PORT}`, "tcp:8082");
}

function launchThroughSsh() {
  if (!fs.existsSync(SSH_KEY) || !fs.existsSync(TERMUX_USER_FILE)) return false;
  const user = fs.readFileSync(TERMUX_USER_FILE, "utf8").trim();
  if (!/^[a-z0-9_]+$/.test(user)) return false;
  execFileSync(SSH, [
    "-i", SSH_KEY,
    "-p", SSH_LOCAL_PORT,
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=6",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${SSH_KNOWN_HOSTS}`,
    `${user}@127.0.0.1`,
    "nohup env LUME_KIWIX_BIND=127.0.0.1 bash ~/.termux/boot/10-lume-services >/dev/null 2>&1 &",
  ], { stdio: "ignore", timeout: 10_000 });
  return true;
}

function sshCommand(command, timeout = 10_000) {
  if (!fs.existsSync(SSH_KEY) || !fs.existsSync(TERMUX_USER_FILE)) throw new Error("S10 SSH bridge is not configured");
  const user = fs.readFileSync(TERMUX_USER_FILE, "utf8").trim();
  if (!/^[a-z0-9_]+$/.test(user)) throw new Error("S10 Termux user is invalid");
  return execFileSync(SSH, [
    "-i", SSH_KEY,
    "-p", SSH_LOCAL_PORT,
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=6",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${SSH_KNOWN_HOSTS}`,
    `${user}@127.0.0.1`,
    command,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }).trim();
}

function getRemoteMetrics() {
  const output = sshCommand(String.raw`model_pid=$(ps -eo pid,args | awk '$2 ~ /(^|\/)llama-server$/ {print $1; exit}'); model_count=$(ps -eo args | awk '$1 ~ /(^|\/)llama-server$/ {n++} END {print n+0}'); kiwix_count=$(ps -eo args | awk '$1 ~ /(^|\/)kiwix-serve$/ {n++} END {print n+0}'); rss=0; swap=0; if test -n "$model_pid"; then rss=$(awk '/^VmRSS:/ {print $2}' /proc/$model_pid/status); swap=$(awk '/^VmSwap:/ {print $2}' /proc/$model_pid/status); fi; printf 'models=%s\nkiwix=%s\nrss=%s\nswap=%s\n' "$model_count" "$kiwix_count" "$rss" "$swap"`);
  const values = Object.fromEntries(output.split("\n").map(line => line.split("=", 2)));
  return {
    modelCount: Number(values.models || 0),
    kiwixCount: Number(values.kiwix || 0),
    modelRssKb: Number(values.rss || 0),
    modelSwapKb: Number(values.swap || 0),
  };
}

function restartAffectedThroughSsh({ model = false, kiwix = false } = {}) {
  const parts = [];
  if (model) parts.push(String.raw`old_model_pids=$(ps -eo pid,args | awk '$2 ~ /(^|\/)llama-server$/ {print $1}'); test -z "$old_model_pids" || kill $old_model_pids; for attempt in 1 2 3 4 5; do alive=""; for p in $old_model_pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done; test -z "$alive" && break; sleep 1; done; for p in $old_model_pids; do kill -0 "$p" 2>/dev/null && kill -9 "$p"; done`);
  if (kiwix) parts.push(String.raw`old_kiwix_pids=$(ps -eo pid,args | awk '$2 ~ /(^|\/)kiwix-serve$/ {print $1}'); test -z "$old_kiwix_pids" || kill $old_kiwix_pids; sleep 1; for p in $old_kiwix_pids; do kill -0 "$p" 2>/dev/null && kill -9 "$p"; done`);
  parts.push("nohup env LUME_KIWIX_BIND=127.0.0.1 bash ~/.termux/boot/10-lume-services >/dev/null 2>&1 &");
  sshCommand(parts.join("; "));
}

async function probe(name, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { name, ok: response.ok, status: response.status };
  } catch (_) {
    return { name, ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function probeSlot() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`http://127.0.0.1:${QWEN_LOCAL_PORT}/slots`, { signal: controller.signal });
    if (!response.ok) throw new Error(`slot probe returned ${response.status}`);
    const slots = await response.json();
    const active = slots.find(slot => slot.is_processing);
    if (!active) return { processing: false, marker: null };
    return {
      processing: true,
      marker: `${active.id_task}:${active.n_prompt_tokens_processed || 0}:${active.n_decoded || 0}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const now = Date.now();
  const previous = readState();
  try { prepareAdbForward(); } catch (_) {}
  const results = await Promise.all(ENDPOINTS.map(([name, url]) => probe(name, url)));
  const failed = results.filter(result => !result.ok).map(result => result.name);

  let metrics = null;
  try { metrics = getRemoteMetrics(); } catch (_) {}

  let slot = null;
  let slotProbeFailed = false;
  if (!failed.includes("qwen")) {
    try { slot = await probeSlot(); } catch (_) { slotProbeFailed = true; }
  }
  const sameSlot = slot && slot.processing && previous.slotMarker === slot.marker;
  const slotUnchangedSince = sameSlot ? (previous.slotUnchangedSince || new Date(now).toISOString()) : new Date(now).toISOString();
  const slotProbeFailedSince = slotProbeFailed ? (previous.slotProbeFailedSince || new Date(now).toISOString()) : null;
  const slotStalled = (sameSlot && now - Date.parse(slotUnchangedSince) >= SLOT_STALL_MS)
    || (slotProbeFailedSince && now - Date.parse(slotProbeFailedSince) >= SLOT_STALL_MS);
  const modelPressure = metrics && metrics.modelCount > 0
    && (metrics.modelRssKb < MIN_MODEL_RSS_KB || metrics.modelSwapKb > MAX_MODEL_SWAP_KB);
  const duplicateModel = metrics && metrics.modelCount > 1;
  const duplicateKiwix = metrics && metrics.kiwixCount > 1;
  const resourceReasons = [];
  if (modelPressure) resourceReasons.push(`model-memory rss=${metrics.modelRssKb}KiB swap=${metrics.modelSwapKb}KiB`);
  if (slotStalled) resourceReasons.push("model-slot-stalled");
  if (duplicateModel) resourceReasons.push(`duplicate-models=${metrics.modelCount}`);
  if (duplicateKiwix) resourceReasons.push(`duplicate-kiwix=${metrics.kiwixCount}`);

  if (process.argv.includes("--repair-resource-pressure")) {
    prepareAdbForward();
    restartAffectedThroughSsh({ model: true, kiwix: Boolean(duplicateKiwix) });
    writeState({ status: "recovering", checkedAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(), method: "ssh-over-adb", reasons: ["manual-resource-repair"], metrics });
    console.log("S10 model restarted and duplicate Kiwix workload cleared through SSH over ADB");
    return;
  }

  if (!failed.length && !resourceReasons.length) {
    if (previous.status !== "healthy") console.log("S10 recovered: qwen, kiwix, and aurelian are healthy");
    writeState({
      status: "healthy",
      checkedAt: new Date(now).toISOString(),
      lastAttemptAt: previous.lastAttemptAt || null,
      metrics,
      slotMarker: slot && slot.processing ? slot.marker : null,
      slotUnchangedSince: slot && slot.processing ? slotUnchangedSince : null,
      slotProbeFailedSince,
    });
    return;
  }

  const lastAttempt = Date.parse(previous.lastAttemptAt || 0) || 0;
  if (now - lastAttempt < COOLDOWN_MS) {
    console.log(`S10 still starting or in recovery cooldown: ${[...failed, ...resourceReasons].join(", ")}`);
    writeState({ ...previous, status: "recovering", checkedAt: new Date(now).toISOString(), failed, reasons: resourceReasons, metrics });
    return;
  }

  try {
    prepareAdbForward();
    let sshLaunched = false;
    try {
      if (resourceReasons.length) {
        restartAffectedThroughSsh({ model: modelPressure || slotStalled || duplicateModel, kiwix: duplicateKiwix });
        sshLaunched = true;
      } else {
        sshLaunched = launchThroughSsh();
      }
    } catch (_) {}
    if (sshLaunched) {
      writeState({ status: "recovering", checkedAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(), failed, reasons: resourceReasons, metrics, method: "ssh-over-adb" });
      console.log(`S10 recovery launched through SSH over ADB: ${[...failed, ...resourceReasons].join(", ")}`);
      return;
    }
    adb("push", RECOVERY_SOURCE, RECOVERY_REMOTE);
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
    try { adb("shell", "wm", "dismiss-keyguard"); } catch (_) {}
    adb("shell", "am", "start", "-n", "com.termux/.app.TermuxActivity");
    await new Promise(resolve => setTimeout(resolve, 1500));
    try { adb("shell", "input", "keycombination", "KEYCODE_CTRL_LEFT", "KEYCODE_C"); } catch (_) {}
    adb("shell", "input", "text", "bash");
    adb("shell", "input", "keyevent", "KEYCODE_SPACE");
    adb("shell", "input", "text", RECOVERY_REMOTE);
    adb("shell", "input", "keyevent", "KEYCODE_ENTER");
    writeState({ status: "recovering", checkedAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(), failed, method: "adb-ui-fallback" });
    console.log(`S10 recovery launched through ADB: ${failed.join(", ")}`);
  } catch (error) {
    writeState({ status: "blocked", checkedAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(), failed, error: error.message });
    console.error(`S10 recovery blocked: ${error.message}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`S10 watchdog failed: ${error.message}`);
  process.exitCode = 1;
});
