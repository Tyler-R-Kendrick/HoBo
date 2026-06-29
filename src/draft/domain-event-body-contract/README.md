# Domain Event Body Contract POC

This package is an independent proof for HOBO-42. It pins the M0 typed domain
event-body contract:

- Canonical WIT records as the single upstream for event body, projection, and mapping shapes.
- Generated TypeScript, Protobuf descriptor, Zod validator source, and CUE constraint views.
- Byte-stable Protobuf event-body round trips without implementing `EventEnvelope` storage.
- Zod/WIT authoring parity and fail-closed divergence checks.
- Constraint and version-evolution guards for invalid values and non-additive field renames.

Out of scope by design: EventStore append/read behavior, PACT provider/consumer testing,
upcaster chains, and projection-sink migrations.

Run:

```powershell
npm.cmd --prefix src\draft\domain-event-body-contract test
npm.cmd --prefix src\draft\domain-event-body-contract run codegen:check
```


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Domain Event Body Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
