#!/usr/bin/env node
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path"); const { spawnSync } = require("node:child_process");
const { atomicJson } = require("../src/io"); const config = require("../config/models.json");
function command(name, args = ["--version"]) { const result = spawnSync(name, args, { encoding: "utf8", timeout: 5000 }); return { available: result.status === 0, detail: String(result.stdout || result.stderr || "").trim().slice(0, 300) }; }
async function endpoint(url) { if (!url) return { available: false, reason: "endpoint_not_configured" }; try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); return { available: response.ok, status: response.status }; } catch (error) { return { available: false, reason: error.cause?.code || error.name }; } }
async function main() {
  const routes = {};
  for (const [id, route] of Object.entries(config.routes)) routes[id] = route.endpointEnv ? { family: route.family, ...(await endpoint(process.env[route.endpointEnv])) } : { family: route.family, available: route.status === "existing", runtime: route.runtime || null, reason: route.status, verified: route.verified || null };
  const report = { schema_version: 1, probed_at: new Date().toISOString(), routes, runtimes: { node: command("node"), python: command("python3"), transformers: { available: fs.existsSync(path.join(process.cwd(), "node_modules", "@huggingface", "transformers")), reason: "package_probe" } } };
  const output = path.join(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"), "models", "capabilities.json"); atomicJson(output, report); console.log(JSON.stringify({ output, report }, null, 2));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
