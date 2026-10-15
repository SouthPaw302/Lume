# GitHub sandbox bridge

Lume and remote sandbox agents communicate through the public repository without
running another local gateway.

## Causal path

1. The existing local evolution cycle selects and deploys one bounded canary.
2. During that same cycle, the bridge checks GitHub once.
3. If no sandbox task is open, it publishes one redacted issue labeled
   `lume:sandbox-task`.
4. A manually started sandbox agent claims the issue, creates a
   `sandbox/<candidate-id>` branch, and opens a PR into `evolution`.
5. The PR body includes `Lume-Bridge-Task: #<issue>` and a redacted
   EvidenceBundle. GitHub checks and an independent reviewer audit it.
6. Later local cycles record returned PRs in
   `${LUME_DATA_DIR}/bridge/github.json`. A merge to `evolution` is still only a
   candidate; local longitudinal survival gates any later `main` promotion.

Only one task remains open at a time. The bridge is a short-lived `gh` CLI call,
not a daemon, model, or second gateway. GitHub failure is non-critical and is
retried by the next evolution cycle.

## Sandbox-agent pickup

Open the repository's issues filtered by `lume:sandbox-task`. The issue contains
the complete public task. The agent must not request local transcripts, private
memory, tokens, or runtime databases. Builders cannot approve or promote their
own work.
