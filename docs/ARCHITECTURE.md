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

Cardona granted standing local autonomy on 2026-10-14. The system controller may
sign and promote a validated candidate without a new prompt after independent
evaluation, repeated prospective Telegram evidence, and regression-free gates.
The proposing model cannot score or promote itself. Regression triggers automatic
rollback. External posting, sensing, destructive actions, and secret disclosure
are outside this standing authorization.

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
bridge. This repository now owns the Hatch server, local voice code, scheduled
development controller, and runtime-independent core. `/home/koss/clawd` is a
historical/private data source and currently also supplies the known-good Python
voice environment and local book corpus; neither dependency owns Lume's state.

## Local bodies

The old PC is the authoritative home: Hermes, identity and memory, Hatch,
experiment state, GitHub bridge, reports, and recovery ledger. The connected S10
is a USB-attached inference coprocessor. Termux runs llama.cpp `llama-server`
with the local Qwen3 4B GGUF, Kiwix, and Aurelian. ADB forwards those loopback
services to PC ports 12435, 18081, and 18082; Wi-Fi is not required. The watchdog
maintains the forwards and remote processes while allowing one long-running
llama.cpp slot up to thirty minutes before declaring it stalled.

Hatch is served from `Lume/embodiment` over the private home LAN and shows the
active Hermes-controlled generation and canary. Short companion conversations
use S10 Qwen; speech recognition and Piper voice remain local to the PC.

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
