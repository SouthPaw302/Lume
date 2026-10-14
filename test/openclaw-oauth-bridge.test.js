"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createOAuthBridge, parseToolResponse } = require("../src/openclaw-oauth-bridge");

test("OAuth bridge is loopback-compatible and does not expose tokens", async t => {
  const server = createOAuthBridge({ clientFactory: ({ model }) => ({ complete: async () => ({ text: `reply:${model}`, endpoint: "openclaw-oauth", latency_ms: 1 }) }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.token_exposed, false);
  const good = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-5.5", messages: [{ role: "user", content: "hi" }] }) });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).choices[0].message.content, "reply:openai/gpt-5.5");
  const withTool = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-5.5", messages: [], tools: [{ type: "function", function: { name: "terminal" } }] }) });
  assert.equal(withTool.status, 200);
});

test("OAuth bridge translates only tools offered by Hermes", () => {
  const parsed = parseToolResponse('{"tool_calls":[{"name":"memory","arguments":{"action":"read"}}]}', new Set(["memory"]));
  assert.equal(parsed.tool_calls[0].function.name, "memory");
  assert.throws(() => parseToolResponse('{"tool_calls":[{"name":"terminal","arguments":{}}]}', new Set(["memory"])), /did not offer/);
});
