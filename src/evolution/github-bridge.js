"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { atomicJson, readJson } = require("../io");

const LABEL = "lume:sandbox-task";
const DEFAULT_REPOSITORY = "SouthPaw302/Lume";

function runGh(args, options = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    timeout: options.timeout || 30_000,
    input: options.input,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" }
  });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "GitHub CLI failed").trim());
  return String(result.stdout || "");
}

function safeCandidate(state = {}) {
  const active = state.canary;
  if (!active?.candidate_id || !active?.family) return null;
  return {
    candidate_id: String(active.candidate_id),
    family: String(active.family),
    generation: Number(state.generation || 0),
    status: String(active.status || "unknown"),
    mutation: active.expression?.mutation || active.expressed?.mutation || null
  };
}

function issueBody(candidate) {
  const manifest = JSON.stringify({ schema_version: 1, ...candidate });
  return [
    "## Lume sandbox bridge task",
    "",
    "This is a public, redacted handoff from Lume's local Hermes controller. No private memory is attached.",
    "",
    "### Builder assignment",
    "",
    "1. Reproduce the candidate from the manifest below on a new `sandbox/<candidate-id>` branch.",
    "2. Express one bounded change as a skill, policy, workflow, identity Markdown diff, or code change.",
    "3. Add tests and a redacted EvidenceBundle. Do not fetch or infer private local state.",
    "4. Open a PR into `evolution` (never `main`). Include `Lume-Bridge-Task: #ISSUE` in the PR body.",
    "5. Request an independent review. The builder must not approve its own candidate.",
    "",
    "### Guardrails",
    "",
    "Do not alter the promotion verifier, evidence ledger, secret filters, active evaluator, or GitHub permissions. Hosted work may propose a candidate but cannot promote it to `main`.",
    "",
    "```json lume-bridge-manifest",
    manifest,
    "```"
  ].join("\n");
}

function parseTaskReference(body = "") {
  const match = String(body).match(/Lume-Bridge-Task:\s*#(\d+)/i);
  return match ? Number(match[1]) : null;
}

function sync(options = {}) {
  const repository = options.repository || process.env.LUME_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const dataDir = path.resolve(options.dataDir || process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
  const state = readJson(path.join(dataDir, "evolution", "state.json"), {});
  const candidate = safeCandidate(state);
  const bridgeDir = path.join(dataDir, "bridge");
  const statusPath = path.join(bridgeDir, "github.json");
  fs.mkdirSync(bridgeDir, { recursive: true, mode: 0o700 });

  const openIssues = JSON.parse(runGh(["api", `repos/${repository}/issues`, "-f", "state=open", "-f", `labels=${LABEL}`, "-f", "per_page=20", "--method", "GET"]) || "[]")
    .filter(item => !item.pull_request);
  let published = null;
  if (candidate && !openIssues.length) {
    const title = `[Lume sandbox] Express ${candidate.candidate_id}`;
    const created = JSON.parse(runGh([
      "api", `repos/${repository}/issues`, "--method", "POST",
      "-f", `title=${title}`, "-f", `body=${issueBody(candidate)}`, "-f", `labels[]=${LABEL}`
    ]) || "{}");
    published = { number: created.number, url: created.html_url, candidate_id: candidate.candidate_id };
    openIssues.push(created);
  }

  const pulls = JSON.parse(runGh(["api", `repos/${repository}/pulls`, "-f", "state=all", "-f", "base=evolution", "-f", "per_page=30", "--method", "GET"]) || "[]");
  const returned = pulls.map(pr => ({
    number: pr.number,
    url: pr.html_url,
    state: pr.merged_at ? "merged" : pr.state,
    head: pr.head?.ref,
    task: parseTaskReference(pr.body)
  })).filter(pr => pr.task);
  const status = {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    repository,
    candidate: candidate?.candidate_id || null,
    open_tasks: openIssues.map(issue => ({ number: issue.number, url: issue.html_url, title: issue.title })),
    returned_prs: returned,
    published,
    mode: "single-task-poll"
  };
  atomicJson(statusPath, status);
  fs.chmodSync(statusPath, 0o600);
  return status;
}

module.exports = { DEFAULT_REPOSITORY, LABEL, issueBody, parseTaskReference, safeCandidate, sync };
