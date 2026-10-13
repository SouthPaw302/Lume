"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const crypto = require("crypto");
const { StateEngine } = require("./lib/state-engine");
const { startGatewayLogBridge } = require("./gateway-log-bridge");
const { searchMemory } = require("./lib/memory-adapter");
const { buildIdentityCapsule } = require("./lib/identity-capsule");
const { MemoryStore } = require("./lib/memory-store");
const { presentationFor, recordEvidence, rollbackTraitChange } = require("./lib/personality-store");
const { projects } = require("./lib/project-registry");
const { DirectChatService, SESSION_ID } = require("./lib/direct-chat");
const { LocalInferenceRouter } = require("./lib/local-inference-router");
const { RateLimiter, isLoopbackAddress, isTrustedLanAddress, normalizeAddress } = require("./lib/lan-policy");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const STATE = path.join(ROOT, "state", "runtime.json");
const EVENTS = path.join(ROOT, "state", "events.jsonl");
const PORT = Number(process.env.LUME_PORT || 8788);
const HOST = process.env.LUME_HOST || "127.0.0.1";
const HTTPS_PORT = Number(process.env.LUME_HTTPS_PORT || 8443);
const LAN_PREFIX = process.env.LUME_LAN_PREFIX || "192.168.12.";
const TLS_KEY = process.env.LUME_TLS_KEY || "";
const TLS_CERT = process.env.LUME_TLS_CERT || "";
const CA_CERT = process.env.LUME_CA_CERT || "";
const ENROLLMENT_PORT = Number(process.env.LUME_ENROLLMENT_PORT || 8789);
const EVENT_TOKEN = process.env.LUME_EVENT_TOKEN || "";
const IDENTITY = path.join(ROOT, "..", "identity-profile.json");
const SELF_MODEL = path.join(ROOT, "..", "self-model.json");
const PERSONALITY = path.join(ROOT, "..", "personality.json");
const PERSONALITY_AUDIT = path.join(ROOT, "state", "personality-changes.jsonl");
const PERSONALITY_EVIDENCE = path.join(ROOT, "state", "personality-evidence.jsonl");
const DIRECT_AUDIO = path.join(ROOT, "state", "direct-audio");
const memoryStore = new MemoryStore(path.join(ROOT, "..", "..", "memory", "lume-records.jsonl"));
const clients = new Set();
const sockets = new Set();
const directLimiter = new RateLimiter({ limit: 20, windowMs: 60_000 });

function websocketFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}

function broadcast(state) {
  state = decorateState(state);
  const message = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) client.write(message);
  const frame = websocketFrame(state);
  for (const socket of sockets) socket.write(frame);
}

function personalitySnapshot() {
  try {
    const store = JSON.parse(fs.readFileSync(PERSONALITY, "utf8"));
    return { traits: store.traits || {}, evolution: store.evolution || {}, presentation: presentationFor(store) };
  } catch (_) { return { traits: {}, evolution: {}, presentation: presentationFor({ traits: {} }) }; }
}

function decorateState(state) { return { ...state, personality: personalitySnapshot().presentation }; }

const engine = new StateEngine({ statePath: STATE, eventLogPath: EVENTS, onChange: broadcast });

function respondJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(body)}\n`);
}

function isLoopback(request) {
  return isLoopbackAddress(request.socket.remoteAddress || "");
}

function isTrusted(request) { return isTrustedLanAddress(request.socket.remoteAddress || "", LAN_PREFIX); }

function authorized(request) {
  if (!isLoopback(request)) return false;
  if (!EVENT_TOKEN) return true;
  return request.headers.authorization === `Bearer ${EVENT_TOKEN}`;
}

function readBody(request, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", chunk => { raw += chunk; if (raw.length > limit) reject(new Error("request too large")); });
    request.on("end", () => { try { resolve(JSON.parse(raw)); } catch (error) { reject(error); } });
    request.on("error", reject);
  });
}

function readBytes(request, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let used = 0;
    request.on("data", chunk => { used += chunk.length; if (used > limit) { reject(new Error("request too large")); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function voiceRequest(pathname, options = {}) {
  const base = process.env.LUME_VOICE_URL || "http://127.0.0.1:8790";
  const response = await fetch(`${base}${pathname}`, options);
  if (!response.ok) throw new Error(`local voice service unavailable (${response.status})`);
  return response.json();
}

function emitDirect(event, taskId, label) {
  try { engine.ingest({ event, task_id: taskId, source: "lume.direct", timestamp: new Date().toISOString(), label, foreground: true }); } catch (_) {}
}

const directChat = new DirectChatService({
  sessionDirectory: path.join(ROOT, "state", "direct-sessions"),
  buildCapsule: buildIdentityCapsule,
  emit: emitDirect,
  qwenUrl: process.env.LUME_QWEN_URL || "http://192.168.12.82:12435",
  kiwixUrl: process.env.LUME_KIWIX_URL || "http://192.168.12.82:8081",
});
const localInference = new LocalInferenceRouter({
  s10Url: process.env.LUME_QWEN_URL || "http://192.168.12.82:12435",
  motoUrl: process.env.LUME_MOTO_URL || "http://127.0.0.1:12436",
});

function writeSse(response, event, data) {
  if (!response.destroyed && !response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function probe(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 1800);
  try { const result = await fetch(url, { signal: controller.signal }); return result.ok; }
  catch (_) { return false; } finally { clearTimeout(timer); }
}

async function directHealth() {
  const voice = process.env.LUME_VOICE_URL || "http://127.0.0.1:8790";
  const [qwen, moto, kiwix, bridge, voiceResult] = await Promise.all([
    probe(`${directChat.qwenUrl}/health`), probe(`${localInference.urls.moto}/health`),
    probe(`${directChat.kiwixUrl}/`),
    probe(process.env.LUME_AURELIAN_URL || "http://192.168.12.82:8082/health"), probe(`${voice}/health`),
  ]);
  return { hatch: true, s10: qwen, moto, kiwix, bridge, stt: voiceResult, tts: voiceResult };
}

function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const candidate = path.resolve(PUBLIC, relative);
  if (!candidate.startsWith(`${PUBLIC}${path.sep}`) && candidate !== path.join(PUBLIC, "index.html")) return false;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return false;
  const extension = path.extname(candidate);
  const contentType = extension === ".html" ? "text/html" : extension === ".css" ? "text/css" : extension === ".js" ? "text/javascript" : "application/octet-stream";
  response.writeHead(200, { "content-type": `${contentType}; charset=utf-8`, "cache-control": "no-store" });
  fs.createReadStream(candidate).pipe(response);
  return true;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (!isTrusted(request)) return respondJson(response, 403, { error: "trusted home LAN required" });
  const lanReadOnly = !isLoopback(request);
  const lanAllowed = url.pathname === "/" || url.pathname === "/api/state" || url.pathname === "/state" || url.pathname === "/api/events" || url.pathname === "/api/ws" || url.pathname === "/health" || url.pathname.startsWith("/api/direct/") || url.pathname === "/lume-ca.crt" || !url.pathname.startsWith("/api/");
  if (lanReadOnly && !lanAllowed) return respondJson(response, 403, { error: "local-only interface" });
  if (request.method === "GET" && ["/api/state", "/state"].includes(url.pathname)) return respondJson(response, 200, decorateState(engine.snapshot()));
  if (request.method === "GET" && url.pathname === "/api/direct/health") return respondJson(response, 200, await directHealth());
  if (request.method === "POST" && url.pathname === "/api/local/infer") {
    if (!authorized(request)) return respondJson(response, 403, { error: "local inference routing is available only on the Lume PC" });
    try { const body = await readBody(request, 4_096); return respondJson(response, 200, await localInference.infer({ kind: body.kind, input: body.input })); }
    catch (error) { return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "GET" && url.pathname === "/lume-ca.crt") {
    if (!CA_CERT || !fs.existsSync(CA_CERT)) return respondJson(response, 404, { error: "CA certificate unavailable" });
    response.writeHead(200, { "content-type": "application/x-x509-ca-cert", "content-disposition": "attachment; filename=lume-local-ca.crt", "cache-control": "no-store" });
    return fs.createReadStream(CA_CERT).pipe(response);
  }
  if (request.method === "POST" && url.pathname === "/api/direct/chat") {
    const address = normalizeAddress(request.socket.remoteAddress || "unknown");
    if (!directLimiter.allow(address)) return respondJson(response, 429, { error: "rate limit exceeded" });
    let body; try { body = await readBody(request, 16_384); } catch (error) { return respondJson(response, 400, { error: error.message }); }
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    const controller = new AbortController();
    response.on("close", () => { if (!response.writableEnded) controller.abort(); });
    let sentence = ""; let audioChain = Promise.resolve(); let spoke = false;
    const queueSpeech = text => {
      const phrase = text.trim(); if (!body.voice || !phrase) return;
      audioChain = audioChain.then(async () => {
        if (!spoke) { spoke = true; emitDirect("voice.speaking", `voice-${body.session_id}`, "Lume is speaking"); }
        const audio = await voiceRequest("/synthesize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: phrase }), signal: controller.signal });
        writeSse(response, "audio", audio);
      });
    };
    try {
      await directChat.chat({ sessionId: body.session_id, mode: body.mode, message: body.message, signal: controller.signal, onEvent: (event, data) => {
        writeSse(response, event, data);
        if (event === "delta" && body.voice) {
          sentence += data.text;
          const parts = sentence.split(/(?<=[.!?])\s+/); sentence = parts.pop() || "";
          for (const part of parts) queueSpeech(part);
        }
      } });
      queueSpeech(sentence); await audioChain;
      if (spoke) emitDirect("voice.stopped", `voice-${body.session_id}`, "Speech complete");
    }
    catch (error) { writeSse(response, "error", { error: error.message }); }
    if (!response.destroyed) response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/direct/transcribe") {
    const taskId = `voice-${crypto.randomUUID()}`; emitDirect("voice.transcribing", taskId, "Transcribing locally");
    try {
      const audio = await readBytes(request); const result = await voiceRequest("/transcribe", { method: "POST", headers: { "content-type": request.headers["content-type"] || "audio/webm" }, body: audio });
      emitDirect("voice.transcribed", taskId, "Transcription ready"); return respondJson(response, 200, result);
    } catch (error) { emitDirect("voice.failed", taskId, error.message); return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "POST" && url.pathname === "/api/direct/listening") {
    const taskId = `voice-${crypto.randomUUID()}`; emitDirect("voice.listening", taskId, "Listening on this device");
    return respondJson(response, 202, { task_id: taskId });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/direct/audio/")) {
    const id = url.pathname.slice("/api/direct/audio/".length);
    if (!/^[a-f0-9]{32}$/.test(id)) return respondJson(response, 400, { error: "invalid audio id" });
    const file = path.join(DIRECT_AUDIO, `${id}.wav`);
    if (!fs.existsSync(file)) return respondJson(response, 404, { error: "audio expired" });
    response.writeHead(200, { "content-type": "audio/wav", "cache-control": "private, max-age=600", "content-length": fs.statSync(file).size });
    return fs.createReadStream(file).pipe(response);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/direct/session/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/direct/session/".length));
    if (!SESSION_ID.test(id)) return respondJson(response, 400, { error: "invalid session id" });
    directChat.sessions.clear(id); return respondJson(response, 200, { cleared: true });
  }
  if (request.method === "POST" && url.pathname === "/api/direct/memory") {
    if (!authorized(request)) return respondJson(response, 403, { error: "memory saving is available only on the Lume PC" });
    try {
      const body = await readBody(request); const session = directChat.sessions.load(body.session_id);
      const index = session.messages.findIndex(item => item.id === body.message_id && item.role === "assistant");
      if (index < 1 || session.messages[index - 1].role !== "user") throw new Error("exchange not found");
      const exchange = session.messages.slice(index - 1, index + 1);
      const result = memoryStore.save({ domain: "episode", title: "Direct conversation with Lume", summary: exchange.map(item => `${item.role}: ${item.content}`).join("\n").slice(0, 1200), importance: 0.6, provenance: { source: "lume.direct", session_id: body.session_id, message_id: body.message_id, saved_at: new Date().toISOString() } });
      engine.ingest({ event: "memory.saved", task_id: `memory-${result.id}`, source: "lume.direct", timestamp: new Date().toISOString(), foreground: false });
      return respondJson(response, 200, { result });
    } catch (error) { return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "GET" && url.pathname === "/api/identity") {
    try { return respondJson(response, 200, JSON.parse(fs.readFileSync(IDENTITY, "utf8"))); }
    catch (_) { return respondJson(response, 503, { error: "identity profile unavailable" }); }
  }
  if (request.method === "GET" && url.pathname === "/api/self") {
    try { return respondJson(response, 200, JSON.parse(fs.readFileSync(SELF_MODEL, "utf8"))); }
    catch (_) { return respondJson(response, 503, { error: "self model unavailable" }); }
  }
  if (request.method === "GET" && url.pathname === "/api/projects") return respondJson(response, 200, { projects });
  if (request.method === "GET" && url.pathname === "/api/personality") return respondJson(response, 200, personalitySnapshot());
  if (request.method === "GET" && url.pathname === "/api/memory/search") return respondJson(response, 200, { results: searchMemory(url.searchParams.get("q") || "") });
  if (request.method === "GET" && url.pathname === "/api/memory/records") return respondJson(response, 200, { records: memoryStore.list({ domain: url.searchParams.get("domain") || undefined }) });
  if (request.method === "GET" && url.pathname === "/api/capsule") return respondJson(response, 200, buildIdentityCapsule(url.searchParams.get("q") || ""));
  if (request.method === "POST" && url.pathname === "/api/memory") {
    if (!authorized(request)) return respondJson(response, 403, { error: "local authenticated source required" });
    try {
      const body = await readBody(request); let result; let event = "memory.updated";
      if (body.operation === "save") { result = memoryStore.save(body.record); event = "memory.saved"; }
      else if (body.operation === "update") result = memoryStore.update(body.id, body.changes || {});
      else if (body.operation === "archive") result = memoryStore.archive(body.id);
      else if (body.operation === "consolidate") { result = memoryStore.consolidate(); event = "memory.consolidated"; }
      else throw new Error("unsupported memory operation");
      engine.ingest({ event, task_id: `memory-${body.operation}`, source: "lume.memory", timestamp: new Date().toISOString(), foreground: false });
      return respondJson(response, 200, { result });
    } catch (error) { return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "POST" && url.pathname === "/api/personality/evidence") {
    if (!authorized(request)) return respondJson(response, 403, { error: "local authenticated source required" });
    try {
      const result = recordEvidence({ evidence: await readBody(request), storePath: PERSONALITY, evidencePath: PERSONALITY_EVIDENCE, auditPath: PERSONALITY_AUDIT });
      if (result.changed) engine.ingest({ event: "personality.updated", task_id: result.change_id, source: "lume.dna", timestamp: new Date().toISOString(), label: `${result.trait} evolved`, foreground: false });
      return respondJson(response, 200, result);
    } catch (error) { return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "POST" && url.pathname === "/api/personality/rollback") {
    if (!authorized(request)) return respondJson(response, 403, { error: "local authenticated source required" });
    try {
      const body = await readBody(request);
      const result = rollbackTraitChange({ storePath: PERSONALITY, auditPath: PERSONALITY_AUDIT, change_id: body.change_id, reason: body.reason });
      engine.ingest({ event: "personality.updated", task_id: result.change_id, source: "lume.dna", timestamp: new Date().toISOString(), label: `${result.trait} change rolled back`, foreground: false });
      return respondJson(response, 200, result);
    } catch (error) { return respondJson(response, 400, { error: error.message }); }
  }
  if (request.method === "GET" && url.pathname === "/api/events") {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    response.write(`event: state\ndata: ${JSON.stringify(decorateState(engine.snapshot()))}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/events") {
    if (!authorized(request)) return respondJson(response, 403, { error: "local authenticated event source required" });
    let raw = "";
    request.on("data", chunk => { raw += chunk; if (raw.length > 16_384) request.destroy(); });
    request.on("end", () => {
      try { return respondJson(response, 202, engine.ingest(JSON.parse(raw))); }
      catch (error) { return respondJson(response, 400, { error: error.message }); }
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") return respondJson(response, 200, { ok: true, state: engine.snapshot().state });
  if (request.method === "GET" && serveStatic(response, url.pathname)) return;
  respondJson(response, 404, { error: "not found" });
}

const server = http.createServer(handleRequest);

function handleUpgrade(request, socket) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const key = request.headers["sec-websocket-key"];
  if (!["/api/ws", "/events"].includes(url.pathname) || !isTrusted(request) || typeof key !== "string") return socket.destroy();
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets.add(socket);
  socket.write(websocketFrame(decorateState(engine.snapshot())));
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
  socket.on("data", data => { if ((data[0] & 0x0f) === 0x8) socket.end(); });
}
server.on("upgrade", handleUpgrade);

server.listen(PORT, HOST, () => {
  process.stdout.write(`Lume embodiment listening at http://${HOST}:${PORT}\n`);
});

let secureServer = null;
if (TLS_KEY && TLS_CERT && fs.existsSync(TLS_KEY) && fs.existsSync(TLS_CERT)) {
  secureServer = https.createServer({ key: fs.readFileSync(TLS_KEY), cert: fs.readFileSync(TLS_CERT) }, handleRequest);
  secureServer.on("upgrade", handleUpgrade);
  secureServer.listen(HTTPS_PORT, "0.0.0.0", () => process.stdout.write(`Lume Hatch listening at https://0.0.0.0:${HTTPS_PORT}\n`));
}

let enrollmentServer = null;
if (process.env.LUME_ENROLLMENT === "1" && CA_CERT && fs.existsSync(CA_CERT)) {
  enrollmentServer = http.createServer((request, response) => {
    if (!isTrusted(request)) return respondJson(response, 403, { error: "trusted home LAN required" });
    if (request.url === "/lume-ca.crt") { response.writeHead(200, { "content-type": "application/x-x509-ca-cert", "content-disposition": "attachment; filename=lume-local-ca.crt", "cache-control": "no-store" }); return fs.createReadStream(CA_CERT).pipe(response); }
    if (request.url !== "/") return respondJson(response, 404, { error: "not found" });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Enroll Lume</title><h1>Trust Lume on this device</h1><ol><li><a href="/lume-ca.crt">Download the public Lume CA certificate</a>.</li><li>Install it as a CA certificate in this device security settings.</li><li>Open <a href="https://lume.local:8443">https://lume.local:8443</a>.</li></ol><p>This endpoint serves only the public certificate and these instructions. The private key never leaves the Lume PC.</p>');
  });
  enrollmentServer.listen(ENROLLMENT_PORT, "0.0.0.0", () => process.stdout.write(`Temporary CA enrollment at http://0.0.0.0:${ENROLLMENT_PORT}\n`));
}

// Structured OpenClaw lifecycle events are authoritative. The journal bridge is
// opt-in for diagnosis only: log parsing can never drive the avatar in normal use.
const stopBridge = process.env.LUME_ENABLE_JOURNAL_BRIDGE === "1"
  ? startGatewayLogBridge({ emit: event => { try { engine.ingest(event); } catch (_) {} } })
  : () => {};
function stop() {
  stopBridge();
  for (const client of clients) client.end();
  for (const socket of sockets) socket.destroy();
  secureServer?.close(); secureServer?.closeAllConnections?.();
  enrollmentServer?.close(); enrollmentServer?.closeAllConnections?.();
  server.close(); server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 100).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
