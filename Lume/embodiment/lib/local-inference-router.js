"use strict";

const ROUTES = Object.freeze({
  classify: { device: "moto", maxInput: 800, maxTokens: 72, temperature: 0.1 },
  extract: { device: "moto", maxInput: 800, maxTokens: 96, temperature: 0.1 },
  label: { device: "moto", maxInput: 600, maxTokens: 48, temperature: 0.1 },
  triage: { device: "moto", maxInput: 800, maxTokens: 96, temperature: 0.1 },
  summarize: { device: "s10", maxInput: 1600, maxTokens: 180, temperature: 0.2 },
  draft: { device: "s10", maxInput: 1600, maxTokens: 180, temperature: 0.4 },
  interpret: { device: "s10", maxInput: 1600, maxTokens: 180, temperature: 0.3 },
});

function routeFor(kind) {
  const route = ROUTES[String(kind || "").toLowerCase()];
  if (!route) throw new Error("unsupported local inference task");
  return route;
}

class LocalInferenceRouter {
  constructor({ fetchImpl = fetch, s10Url = "http://192.168.12.82:12435", motoUrl = "http://127.0.0.1:12436" } = {}) {
    this.fetch = fetchImpl;
    this.urls = { s10: s10Url.replace(/\/$/, ""), moto: motoUrl.replace(/\/$/, "") };
  }

  async infer({ kind, input, signal }) {
    const route = routeFor(kind);
    const text = String(input || "").replace(/\0/g, "").trim().slice(0, route.maxInput);
    if (!text) throw new Error("input is required");
    const instruction = route.device === "moto"
      ? "Return only the requested compact classification, extraction, label, or triage result. Do not claim tool or file access."
      : "Give a concise grounded response using only the supplied text. State uncertainty. Do not claim tool or file access.";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let response;
    try {
      response = await this.fetch(`${this.urls[route.device]}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ model: "local", stream: false, max_tokens: route.maxTokens, temperature: route.temperature, messages: [{ role: "system", content: instruction }, { role: "user", content: text }] }),
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
    if (!response.ok) throw new Error(`${route.device} local model unavailable (${response.status})`);
    const body = await response.json();
    const output = String(body.choices?.[0]?.message?.content || "").trim();
    if (!output) throw new Error(`${route.device} returned an empty response`);
    return { device: route.device, kind, output };
  }
}

module.exports = { LocalInferenceRouter, ROUTES, routeFor };
