"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DirectChatService } = require("../Lume/embodiment/lib/direct-chat");
const { LocalInferenceRouter } = require("../Lume/embodiment/lib/local-inference-router");
const { DEFAULTS, diagnose, endpoints } = require("../scripts/check-local-bodies");

test("Hatch and router defaults match ADB-forwarded USB ports", () => {
  const chat = new DirectChatService({ sessionDirectory: "/tmp/lume-test", buildCapsule: () => ({}), emit: () => {} });
  const router = new LocalInferenceRouter();
  assert.equal(chat.qwenUrl, DEFAULTS.s10);
  assert.equal(chat.kiwixUrl, DEFAULTS.kiwix);
  assert.equal(router.urls.s10, DEFAULTS.s10);
  assert.equal(DEFAULTS.aurelian, "http://127.0.0.1:18082");
});

test("explicit user environment URL settings still override defaults", () => {
  const resolved = endpoints({ LUME_QWEN_URL: "http://127.0.0.1:9999", LUME_KIWIX_URL: "http://127.0.0.1:9998" });
  assert.equal(resolved.s10, "http://127.0.0.1:9999");
  assert.equal(resolved.kiwix, "http://127.0.0.1:9998");
});

test("local diagnostic distinguishes HTTP availability from dependent health", async () => {
  const calls = [];
  const mock = async (url) => {
    calls.push(url);
    if (url.endsWith("/api/direct/health")) return { ok: true, status: 200, json: async () => ({ hatch: true, s10: true, moto: false, kiwix: true, bridge: true, stt: true, tts: true }) };
    return { ok: true, status: 200 };
  };
  const result = await diagnose({ fetchImpl: mock });
  assert.equal(result.ok, true);
  assert.equal(result.services.length, 7);
  assert.equal(result.hatch_dependencies.moto, false);
  assert(calls.some(url => url === "http://127.0.0.1:18081/"));
  assert(calls.some(url => url === "http://127.0.0.1:18082/health"));
});

test("local diagnostic fails closed when USB model is unreachable", async () => {
  const result = await diagnose({ fetchImpl: async url => {
    if (url.includes(":12435")) throw Error("not connected");
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  assert.equal(result.ok, false);
  assert.equal(result.services.find(x => x.service === "s10").error, "unreachable");
});

test("optional voice roundtrip verifies a WAV payload rather than a health flag", async () => {
  const wav = Buffer.alloc(48); wav.write("RIFF", 0, "ascii"); wav.write("WAVE", 8, "ascii");
  const mock = async (url, options = {}) => {
    if (url.endsWith("/api/direct/health")) return { ok: true, status: 200, json: async () => ({ tts: true, stt: true }) };
    if (url.endsWith("/synthesize")) return { ok: true, status: 200, json: async () => ({ url: "/api/direct/audio/" + "a".repeat(32) }) };
    if (url.includes("/api/direct/audio/")) return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(wav).buffer };
    return { ok: true, status: 200 };
  };
  const result = await diagnose({ fetchImpl: mock, voiceRoundtrip: true });
  assert.equal(result.ok, true);
  assert.equal(result.hatch_dependencies.tts_roundtrip.ok, true);
  assert.equal(result.hatch_dependencies.tts_roundtrip.bytes, 48);
});
