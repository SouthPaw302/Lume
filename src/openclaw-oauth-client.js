"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

class OpenClawOAuthClient {
  constructor({
    model = "openai/gpt-5.6-sol",
    agent = "main",
    thinking = "low",
    timeoutMs = 180_000,
    nodePath = "/home/koss/.openclaw/tools/node-v24.15.0/bin/node",
    cliPath = "/home/koss/.openclaw/lib/node_modules/openclaw/dist/index.js",
    exec = execFileAsync
  } = {}) {
    Object.assign(this, { model, agent, thinking, timeoutMs, nodePath, cliPath, exec });
  }

  async complete(request) {
    const prompt = (request.messages || []).map(message => {
      const simple = typeof message.content === "string" && !message.tool_calls && !message.tool_call_id && !message.name;
      return `${String(message.role || "user").toUpperCase()}:\n${simple ? message.content : JSON.stringify(message)}`;
    }).join("\n\n");
    const started = Date.now();
    const { stdout } = await this.exec(this.nodePath, [this.cliPath, "infer", "model", "run", "--local", "--agent", this.agent, "--model", this.model, "--thinking", this.thinking, "--prompt", prompt, "--json"], { timeout: this.timeoutMs, maxBuffer: 8 * 1024 * 1024, cwd: path.dirname(this.cliPath) });
    const envelope = JSON.parse(String(stdout));
    if (!envelope.ok) throw new Error(envelope.error?.message || "OpenClaw OAuth inference failed");
    const text = String(envelope.outputs?.[0]?.text || "").trim();
    if (!text) throw new Error("OpenClaw OAuth inference returned an empty response");
    return { text, model: `${envelope.provider}/${envelope.model}`, producer_id: `${envelope.provider}/${envelope.model}`, endpoint: "openclaw-oauth", latency_ms: Date.now() - started, response_id: null };
  }
}

module.exports = { OpenClawOAuthClient };
