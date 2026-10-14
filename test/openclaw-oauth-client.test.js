"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { OpenClawOAuthClient, boundedPrompt } = require("../src/openclaw-oauth-client");

test("bounds accumulated conversation before invoking the OAuth transport", () => {
  const prompt = boundedPrompt([{ role: "developer", content: "a".repeat(50_000) }, { role: "user", content: "b".repeat(50_000) }]);
  assert.ok(prompt.length < 65_000);
  assert.match(prompt, /OLDER CONVERSATION OMITTED/);
  assert.ok(prompt.endsWith("b".repeat(100)));
});

test("OpenClaw OAuth client uses stored-auth inference without exposing credentials", async () => {
  let invocation;
  const exec = async (binary, args, options) => {
    invocation = { binary, args, options };
    return { stdout: JSON.stringify({ ok: true, provider: "openai", model: "gpt-5.5", outputs: [{ text: "hello" }] }), stderr: "" };
  };
  const client = new OpenClawOAuthClient({ exec, nodePath: "/node", cliPath: "/openclaw/index.js" });
  const result = await client.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.text, "hello");
  assert.equal(result.endpoint, "openclaw-oauth");
  assert.ok(invocation.args.includes("infer") && invocation.args.includes("--json"));
  assert.ok(!invocation.args.some(value => /sk-|access[_-]?token|refresh[_-]?token/i.test(value)));
});
