# Phase P0 — Foundations

> [Phases index](./README.md) · realizes [Plan 1](../01-monorepo.md), [Plan 11](../11-event-model.md), [Plan 20](../20-wasm-wasi-runtime.md), [Plan 24](../24-wit-worlds-reference.md), [Plan 9](../09-verification-open-questions.md).

**Objective.** Stand up the monorepo, the core contracts (types, ports-as-WIT, event envelope, Hobo Code schema), the built-in local World, and the conformance harness — so every later phase builds on a stable, testable base.
**Depends on.** Nothing (greenfield).

> **v3 (Humanitec):** `@hobo/core` adds the **Resource Definition** + **Matching** types, the **Driver** interface ([Plan 25](../25-resource-definitions-matching.md)/[Plan 27](../27-drivers-packs-profiles.md)), and the `match.Decided`/`delta.*`/`set.*`/`pipeline.*` events ([Plan 11](../11-event-model.md)); `@hobo/conformance` gains a **Driver** contract-suite slot so later phases can certify drivers.

## Workstream 1 — Monorepo & tooling
1. Initialize pnpm workspace + Turborepo; root `tsconfig` (strict, `nodenext`); Biome; Vitest; Changesets.
2. Create the package skeletons from [Plan 1](../01-monorepo.md): `core`, `wit`, `sdk`, `runtime`, `componentize`, `cli`, `worlds/*`, `providers/*`, `iac/*`, `build/*`, `cloud`, `registry`, `identity`, `mcp`, `conformance`, `examples/*`.
3. Enforce the **dependency rule** (adapters depend only on `core`'s interfaces) via lint/boundary checks.
4. CI pipeline: typecheck → lint → unit → conformance → build; add SBOM + vuln-scan gate stub ([Plan 12](../12-security-multitenancy.md)).

## Workstream 2 — `@hobo/core` contracts
1. **EventEnvelope** type + append/read semantics + idempotency/optimistic-concurrency rules ([Plan 11](../11-event-model.md)).
2. **Port interfaces** as TS mirrors of the canonical WIT worlds ([Plan 24](../24-wit-worlds-reference.md)).
3. **Hobo Code schema** (`capabilities.json` / `auth.json` / `cost.json`) types + validators ([Plan 6](../06-ai-native-agent-auth.md)).
4. DI/container + the `World` interface (`events`/`queue`/`streams`/`actors`/`clock`).

## Workstream 3 — `@hobo/wit` (the ports)
1. Author the `hobo:*` WIT worlds (`workflow`, `actor`, `saga`, `agent`, control-plane `scheduler`/`provisioning`/`observability`/`config`) — [Plan 24](../24-wit-worlds-reference.md).
2. Vendor + pin the reused `wasi:*` worlds (`http`, `keyvalue`, `blobstore`, `messaging`, `sql`, `config`, `logging`).
3. Set up `jco guest-types` generation → typed TS bindings consumed by `@hobo/sdk`/`@hobo/runtime`.

## Workstream 4 — `@hobo/world-local` (built-in engine)
1. Implement `EventStore` (SQLite/file append log, subscriptions, snapshots).
2. Implement `Queue` (at-least-once + idempotency dedup) and `Streamer` (per-run streams).
3. Implement `ActorHost` (single-writer lease + fencing token) and a deterministic `Clock` (durable timers).
4. Provide a `testWorld()` mode (drive time, assert events, replay) for [Plan 9](../09-verification-open-questions.md).

## Workstream 5 — `@hobo/conformance` (the trust boundary)
1. Test harness that runs a suite against any adapter instance.
2. First suites: the five World ports (EventStore/Queue/Streamer/ActorHost/Clock).
3. Wire conformance into CI as a required gate.

## Deliverables
- A buildable monorepo; `@hobo/core` + `@hobo/wit` published internally; `@hobo/world-local`; `@hobo/conformance` with World-port suites; green CI.

## Exit criteria (acceptance)
- `world-local` **passes all World-port conformance** tests in CI.
- An event log **appends and replays** to identical state (determinism harness).
- `jco`-generated types compile against the authored WIT worlds.
- Dependency-boundary lint passes (no adapter imports another adapter).

## Risks / iteration hooks
- Wasm host of record for `world-local` (Wasmtime vs jco-in-Node) — decide here, it colors P1.
- `hobo:*` WIT naming/versioning + tracking upstream `wasi:*` draft churn.
- Built-in-engine scope vs always recommending an external World in prod ([Plan 5](../05-reliability-ha.md)).
