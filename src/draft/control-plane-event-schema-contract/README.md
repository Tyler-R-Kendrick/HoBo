# Control-plane event schema contract POC

This draft pins the M0 control-plane event vocabulary for HOBO-39.

It covers:

- `deployment.*`, `match.Decided`, `set.*`, `delta.*`, `resource.*`, `exec.*`, and `dispatch.Decided` event types.
- Required envelope linkage: `correlationId` and `causationId` on every event.
- Deterministic `deployment.Planned` content addressing.
- ADR-0033 `match.Decided` fields: winner, full ranking, rejected candidates, objective, tie flag, catalog content hash, and optional per-rank region/rationale fields.
- ADR-0071 `dispatch.Decided` fields: selected runner/build-machine provider plus pinned `CreditLedgerView@seq` and reservation input.
- A JSON schema, Protobuf descriptor, Zod validator surface, generated event metadata, and a `codegen:check` drift gate.
- An explicit compatibility marker for `@hobo/core/EventEnvelope@v1` until the greenfield `@hobo/core` package exists.

This is intentionally a contract POC. It does not implement runtime ports, policy/compat events, credit-ledger folding, IaC execution, or orchestration.
