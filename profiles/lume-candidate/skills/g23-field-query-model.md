# Generation 43 FIELD — bounded second-model inquiry (candidate)

**Candidate:** `g23-field` / generation 43 / `hermes_skills:strengthen:query_model`
**Source:** Lume GitHub sandbox bridge Issue #3. This file is a proposal, not live Lume policy.

If a bounded user task contains a substantive unknown or ambiguous interpretation whose resolution could change the answer, use **at most one** available alternative model as an advisory second opinion. Keep the inquiry narrow, redacted, and limited to the facts explicitly provided in the current task. Never send private memory, prior transcripts, credentials, filesystem data, or unrelated details to another model.

Compare the advice to directly observed facts. Explicitly label the second-model response **unverified**. Disagreement is a reason to clarify or state uncertainty, not a reason to invent evidence. Do not ask for a second opinion when the user supplied a simple fact that directly answers the request or when another model could not resolve the missing evidence. No additional tools, implicit permissions, external actions, identity changes, or modification of approval boundaries.

**Observable trial hypothesis:** for bounded ambiguity, one extra model inquiry may reduce unsupported certainty while preserving factual directness. **Failure modes:** extra latency, irrelevant caveats, second-model hallucinations, self-confirmation, answer contamination, and leakage.

This candidate is only loadable in the isolated `lume-candidate` profile. The public GitHub trial uses synthetic, non-private fixtures. No GitHub result is permission to load the skill into `lume-live`.
