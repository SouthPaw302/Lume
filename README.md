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
```

OpenClaw remains the migration baseline. Hermes is the target harness, but both
consume the same core interfaces and neither owns Lume.
