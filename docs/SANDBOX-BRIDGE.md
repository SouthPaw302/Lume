# GitHub sandbox bridge

Lume and remote sandbox agents communicate through the public repository without
running another local gateway.

## Causal path

1. The existing local evolution cycle compiles proposals. Deterministic scores never establish a live canary.
2. During that same cycle, the bridge checks GitHub once.
3. If no sandbox task is open, it publishes one redacted issue labeled
   `lume:sandbox-task`.
4. A manually started sandbox agent claims the issue, creates a
   `sandbox/<candidate-id>` branch, and opens a PR into `evolution`.
5. The PR body includes `Lume-Bridge-Task: #<issue>` and a redacted
   EvidenceBundle. GitHub checks and an independent reviewer audit it.
6. Later local cycles record returned PRs in
   `${LUME_DATA_DIR}/bridge/github.json`. A merge to `evolution` is still only a
   candidate, not a live promotion. A locally qualified native experiment must
   have independently judged, real interactions on separate dates before a
   single bounded canary can begin. New canaries are disabled until
   `LUME_ENABLE_EVOLUTION_CANARY=1` is set on the actual PC. Post-deployment
   real interactions alone determine retention or rollback; a stale trial
   expires neutrally. Hosted workflows cannot satisfy local evidence gates.

Only one task remains open at a time. The bridge is a short-lived `gh` CLI call,
not a daemon, model, or second gateway. GitHub failure is non-critical and is
retried by the next evolution cycle.

## Sandbox-agent pickup

Open the repository's issues filtered by `lume:sandbox-task`. The issue contains
the complete public task. The agent must not request local transcripts, private
memory, tokens, or runtime databases. Builders cannot approve or promote their
own work.

## Local-agent verification inbox (separate from sandbox)

A public issue prefixed `[Lume local check]` is a **local hardware/runtime
verification handoff**, not a mutation, builder PR, or `lume:sandbox-task`.
During the same bounded GitHub poll, the bridge reads the repository's open
issues and publishes matching references under
`${LUME_DATA_DIR}/bridge/github.json` as `local_checks`. Only the issue
number, title and URL are copied; private host evidence stays on-device.

The local agent can run `npm run evolution:bridge` to refresh its inbox,
then open the specified issue using
`gh issue view <number> --repo SouthPaw302/Lume`. If the host has not yet
updated its checkout, it can use `gh issue view` directly. A verification
handoff never authorizes a candidate mutation, canary, restart, promotion,
private data upload, or self-evaluation. Report only redacted PASS/PARTIAL/
BLOCKED/FAIL and code SHAs back as an issue comment. The original sandbox
task queue and publication behavior are unchanged. A failure to list local
check issues does not stop sandbox bridge processing.
