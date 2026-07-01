# Sandboxed Executors Contract — Architecture Evidence

HOBO-622 draft proof. Documents how sandboxed IaC/build execution is parsed at
the executor seam and how `exec.*` events record the run lifecycle.

## Schema and constraints

- Protobuf data shapes live in [`architecture/`](./architecture).
- CUE constraints bound every protobuf type in that schema.
- A PACT contract under [`architecture/pacts/`](./architecture/pacts) records
  the package boundary.

## Parse, don't validate

Untrusted dispatch input crosses one boundary into parsed `ExecutorJob` values.
Sandbox backend selection, credential scope, and egress allowlists are applied
during parse so invalid combinations are unrepresentable downstream.

## Event architecture

- **Command** — `DispatchSandboxedExec` with parsed job, scope, and egress policy.
- **Events** — `exec.Started`, `exec.Output`, `exec.Succeeded`, `exec.Failed`.
- **Actor** — Yard Executor owns the run lifecycle and credential revocation.
- **Adversarial guard** — undeclared egress maps to `sandbox.EgressDenied` semantics
  and a fatal `exec.Failed` terminus (NFR-007).

No runtime Firecracker, container engine, or event store is implemented here.

## Promotion path

When S2-05/S2-06 land, this contract promotes into
`packages/cloud/src/executors/` with the same public seam: sandbox backend
selection, dev-mode credential stub, egress guard, and `exec.*` event stream.
