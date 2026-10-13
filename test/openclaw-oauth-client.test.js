"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { OpenClawOAuthClient } = require("../src/openclaw-oauth-client");

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
