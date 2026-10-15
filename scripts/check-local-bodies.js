#!/usr/bin/env node
"use strict";

// Run on the Lume PC, not in GitHub Actions. Probes established loopback ADB
// forwards, Hatch, and the local voice service. Never contacts a cloud model.
const fs = require("node:fs");

const DEFAULTS = Object.freeze({
  s10: "http://127.0.0.1:12435",
  kiwix: "http://127.0.0.1:18081",
  aurelian: "http://127.0.0.1:18082",
  hatch: "http://127.0.0.1:8788",
  voice: "http://127.0.0.1:8790"
});

function endpoints(env = process.env) {
  return {
    s10: env.LUME_QWEN_URL || DEFAULTS.s10,
    kiwix: env.LUME_KIWIX_URL || DEFAULTS.kiwix,
    aurelian: env.LUME_AURELIAN_URL || DEFAULTS.aurelian,
    hatch: env.LUME_DIAGNOSTIC_HATCH_URL || DEFAULTS.hatch,
    voice: env.LUME_VOICE_URL || DEFAULTS.voice
  };
}
function url(base, route) { return base.replace(/\/$/, "") + route; }

async function probe(fetchImpl, target, label, suffix, timeoutMs = 3000) {
  try {
    const result = await fetchImpl(url(target, suffix), { signal: AbortSignal.timeout(timeoutMs) });
    return { service: label, ok: result.ok, http_status: result.status, url: url(target, suffix) };
  } catch (error) {
    return { service: label, ok: false, error: error.name === "TimeoutError" ? "timeout" : "unreachable", url: url(target, suffix) };
  }
}

async function diagnose({ fetchImpl = fetch, env = process.env, voiceRoundtrip = false, sampleWav = null } = {}) {
  const ep = endpoints(env);
  const targets = [
    ["s10", ep.s10, "/health"],
    ["kiwix", ep.kiwix, "/"],
    ["aurelian", ep.aurelian, "/health"],
    ["hatch", ep.hatch, "/health"],
    ["hatch_ui", ep.hatch, "/"],
    ["hatch_chat_dependencies", ep.hatch, "/api/direct/health"],
    ["voice", ep.voice, "/health"]
  ];
  const results = await Promise.all(targets.map(([name, base, route]) => probe(fetchImpl, base, name, route)));
  const extra = {};
  // Hatch's own dependency summary is useful even when the frontend serves.
  const direct = results.find(r => r.service === "hatch_chat_dependencies");
  if (direct?.ok) {
    try {
      const reply = await fetchImpl(url(ep.hatch, "/api/direct/health"), { signal: AbortSignal.timeout(3000) });
      if (!reply.ok) throw Error("status not OK");
      const details = await reply.json();
      for (const key of ["hatch", "s10", "moto", "kiwix", "bridge", "stt", "tts"]) if (typeof details[key] === "boolean") extra[key] = details[key];
    } catch (_) { extra.health_details = "not_parseable"; }
  }
  if (voiceRoundtrip) {
    try {
      const synthesis = await fetchImpl(url(ep.voice, "/synthesize"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Lume voice smoke test." }),
        signal: AbortSignal.timeout(30000)
      });
      if (!synthesis.ok) throw Error("synthesis failed");
      const body = await synthesis.json();
      if (!/^\/api\/direct\/audio\/[a-f0-9]{32}$/.test(body.url || "")) throw Error("invalid synthesized audio path");
      const audio = await fetchImpl(url(ep.hatch, body.url), { signal: AbortSignal.timeout(5000) });
      if (!audio.ok) throw Error("audio stream failed");
      const bytes = Buffer.from(await audio.arrayBuffer());
      if (bytes.length <= 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw Error("invalid WAV payload");
      extra.tts_roundtrip = { ok: true, bytes: bytes.length };
    } catch (error) { extra.tts_roundtrip = { ok: false, reason: error.message }; }
  }
  if (sampleWav) {
    try {
      const audio = fs.readFileSync(sampleWav);
      if (!audio.length || audio.length > 8 * 1024 * 1024) throw Error("sample WAV must be 1–8 MB or less");
      const response = await fetchImpl(url(ep.voice, "/transcribe"), {
        method: "POST", headers: { "content-type": "audio/wav" }, body: audio,
        signal: AbortSignal.timeout(120000)
      });
      if (!response.ok) throw Error("transcription failed");
      const transcript = await response.json();
      extra.stt_roundtrip = { ok: typeof transcript.text === "string" && transcript.text.trim().length > 0, language: transcript.language || null };
    } catch (error) { extra.stt_roundtrip = { ok: false, reason: error.message }; }
  }
  const required = new Set(["s10", "kiwix", "hatch", "hatch_ui", "hatch_chat_dependencies", "voice"]);
  const ok = results.filter(r => required.has(r.service)).every(r => r.ok)
    && (!voiceRoundtrip || extra.tts_roundtrip?.ok === true)
    && (!sampleWav || extra.stt_roundtrip?.ok === true);
  return { schema_version: 1, mode: "local-only", ok, services: results, hatch_dependencies: extra };
}
if (require.main === module) {
  diagnose({
    voiceRoundtrip: process.argv.includes("--voice-roundtrip"),
    sampleWav: process.argv.includes("--sample-wav") ? process.argv[process.argv.indexOf("--sample-wav") + 1] : null
  }).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { DEFAULTS, diagnose, endpoints, probe };
