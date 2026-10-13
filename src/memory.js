"use strict";

const crypto = require("crypto");
const { appendJsonl, readJsonl } = require("./io");

const RECORD_TYPES = new Set(["episode", "fact", "decision", "preference", "procedure", "reflection", "candidate_trait", "validated_trait", "adaptation"]);
const TRUTH_CLASSES = new Set(["verified", "reported", "inferred", "canon", "speculative"]);

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])];
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

function normalizeRecord(input, now = new Date()) {
  if (!input || typeof input !== "object") throw new Error("memory record is required");
  if (!RECORD_TYPES.has(input.type)) throw new Error("unsupported memory type");
  if (!TRUTH_CLASSES.has(input.truth_class)) throw new Error("unsupported truth class");
  if (!input.provenance || typeof input.provenance !== "object" || !input.provenance.source) throw new Error("memory provenance.source is required");
  const text = String(input.text || input.summary || "").trim();
  if (!text) throw new Error("memory text is required");
  return {
    id: String(input.id || `mem-${crypto.randomUUID()}`),
    type: input.type,
    truth_class: input.truth_class,
    text: text.slice(0, 4000),
    importance: Math.max(0, Math.min(1, Number(input.importance ?? 0.5))),
    usefulness: Math.max(0, Math.min(1, Number(input.usefulness ?? 0))),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.5))),
    status: String(input.status || "active"),
    embedding: Array.isArray(input.embedding) ? input.embedding.map(Number) : undefined,
    provenance: input.provenance,
    created_at: input.created_at || now.toISOString(),
    recorded_at: now.toISOString()
  };
}

class DevelopmentalMemory {
  constructor({ recordsPath, episodesPath, embed = null, clock = () => new Date() }) {
    this.recordsPath = recordsPath;
    this.episodesPath = episodesPath;
    this.embed = embed;
    this.clock = clock;
  }

  async save(input) {
    const record = normalizeRecord(input, this.clock());
    if (this.embed && !record.embedding) record.embedding = await this.embed(record.text);
    appendJsonl(this.recordsPath, record);
    return record;
  }

  recordEpisode(input) {
    const record = normalizeRecord({ ...input, type: "episode" }, this.clock());
    appendJsonl(this.episodesPath, record);
    return record;
  }

  async retrieve(query, policy = {}) {
    const limit = Math.max(1, Math.min(20, Number(policy.limit || 5)));
    const includeCanon = policy.includeCanon === true;
    const allowedTypes = new Set(policy.types || [...RECORD_TYPES]);
    const queryTokens = tokens(query);
    const queryEmbedding = this.embed ? await this.embed(String(query)) : null;
    const now = this.clock().getTime();
    return [...readJsonl(this.recordsPath), ...readJsonl(this.episodesPath)]
      .filter(row => row.status === "active" && allowedTypes.has(row.type) && (includeCanon || row.truth_class !== "canon"))
      .map(row => {
        const textTokens = new Set(tokens(row.text));
        const lexical = queryTokens.length ? queryTokens.filter(t => textTokens.has(t)).length / queryTokens.length : 0;
        const semantic = queryEmbedding ? Math.max(0, cosine(queryEmbedding, row.embedding)) : 0;
        const ageDays = Math.max(0, (now - Date.parse(row.created_at || row.recorded_at)) / 86_400_000);
        const recency = 1 / (1 + ageDays / 30);
        const score = lexical * 0.38 + semantic * 0.34 + recency * 0.1 + Number(row.importance || 0) * 0.1 + Number(row.usefulness || 0) * 0.08;
        return { ...row, retrieval: { lexical, semantic, recency, score } };
      })
      .filter(row => row.retrieval.score >= Number(policy.minimumScore ?? 0.08))
      .sort((a, b) => b.retrieval.score - a.retrieval.score)
      .slice(0, limit);
  }
}

module.exports = { DevelopmentalMemory, RECORD_TYPES, TRUTH_CLASSES, cosine, normalizeRecord, tokens };
