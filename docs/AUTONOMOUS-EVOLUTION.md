# Autonomous evolution

The authoritative loop is:

1. Hash the historical Markdown substrate as generation zero.
2. Compile replayable mutations from all seven experiment families.
3. Express each mutation as a lineage candidate without live writes.
4. Evaluate candidates on replay, safety, leakage, and transfer fixtures.
5. Keep the Pareto front plus explicit deterministic random controls.
6. Let an independent builder express survivors in an issue/branch/PR.
7. Let a different evaluator and auditor attempt to falsify the claim.
8. Merge qualified changes to `evolution`, never directly to `main`.
9. Run one local canary and record later operational outcomes.
10. Retain and reproduce survivors or restore their recorded parent commit.

## Records

- `Genome` describes the complete inheritable phenotype.
- `ExperimentManifest` bounds producer, seed, budget, targets, and roles.
- `EvidenceBundle` binds baseline/candidate output to independent judgments.
- `PromotionRecord` binds ancestry, fitness, audits, deployment, and rollback.

Schemas are enforced in `src/evolution/contracts.js`. Runtime state is private
under `${LUME_DATA_DIR}/evolution`; only redacted evidence and hashes may become
GitHub artifacts.

## Failure behavior

OpenAI, Telegram, optional models, and any one runner are non-critical. The
controller continues with deterministic compilers and sends the raw verified
report if narration is unavailable. No hosted workflow can promote directly to
`main`; missing local-canary evidence leaves a candidate on `evolution`.

Daily and major-event reports are rendered by the installed local Piper voice
and delivered through the `lume-live` Hermes Telegram profile. If local speech
or media delivery fails, the same verified deterministic report is sent as
text. Report delivery never invokes an inference model and never blocks the
experiment controller.

Remote sandbox work uses the low-resource GitHub queue described in
`docs/SANDBOX-BRIDGE.md`. The local controller performs one bounded GitHub check
inside its existing cycle; it does not run another resident bridge or gateway.
