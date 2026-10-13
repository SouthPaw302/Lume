"use strict";
const assert = require("assert");
const { LocalInferenceRouter, routeFor } = require("../lib/local-inference-router");

assert.equal(routeFor("classify").device, "moto");
assert.equal(routeFor("summarize").device, "s10");
assert.throws(() => routeFor("run-tools"), /unsupported/);

(async () => {
  let called = "";
  const router = new LocalInferenceRouter({ fetchImpl: async (url, options) => {
    called = url;
    const request = JSON.parse(options.body);
    assert(request.messages[1].content.length <= 800);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "routine-failure" } }] }) };
  } });
  const result = await router.infer({ kind: "classify", input: "x".repeat(2000) });
  assert(called.includes("12436"));
  assert.deepEqual(result, { device: "moto", kind: "classify", output: "routine-failure" });
  process.stdout.write("local inference router tests passed\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
