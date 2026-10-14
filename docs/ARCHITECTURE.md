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

Hermes is the live Telegram harness. OpenClaw's gateway is disabled and retained
as a cold rollback; its stored OpenAI OAuth is consumed through a loopback-only
bridge. `/home/koss/clawd` remains the external historical laboratory and live
messaging workspace, while this repository owns the runtime-independent core.

The external archive index at `LUME_DATA_DIR/archive/index.jsonl` covers dated
memory, canon notes, SECOND_BRAIN, research reports, nightly outputs, and key
identity files. `npm run archive:search -- <query>` searches it without loading
the multi-gigabyte archive into model context. `npm run core:context -- <query>`
returns Lume's identity and typed-memory capsule for harness consumption.

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
