"use strict";

function createEmbeddingClient({ endpoint = process.env.LUME_EMBEDDING_URL, model = "sentence-transformers/all-MiniLM-L6-v2", fetchImpl = fetch } = {}) {
  if (!endpoint) return null;
  return async text => {
    const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/v1/embeddings`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input: String(text) })
    });
    if (!response.ok) throw new Error(`embedding service failed (${response.status})`);
    const body = await response.json(); const vector = body.data?.[0]?.embedding;
    if (!Array.isArray(vector) || !vector.length) throw new Error("embedding service returned no vector");
    return vector.map(Number);
  };
}

function createLocalMiniLM({ model = "onnx-community/all-MiniLM-L6-v2-ONNX", dtype = "q4" } = {}) {
  let extractorPromise;
  return async text => {
    extractorPromise ||= import("@huggingface/transformers").then(({ pipeline }) => pipeline("feature-extraction", model, { dtype }));
    const extractor = await extractorPromise;
    const output = await extractor(String(text), { pooling: "mean", normalize: true });
    return Array.from(output.data);
  };
}

function createEmbeddingProvider(options = {}) {
  if (process.env.LUME_EMBEDDING_MODE === "off") return null;
  return options.endpoint || process.env.LUME_EMBEDDING_URL ? createEmbeddingClient(options) : createLocalMiniLM(options);
}

module.exports = { createEmbeddingClient, createEmbeddingProvider, createLocalMiniLM };
