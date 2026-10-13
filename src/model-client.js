"use strict";

const crypto = require("node:crypto");

function normalizeEndpoint(value) {
  const url = String(value || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(url)) throw new Error("model endpoint must be an http(s) URL");
  return url.endsWith("/v1") ? url : `${url}/v1`;
}

class OpenAICompatibleClient {
  constructor({ endpoints, fetchImpl = fetch, timeoutMs = 45_000 }) {
    this.endpoints = (endpoints || []).map(item => ({ ...item, url: normalizeEndpoint(item.url) }));
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async complete(request) {
    if (!this.endpoints.length) throw new Error("at least one model endpoint is required");
    const failures = [];
    for (const endpoint of this.endpoints) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = Date.now();
      try {
        const response = await this.fetch(`${endpoint.url}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${endpoint.apiKey || "local"}` },
          signal: controller.signal,
          body: JSON.stringify({ model: endpoint.model || "local", stream: false, ...request })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        const text = String(body.choices?.[0]?.message?.content || "").trim();
        if (!text) throw new Error("empty model response");
        return { text, model: body.model || endpoint.model || "local", endpoint: endpoint.id, latency_ms: Date.now() - started, response_id: body.id || null };
      } catch (error) {
        failures.push({ endpoint: endpoint.id, error: error.name === "AbortError" ? "timeout" : String(error.message || error) });
      } finally {
        clearTimeout(timer);
      }
    }
    const error = new Error(`all model endpoints failed: ${failures.map(row => `${row.endpoint}: ${row.error}`).join("; ")}`);
    error.failures = failures;
    error.failure_id = crypto.createHash("sha256").update(JSON.stringify(failures)).digest("hex").slice(0, 16);
    throw error;
  }
}

module.exports = { OpenAICompatibleClient, normalizeEndpoint };
