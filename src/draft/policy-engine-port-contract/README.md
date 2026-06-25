# policy-engine port contract POC

This draft proves HOBO-100's policy-engine seam without implementing a production policy engine.

It records:

- WIT-shaped `policy-engine` port: `compile-ruleset` and `evaluate`.
- Typed TypeScript rule authoring shape for the built-in engine.
- Evidence stamping via `decision.evidence.engine`.
- Conformance checks for deny-by-default, deterministic decisions, and fail-closed ruleset compile failures.

Scope intentionally excludes OPA/Cedar adapters, deny-ceiling algebra, and obligation execution.
