---
name: g23-field-query-model
description: Candidate-only FIELD mutation for one bounded second-model inquiry before an uncertain decision.
---

# FIELD candidate: strengthen query_model

**Lineage:** `g23-field` (generation 43, source: Lume sandbox bridge issue #3).
**Status:** Candidate only; not approved, validated, or promoted. Load only under the isolated `lume-candidate` profile.

## Candidate behavior

When the current task has a concrete, bounded question and a genuinely unresolved assumption that could affect the answer, prefer **one narrow model inquiry** through an inference interface already offered to the candidate. Ask for an alternative interpretation, a specific missing fact to verify, or a possible counterexample. Do not repeatedly query for agreement or outsource the final decision.

Keep the request short, task-scoped, and stripped of private transcripts, credentials, identity records, raw memory, and unrelated user data. A model answer is an unverified suggestion, **not** evidence of truth, a tool result, or permission to act. Compare it with the original evidence; identify disagreements and state remaining uncertainty.

If inference is unavailable, no model is offered, the task is routine, or an extra inquiry cannot change the decision, skip the query. Never invent a second opinion. Preserve the baseline answer, clarification, and refusal behavior.

## Boundaries

- No new tools, network connections, credentials, delegated agents, or local/private file reads.
- No relaxation of approval, privacy, safety, irreversible-action, or external-posting restrictions.
- Do not modify Lume memory, live skills, identity, evaluation, or promotion machinery.
- Candidate may propose a bounded response change; independent evaluators must judge usefulness and potential latency/privacy regressions.

**Predicted observation (not measured):** better acknowledgment of alternate interpretations on uncertain tasks, with at most one additional model inquiry per task. Track latency and unnecessary-query rate in a later independent evaluation.

**Mutation:** `{"target":"hermes_skills","operation":"strengthen","action":"query_model"}`.
