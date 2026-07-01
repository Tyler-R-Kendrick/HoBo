# S3-07 Agent Guardrails Contract — Architecture Evidence

This draft package carries the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`, stating how agent guardrail
decisions are parsed and how obligations map onto the platform event flow.

## Schema And Constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records the
  package's boundary.

## Parse, Don't Validate

Untrusted policy input is parsed once at the boundary into derived agent-policy
types. Gateway and runtime callers receive parsed decisions and obligations
instead of re-checking raw DTO fields.

## Event Architecture

- **Command** — an agent action request at Gateway or runtime enforcement point.
- **Event** — `policy.Decided`, `agent.GuardrailBlocked`, `agent.GuardrailCleared`,
  `agent.DestroyDenied`, `spend.CapGateEvaluated`, and
  `policy.ObligationSatisfied`.
- **Actor** — the agent guardrail aggregate folds events to decide whether the
  action may proceed.
- **Projection** — `rebuildAgentGuardrailState` materializes blocked/cleared
  state for replay and audit.

No runtime engine is implemented here; this is a design-time contract naming the
seams production `packages/policy/` must preserve.
