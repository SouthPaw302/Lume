"use strict";

const http = require("node:http");
const { OpenClawOAuthClient } = require("./openclaw-oauth-client");

const ALLOWED_MODELS = new Set(["openai/gpt-5.6-sol", "openai/gpt-5.6-luna"]);

function toolName(tool) { return String(tool?.function?.name || tool?.name || ""); }

function parseToolResponse(text, offeredTools = new Set()) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { content: text, tool_calls: null }; }
  if (!Array.isArray(parsed.tool_calls) || !parsed.tool_calls.length) return { content: String(parsed.content || text), tool_calls: null };
  const calls = parsed.tool_calls.map((call, index) => {
    const name = String(call.name || call.function?.name || "");
    if (!offeredTools.has(name)) throw new Error("model requested a tool Hermes did not offer");
    const args = call.arguments ?? call.function?.arguments ?? {};
    return { id: String(call.id || `lume-tool-${Date.now()}-${index}`), type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } };
  });
  return { content: null, tool_calls: calls };
}

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
        const model = String(input.model || "openai/gpt-5.6-sol");
        if (!ALLOWED_MODELS.has(model)) return json(response, 400, { error: { message: "model is not allowlisted" } });
        const tools = Array.isArray(input.tools) ? input.tools : [];
        const offeredTools = new Set(tools.map(toolName).filter(Boolean));
        const messages = [...(input.messages || [])];
        if (tools.length) messages.push({ role: "system", content: `You are behind a constrained tool-call transport. Available tools: ${JSON.stringify(tools.map(tool => tool.function || tool))}. To call tools, return ONLY JSON {"tool_calls":[{"name":"tool_name","arguments":{}}]}. Otherwise return ONLY JSON {"content":"your reply"}. Never invent a tool name.` });
        const result = await clientFactory({ model, thinking: "low" }).complete({ messages });
        const parsed = tools.length ? parseToolResponse(result.text, offeredTools) : { content: result.text, tool_calls: null };
        const message = { role: "assistant", content: parsed.content };
        if (parsed.tool_calls) message.tool_calls = parsed.tool_calls;
        return json(response, 200, { id: `lume-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message, finish_reason: parsed.tool_calls ? "tool_calls" : "stop" }], usage: null, lume: { credential_owner: "openclaw", endpoint: result.endpoint, latency_ms: result.latency_ms } });
      } catch (error) {
        return json(response, 502, { error: { message: "OpenClaw OAuth inference failed", type: "oauth_broker_failure" } });
      }
    });
  });
}

module.exports = { ALLOWED_MODELS, createOAuthBridge, parseToolResponse };
