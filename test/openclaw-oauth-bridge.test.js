"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createOAuthBridge } = require("../src/openclaw-oauth-bridge");

test("OAuth bridge is loopback-compatible, inference-only, and does not expose tokens", async t => {
  const server = createOAuthBridge({ clientFactory: ({ model }) => ({ complete: async () => ({ text: `reply:${model}`, endpoint: "openclaw-oauth", latency_ms: 1 }) }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.token_exposed, false);
  const good = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-5.5", messages: [{ role: "user", content: "hi" }] }) });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).choices[0].message.content, "reply:openai/gpt-5.5");
  const blocked = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-5.5", messages: [], tools: [{ type: "function" }] }) });
  assert.equal(blocked.status, 400);
});
