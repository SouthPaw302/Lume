# LumeAI

LumeAI is Cardona's private, local-first hatching companion and developmental
experiment. Lume's identity, memory, personality, evidence, and embodiment are
owned by this project rather than by a model or agent harness.

## Architecture

- `src/` - runtime-independent Lume core.
- `Lume/embodiment/` - deterministic Hatch, voice, and local chat body.
- `adapters/` - OpenClaw and Hermes integration boundaries.
- `experiments/` - versioned experiment definitions and replay fixtures.
- `profiles/` - safe Hermes profile templates with no credentials.
- `test/` - core memory, experiment, approval, and isolation tests.

Private and generated data lives outside Git under
`${LUME_DATA_DIR:-~/.local/share/lumeai}`. Historical `/home/koss/clawd`
remains a read-only source archive during migration.

## Development contract

Experiments may propose reversible behavior changes. They cannot modify live
identity, personality, policy, schedules, secrets, or authoritative memory.
A candidate must beat baseline on recorded episodes, repeat on unseen evidence,
pass regression and leakage gates, and receive a signed Cardona approval before
promotion.

```bash
npm test
npm run check:repo
npm run experiment:demo
npm run profiles:install
npm run fixtures:import-history
npm run replay
```

`fixtures:import-history` creates a private, mode-0600 historical set under the
external data directory. `replay` sends identical tool-free envelopes to the
baseline and candidate, uses the independent evaluator route, and stores its
report outside Git. An unavailable model runtime produces a blocked audit
record and never counts as evidence.

By default, replay uses OpenClaw's stored OpenAI OAuth profile through its
one-shot inference surface. OAuth remains owned and refreshed by OpenClaw; Lume
never reads or copies tokens. Set `LUME_MODEL_BACKEND=local` to exercise the
phone endpoint route instead.

Use `LUME_REPLAY_SET=development LUME_REPLAY_LIMIT=1 npm run replay` for a
bounded OAuth smoke run before executing the complete fixture suite.

`npm run oauth:bridge` exposes that same stored-OAuth inference on loopback at
`127.0.0.1:12437`. Hermes profiles use this endpoint. The bridge accepts only
the allowlisted companion and evaluator models, refuses tools, and never reads
or returns OAuth token material.

The initial Hermes live profile is deliberately inference-only. Lume tools and
memory continue through the audited core boundary rather than being handed to
the OAuth bridge as unrestricted model tools.

OpenClaw remains the migration baseline. Hermes is the target harness, but both
consume the same core interfaces and neither owns Lume.
