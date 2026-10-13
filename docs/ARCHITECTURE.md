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

## Harness migration

OpenClaw remains available as the live fallback. Hermes profiles run against
the same capsule, tools, model routes, and fixtures. Telegram is not moved until
Hermes passes continuity, tool-policy, recovery, and regression gates.
