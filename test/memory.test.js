"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { DevelopmentalMemory } = require("../src/memory");

function memory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lume-memory-"));
  return new DevelopmentalMemory({ recordsPath: path.join(dir, "records.jsonl"), episodesPath: path.join(dir, "episodes.jsonl"), clock: () => new Date("2026-10-13T00:00:00Z") });
}

test("requires typed provenance and truth class", async () => {
  const store = memory();
  await assert.rejects(() => store.save({ type: "fact", truth_class: "verified", text: "missing provenance" }), /provenance/);
  await assert.rejects(() => store.save({ type: "fact", truth_class: "fiction", text: "bad class", provenance: { source: "test" } }), /truth class/);
});

test("retrieves relevant records and excludes canon by default", async () => {
  const store = memory();
  await store.save({ type: "preference", truth_class: "reported", text: "Cardona prefers concise grounded replies", importance: 0.9, provenance: { source: "user" } });
  await store.save({ type: "fact", truth_class: "canon", text: "A fictional starship crosses time", importance: 1, provenance: { source: "mythos" } });
  const hits = await store.retrieve("What replies does Cardona prefer?", { limit: 5 });
  assert.equal(hits.length, 1); assert.match(hits[0].text, /concise/);
});
