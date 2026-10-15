"use strict";

const avatar = document.querySelector("#avatar");
const state = document.querySelector("#state");
const task = document.querySelector("#task");
const detail = document.querySelector("#detail");
const updated = document.querySelector("#updated");
const background = document.querySelector("#background");
const evolution = document.querySelector("#evolution");
const connection = document.querySelector("#connection");
const project = document.querySelector("#project");
const dna = document.querySelector("#dna");
const messages = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const status = document.querySelector("#chat-status");
const companionMode = document.querySelector("#companion-mode");
const libraryMode = document.querySelector("#library-mode");
const modeNote = document.querySelector("#mode-note");
const citations = document.querySelector("#citations");
const talk = document.querySelector("#talk");
const voiceMode = document.querySelector("#voice-mode");
const mute = document.querySelector("#mute");
const stopAudio = document.querySelector("#stop-audio");
const replay = document.querySelector("#replay");
const saveMemory = document.querySelector("#save-memory");
const clear = document.querySelector("#clear");
const SESSION_KEY = "lume-direct-session";
const HISTORY_KEY = "lume-direct-display";
const sessionId = localStorage.getItem(SESSION_KEY) || crypto.randomUUID().replaceAll("-", "");
localStorage.setItem(SESSION_KEY, sessionId);
let mode = "companion", lastMessageId = null, recorder = null, chunks = [], currentAudio = null, lastAudio = null, audioQueue = Promise.resolve();
let displayHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").slice(-20);
voiceMode.checked = localStorage.getItem("lume-voice-mode") === "1";
let muted = localStorage.getItem("lume-muted") === "1"; mute.textContent = muted ? "Unmute" : "Mute";

function render(next) {
  const accent = /^#[0-9a-f]{6}$/i.test(next.project_accent || "") ? next.project_accent : "#8bb8ff";
  document.documentElement.style.setProperty("--project-accent", accent);
  document.body.dataset.project = next.project_id || "none";
  project.textContent = next.project_label || "";
  project.hidden = !next.project_label;
  const personality = next.personality || {};
  const motion = Math.max(.7, Math.min(1.5, Number(personality.motion_scale) || 1));
  const glow = Math.max(.7, Math.min(1.5, Number(personality.glow_scale) || 1));
  const presence = Math.max(.95, Math.min(1.05, Number(personality.presence_scale) || 1));
  document.documentElement.style.setProperty("--dna-cycle", `${(4 / motion).toFixed(2)}s`);
  document.documentElement.style.setProperty("--dna-glow", glow.toFixed(2));
  document.documentElement.style.setProperty("--dna-presence", presence.toFixed(3));
  document.body.dataset.dominantTrait = personality.dominant_trait || "balanced";
  dna.textContent = personality.dominant_trait ? `DNA · ${personality.dominant_trait}` : "";
  avatar.className = `avatar state-${next.state}`;
  avatar.setAttribute("aria-label", `Lume is ${next.state}`);
  state.textContent = next.foreground_state || next.state;
  task.textContent = next.label || "Idle";
  detail.textContent = next.detail || (next.state === "idle" ? "No active system event." : next.sourceEvent || "Observed system activity.");
  updated.textContent = next.updatedAt ? `Updated ${new Date(next.updatedAt).toLocaleTimeString()}` : "";
  const count = next.background_activities?.length || 0;
  background.textContent = `${count} background ${count === 1 ? "activity" : "activities"}`;
  const development = next.evolution || {};
  evolution.textContent = development.active_canary
    ? `Generation ${development.generation} · trying ${development.active_canary} · ${development.queued_trials || 0} waiting`
    : `Generation ${development.generation || 0} · no active developmental trial`;
}

fetch("/api/state").then(response => response.json()).then(render).catch(() => {});
function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/ws`);
  socket.addEventListener("open", () => { connection.textContent = "Connected"; });
  socket.addEventListener("message", event => render(JSON.parse(event.data)));
  socket.addEventListener("close", () => { connection.textContent = "Reconnecting…"; fetch("/api/state").then(response => response.json()).then(render).catch(() => {}); setTimeout(connect, 1500); });
}
connect();

function persistDisplay() { displayHistory = displayHistory.slice(-20); localStorage.setItem(HISTORY_KEY, JSON.stringify(displayHistory)); }
function addMessage(role, text, save = true) {
  messages.querySelector(".empty")?.remove(); const item = document.createElement("div"); item.className = `message ${role}`; item.textContent = text; messages.append(item); messages.scrollTop = messages.scrollHeight;
  if (save) { displayHistory.push({ role, text }); persistDisplay(); } return item;
}
for (const item of displayHistory) addMessage(item.role, item.text, false);
function selectMode(next) {
  mode = next; companionMode.classList.toggle("active", next === "companion"); libraryMode.classList.toggle("active", next === "library");
  modeNote.textContent = next === "library" ? "Answers use up to two bounded references from the S10 offline library." : "Private, compact conversation using Lume’s identity and relevant memory.";
}
companionMode.onclick = () => selectMode("companion"); libraryMode.onclick = () => { if (!libraryMode.disabled) selectMode("library"); };
async function health() {
  try { const next = await fetch("/api/direct/health").then(r => r.json()); libraryMode.disabled = !next.kiwix; if (!next.kiwix && mode === "library") selectMode("companion"); status.textContent = `S10 ${next.qwen ? "ready" : "offline"} · Library ${next.kiwix ? "ready" : "offline"} · Voice ${next.stt && next.tts ? "ready" : "offline"}`; send.disabled = !next.qwen; talk.disabled = !next.stt; }
  catch (_) { status.textContent = "Hatch health unavailable"; }
}
health(); setInterval(health, 30000);

function playAudio(url) {
  lastAudio = url; audioQueue = audioQueue.then(() => new Promise(resolve => {
    if (muted) return resolve(); currentAudio = new Audio(url); currentAudio.onended = resolve; currentAudio.onerror = resolve; currentAudio.play().catch(resolve);
  }));
}
async function sendMessage(text) {
  addMessage("user", text); const answer = addMessage("assistant", "", false); send.disabled = true; status.textContent = "Lume is thinking…"; citations.replaceChildren(); citations.hidden = true;
  try {
    const response = await fetch("/api/direct/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, mode, message: text, voice: voiceMode.checked }) });
    if (!response.ok) throw new Error((await response.json()).error || `Request failed (${response.status})`);
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", complete = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n"); buffer = blocks.pop();
      for (const block of blocks) {
        const type = block.match(/^event:\s*(.+)$/m)?.[1]; const raw = block.match(/^data:\s*(.+)$/m)?.[1]; if (!type || !raw) continue; const data = JSON.parse(raw);
        if (type === "delta") { complete += data.text; answer.textContent = complete; messages.scrollTop = messages.scrollHeight; }
        if (type === "citation") { citations.hidden = false; const link = document.createElement("a"); link.href = data.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = data.title; citations.append(link); }
        if (type === "audio") playAudio(data.url);
        if (type === "done") lastMessageId = data.message_id;
        if (type === "error") throw new Error(data.error);
      }
    }
    if (!complete) answer.remove(); else { displayHistory.push({ role: "assistant", text: complete }); persistDisplay(); }
    status.textContent = "Ready";
  } catch (error) { answer.textContent = `Couldn’t reply: ${error.message}`; answer.classList.add("error"); status.textContent = "Reply failed"; }
  finally { send.disabled = false; input.focus(); }
}
form.addEventListener("submit", event => { event.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ""; sendMessage(text); });
voiceMode.onchange = () => localStorage.setItem("lume-voice-mode", voiceMode.checked ? "1" : "0");
mute.onclick = () => { muted = !muted; localStorage.setItem("lume-muted", muted ? "1" : "0"); mute.textContent = muted ? "Unmute" : "Mute"; if (muted) currentAudio?.pause(); };
stopAudio.onclick = () => { currentAudio?.pause(); audioQueue = Promise.resolve(); };
replay.onclick = () => { if (lastAudio) { audioQueue = Promise.resolve(); playAudio(lastAudio); } };
saveMemory.disabled = !["localhost", "127.0.0.1"].includes(location.hostname);
saveMemory.onclick = async () => { if (!lastMessageId) return status.textContent = "Nothing new to save"; const response = await fetch("/api/direct/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, message_id: lastMessageId }) }); status.textContent = response.ok ? "Saved to Lume memory" : (await response.json()).error; };
clear.onclick = async () => { await fetch(`/api/direct/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" }); displayHistory = []; persistDisplay(); messages.innerHTML = '<p class="empty">Fresh start. I’m here.</p>'; citations.replaceChildren(); lastMessageId = null; };

async function beginRecording() {
  if (recorder?.state === "recording") return; const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = async () => { stream.getTracks().forEach(track => track.stop()); talk.classList.remove("recording"); talk.textContent = "Hold to talk"; status.textContent = "Transcribing locally…"; const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); const response = await fetch("/api/direct/transcribe", { method: "POST", headers: { "content-type": blob.type }, body: blob }); const result = await response.json(); if (!response.ok) return status.textContent = result.error; input.value = result.text; if (result.text) sendMessage(result.text); }; await fetch("/api/direct/listening", { method: "POST" }); recorder.start(); talk.classList.add("recording"); talk.textContent = "Listening… release"; };
function endRecording() { if (recorder?.state === "recording") recorder.stop(); }
talk.addEventListener("pointerdown", event => { event.preventDefault(); beginRecording().catch(error => status.textContent = error.message); }); talk.addEventListener("pointerup", endRecording); talk.addEventListener("pointercancel", endRecording);
