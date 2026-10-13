"use strict";

const http = require("node:http");
const { OpenClawOAuthClient } = require("./openclaw-oauth-client");

const ALLOWED_MODELS = new Set(["openai/gpt-5.5", "openai/gpt-5.6-luna"]);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createOAuthBridge({ clientFactory = options => new OpenClawOAuthClient(options), maxBody = 1_000_000 } = {}) {
  return http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { status: "ok", credential_owner: "openclaw", token_exposed: false });
    if (request.method === "GET" && request.url === "/v1/models") return json(response, 200, { object: "list", data: [...ALLOWED_MODELS].map(id => ({ id, object: "model", owned_by: "openclaw-oauth" })) });
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") return json(response, 404, { error: { message: "not found" } });
    let body = "";
    request.on("data", chunk => { body += chunk; if (body.length > maxBody) request.destroy(); });
    request.on("end", async () => {
      try {
        const input = JSON.parse(body);
        const model = String(input.model || "openai/gpt-5.5");
        if (!ALLOWED_MODELS.has(model)) return json(response, 400, { error: { message: "model is not allowlisted" } });
        if (input.tools?.length) return json(response, 400, { error: { message: "OAuth bridge is inference-only; tools are disabled" } });
        const result = await clientFactory({ model, thinking: "low" }).complete({ messages: input.messages || [] });
        return json(response, 200, { id: `lume-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }], usage: null, lume: { credential_owner: "openclaw", endpoint: result.endpoint, latency_ms: result.latency_ms } });
      } catch (error) {
        return json(response, 502, { error: { message: "OpenClaw OAuth inference failed", type: "oauth_broker_failure" } });
      }
    });
  });
}

module.exports = { ALLOWED_MODELS, createOAuthBridge };
