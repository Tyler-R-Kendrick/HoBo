# ADR: Convex as a thin HoBo CloudProvider

## Status

Accepted — implements the ADR-0144 thin-adapter rule
(`docs/design/adr/07-portability-extensibility.md#adr-0144`).

## Context

Convex is an adjacent reactive TypeScript BaaS (`docs/competitors/convex.md`)
whose cleanest relationship to HoBo is *infrastructure HoBo orchestrates*: a
Bindle's `data`/`bucket`/`api` resources realized onto a Convex deployment via
Resource Definitions and Matching. Dual authoring and deep runtime embedding
are historically expensive and explicitly out of scope; the risks are
over-claiming fidelity (document store ≠ relational, reactive queries ≠
event-sourced replay) and leaking static deploy keys.

## Decision

1. **One-directional realization only.** The provider maps three equivalence
   classes (`web/service`, `database/reactive`, `objectStore`) onto Convex
   services with deliberately narrow feature lists; `require` negotiation
   surfaces misses as `partial(missing)` verdicts, never fabricated parity.
   Vector search and scheduling ride as capability features because no
   `vector`/scheduler port exists in `@hobo/core` today.
2. **Driver, not IaC.** `realize()` emits a `convex-deploy` driver program
   (`hobo.driver-program/v1`) targeting the Management API; emitted programs
   are asserted parse-don't-validate before leaving the package.
3. **Broker-held deploy keys.** Auth posture is `deploy-key-brokered` with
   `staticSecrets: false`; the credential-gated client fails closed without a
   broker-minted key and inspects env presence only. Missing credentials fail
   closed.
4. **Impedance is typed, not prose-only.** Hard limits, the `document`
   paradigm, and paradigm-mismatch findings are exported constants/functions
   consumed as PortabilityReport evidence (ADR-0024), so planners and agents
   cannot assume full fidelity.
5. **Escape hatches stay Yard-scoped.** Convex-specific options ride Camp/Yard
   `.with(...)` annotations; Bindles reject provider annotations by
   construction (`assertNoBindleProviderSelection`).

## Consequences

- (+) Convex becomes selectable through ordinary Matching with honest cost
  facts and auditable `match.Decided` records.
- (+) Portability erosion is visible: every Convex-specific dependency is
  either a scored `.with()` annotation or a recorded paradigm mismatch.
- (−) Fidelity is deliberately partial: no control-plane time-travel or
  cross-Yard Trails for data living inside Convex; only the provisioning
  lifecycle is event-sourced.
