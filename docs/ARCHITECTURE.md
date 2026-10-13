# LumeAI architecture

The core owns identity capsules, typed developmental memory, deterministic
events, experiments, evaluation, approval, and rollback. Harness adapters may
request these capabilities but cannot bypass their gates.

## Data boundary

Source and schemas are versioned here. Private records, transcripts, evidence,
sessions, downloaded models, and secrets live under `LUME_DATA_DIR`, defaulting
to `~/.local/share/lumeai`. Every record carries provenance and a truth class:
`verified`, `reported`, `inferred`, `canon`, or `speculative`.

## Development lifecycle

`proposed -> shadow_tested -> exercised -> validated -> approved -> promoted`

Terminal states are `neutral`, `rejected`, `regressed`, `rolled_back`, and
`expired`. Promotion requires repeated evidence, regression safety, an approval
signature, and a reversible snapshot of the live policy.

Before signing, `build_approval_card(id)` returns the candidate hypothesis,
bounded behavior target, evidence digests, validation count, tradeoffs, and
explicit promotion and rollback actions. The card is descriptive; only the
HMAC-linked Cardona approval can unlock promotion.

## Harness migration

OpenClaw remains available as the live fallback. Hermes profiles run against
the same capsule, tools, model routes, and fixtures. Telegram is not moved until
Hermes passes continuity, tool-policy, recovery, and regression gates.

## Replay and recovery

`src/replay.js` constructs the canonical envelope shared by both harness
adapters. `src/model-client.js` attempts declared endpoints in order, records
which body answered, and fails closed when all are unavailable. Replay output,
including blocked-run diagnostics, belongs under external `LUME_DATA_DIR`.

Historical fixtures are sampled from local OpenClaw transcripts into a private
external file. They retain hashed source provenance, redact credential-shaped
content, exclude scheduled cron chatter, and are never admitted to Git.

Harness compatibility and candidate improvement are distinct gates. A
same-policy OpenClaw/Hermes replay passes on equivalent deterministic behavior;
an experimental mutation remains subject to strict blinded preference and may
not turn a judge's stylistic preference into claimed development.
