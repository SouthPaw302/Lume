"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { compile } = require("../src/evolution/compiler");
const { evidenceBundle, experimentManifest, genome, promotionRecord } = require("../src/evolution/contracts");
const { dominates, paretoFront } = require("../src/evolution/fitness");
const { inventory } = require("../src/evolution/provenance");
const { applyMutation, deploy, resolve } = require("../src/evolution/canary");
const { asTelegram, buildReport } = require("../src/evolution/report");
const { decide, observe } = require("../src/evolution/canary-evaluator");
const { issueBody, localCheckIssues, parseTaskReference, safeCandidate } = require("../src/evolution/github-bridge");

test("all seven experiment families compile to replayable executable mutations", () => {
  const families = ["brainfuck", "field", "snake", "cellular-automata", "books", "self-reflection", "personality"];
  for (const family of families) {
    const first = compile(family, "fixed-seed"); const second = compile(family, "fixed-seed");
    assert.equal(first.executable, true); assert.deepEqual(first, second); assert.ok(first.mutation.target);
  }
});

test("FIELD crosses into a bounded Hermes or GitHub action", () => {
  const result = compile("field", "field-seed");
  assert.ok(["observe_episode", "query_model", "alter_skill", "spawn_github_task", "combine_lineages", "change_allocation", "propose_code"].includes(result.mutation.action));
});

test("universal records enforce independence and protected boundaries", () => {
  const created_at = "2026-10-14T00:00:00.000Z";
  assert.ok(genome({ id: "g0", created_at }).digest);
  assert.throws(() => experimentManifest({ id: "x", producer: "field", seed: "s", mutation_grammar: "v1", predicted_consequence: "x", expires_at: created_at, change_class: "code", targets: ["promotion-verifier"] }), /protected/);
  assert.throws(() => evidenceBundle({ candidate_id: "x", evaluator_id: "same", builder_id: "same" }), /cannot evaluate itself/);
  assert.ok(promotionRecord({ candidate_commit: "abc", rollback_commit: "parent", previous_evaluator: "eval-v0" }).digest);
});

test("selection preserves non-dominated candidates instead of one scalar winner", () => {
  const useful = { id: "useful", fitness: { usefulness: 1, novelty: 0.1 } }; const novel = { id: "novel", fitness: { usefulness: 0.1, novelty: 1 } };
  assert.equal(dominates(useful.fitness, novel.fitness), false); assert.deepEqual(paretoFront([useful, novel]), [useful, novel]);
});

test("founding inventory hashes markdown and labels private memory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lume-provenance-")); fs.writeFileSync(path.join(dir, "MEMORY.md"), "private continuity");
  const result = inventory([dir], dir); assert.equal(result.records.length, 1); assert.equal(result.records[0].truth_class, "private-memory"); assert.ok(result.corpus_digest);
});

test("identity canary is real, singular, and automatically reversible", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lume-canary-"));
  const candidate = { id: "identity-1", family: "personality", expressed: { mutation: { target: "identity_layers", operation: "propose_patch", value: { trait: "patient persistence" } } } };
  const active = deploy({ dataDir: dir, candidate }); assert.notEqual(active.before_digest, active.after_digest);
  assert.equal(deploy({ dataDir: dir, candidate: { ...candidate, id: "other" } }).candidate_id, "identity-1");
  const rolled = resolve({ dataDir: dir, outcome: "rollback", reason: "failed transfer" }); assert.equal(rolled.status, "rolled_back");
  assert.deepEqual(applyMutation({}, candidate.expressed.mutation).identity_layers, [{ trait: "patient persistence" }]);
});

test("Telegram report distinguishes applied changes from proposals", () => {
  const dialogue = ["questioner", "advocate", "skeptic", "synthesizer"].map(role => ({ role, text: role }));
  const report = buildReport({ generation: 2, survivors: ["candidate"], population: [{ id: "candidate", family: "field", status: "selected_for_canary" }], canary: { candidate_id: "older", status: "observing", before_digest: "a", after_digest: "b" }, latest_socratic: { book: "A real book", dialogue } }, new Date("2026-10-14T00:00:00Z"));
  const text = asTelegram(report); assert.match(text, /not carrying any experimental change/); assert.doesNotMatch(text, /not accepted as part of me/); assert.match(text, /A real book/); assert.match(text, /Questioner, Advocate, Skeptic, and Synthesizer/); assert.match(text, /Nothing from this cycle was promoted permanently/); assert.doesNotMatch(text, /candidate: observing/);
});

test("canary evaluator waits three windows and then makes a reversible decision", () => {
  const canary = { candidate_id: "g1-books", deployed_generation: 1, expression: { mutation: { target: "hermes_skills", operation: "add_expiring_strategy", value: {} } } };
  const rows = [2, 3, 4].map(generation => observe(canary, generation));
  assert.equal(decide(rows.slice(0, 2)).ready, false);
  const final = decide(rows); assert.equal(final.ready, true); assert.ok(["retain", "neutral", "rollback"].includes(final.outcome));
  assert.ok(rows.every(row => row.evidence_kind === "deterministic_transfer_proxy"));
});

test("GitHub bridge publishes a redacted single-candidate sandbox contract", () => {
  const candidate = safeCandidate({ generation: 8, canary: { candidate_id: "g7-snake", family: "snake", status: "observing", expression: { mutation: { target: "hermes_skills", operation: "strengthen", value: 0.1 } } } });
  assert.equal(candidate.candidate_id, "g7-snake");
  const body = issueBody(candidate);
  assert.match(body, /public, redacted handoff/);
  assert.match(body, /PR into `evolution`/);
  assert.equal(parseTaskReference("Evidence\nLume-Bridge-Task: #42"), 42);
  assert.equal(parseTaskReference("no bridge marker"), null);
});

test("local PC verification handoffs appear separately from sandbox experiment tasks", () => {
  const issues = [
    { number: 6, state: "open", title: "[Lume local check] Validate PC/S10", html_url: "https://github.com/SouthPaw302/Lume/issues/6" },
    { number: 3, state: "open", title: "[Lume sandbox] Express g23-field", html_url: "https://github.com/SouthPaw302/Lume/issues/3" },
    { number: 7, state: "closed", title: "[Lume local check] old", html_url: "https://github.com/SouthPaw302/Lume/issues/7" },
    { number: 8, state: "open", title: "[Lume local check] PR", html_url: "https://github.com/SouthPaw302/Lume/pull/8", pull_request: {} }
  ];
  assert.deepEqual(localCheckIssues(issues), [{ number: 6, title: "[Lume local check] Validate PC/S10", url: "https://github.com/SouthPaw302/Lume/issues/6" }]);
  assert.deepEqual(localCheckIssues([]), []);
});
