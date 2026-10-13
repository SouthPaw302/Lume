# Hermes profile templates

These templates are copied into isolated Hermes profiles after Hermes passes
its CLI health check. They contain no credentials or live channel tokens.

- `lume-live` - stable approved policy only.
- `lume-baseline` - immutable comparison profile.
- `lume-candidate` - no live writes and no external tools.
- `lume-evaluator` - independent blinded evaluation; cannot promote.
