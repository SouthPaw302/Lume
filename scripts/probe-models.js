#!/usr/bin/env node
"use strict";

// Honest capability report: a model is available only after executing a
// runtime probe. Manifest "existing" is an assertion, not verification.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { atomicJson } = require("../src/io");
const config = require("../config/models.json");

function command(name, args = ["--version"]) {
  const result = spawnSync(name, args, { encoding: "utf8", timeout: 5000 });
  return { available: result.status === 0, detail: String(result.stdout || result.stderr || "").trim().slice(0, 300) };
}
async function health(base) {
  if (!base) return { available: false, verified: false, reason: "endpoint_not_configured" };
  try {
    const u = new URL(base);
    const response = await fetch(new URL("/health", u), { signal: AbortSignal.timeout(3000) });
    return { reachable: response.ok, available: false, verified: false, status: response.status, reason: response.ok ? "health_only_inference_not_probed" : "health_endpoint_failed" };
  } catch (error) {
    return { available: false, verified: false, reason: error.cause?.code || error.name };
  }
}
async function inference(base) {
  const up = await health(base);
  if (!up.reachable) return up;
  try {
    const response = await fetch(new URL("/v1/chat/completions", base), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "local", messages: [{ role: "user", content: "Say OK." }], max_tokens: 8, temperature: 0, stream: false }),
      signal: AbortSignal.timeout(90000)
    });
    if (!response.ok) return { ...up, reason: "inference_http_" + response.status };
    const body = await response.json();
    const text = String(body.choices?.[0]?.message?.content || "").trim();
    return { reachable: true, available: Boolean(text), verified: Boolean(text), reason: text ? "real_text_inference_completed" : "inference_empty", status: response.status };
  } catch (error) { return { ...up, reason: "inference_" + (error.cause?.code || error.name) }; }
}
async function embeddingProbe() {
  if (!process.argv.includes("--verify-embedding")) return { available: false, verified: false, reason: "inference_not_probed_use_--verify-embedding" };
  try {
    const { createEmbeddingProvider } = require("../src/embeddings");
    const provider = createEmbeddingProvider();
    if (!provider) return { available: false, verified: false, reason: "embedding_disabled" };
    const result = await Promise.race([provider("Lume local vector probe."), new Promise((_, reject) => setTimeout(() => reject(Error("inference_timeout")), 45000))]);
    if (!Array.isArray(result) || result.length !== 384 || result.some(v => !Number.isFinite(v))) throw Error("embedding_vector_invalid");
    return { available: true, verified: true, reason: "384_dimension_inference_completed", dimensions: result.length };
  } catch (error) { return { available: false, verified: false, reason: String(error.message).slice(0, 180) }; }
}
async function probeRoutes(routes, env = process.env, probes = {}) {
  const out = {};
  for (const [id, route] of Object.entries(routes)) {
    let check;
    if (route.endpointEnv) check = env[route.endpointEnv] ? await (process.argv.includes("--verify-inference") ? (probes.inference || inference) : (probes.health || health))(env[route.endpointEnv]) : { available: false, verified: false, reason: "endpoint_not_configured" };
    else if (id === "embedding") check = await (probes.embedding || embeddingProbe)();
    else if (id === "textToSpeech") check = await (probes.health || health)(env.LUME_VOICE_URL || "http://127.0.0.1:8790");
    else check = { available: false, verified: false, reason: "not_inference_probed" };
    out[id] = { family: route.family, configured_status: route.status, runtime: route.runtime || null, ...check };
  }
  return out;
}
async function main() {
  const routes = await probeRoutes(config.routes);
  const report = {
    schema_version: 2, probed_at: new Date().toISOString(), routes,
    runtimes: {
      node: command("node"), python: command("python3"),
      transformers: { installed: fs.existsSync(path.join(process.cwd(), "node_modules", "@huggingface", "transformers")), verified: false, reason: "package_present_is_not_model_inference" }
    }
  };
  const output = path.join(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"), "models", "capabilities.json");
  atomicJson(output, report); console.log(JSON.stringify({ output, report }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { embeddingProbe, health, inference, probeRoutes };
