# ADR: Allow triple-effects compiler seam

## Context

Plan 21 requires one `.allow()` declaration to drive IAM, wasm link grants, and broker token scope without drift. HOBO-631 promotes this into production wiring; this draft POC pins the compiler seam first.

## Decision

- **Single compiler** (`compileAllowTripleEffects`) is the parse boundary: callers pass a validated `AllowDeclaration`; invalid verbs fail at compile time.
- **Three effects are derived**, never authored independently. Tests assert golden triple equality, not per-layer stubs.
- **Token broker ceiling** reuses `identity-event-contract` for `token.Granted` / `token.Denied` audit events.
- **Deny-by-default link table** always sets `denyByDefault: true`; only declared verbs appear in `allowedVerbs`.

## Consequences

- Production promotion can swap IAM/link/broker adapters behind the same compiler output type.
- Unknown ports or verbs fail closed at compile time rather than at deploy/runtime.
- Full S3-03 broker OIDC exchange remains out of scope; this POC stubs ceiling enforcement only.
