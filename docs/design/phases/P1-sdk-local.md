# Build stage 1 — SDK on the local runtime

> [Phases index](./README.md) · realizes [Plan 2](../02-sdk-api.md), [Plan 21](../21-resources-catalog.md), [Plan 22](../22-wiring-manifest.md), [Plan 20](../20-wasm-wasi-runtime.md), [Plan 15](../15-cli-dx.md).

**Objective.** A developer (or agent) can author an app **IfC-style**, run it as a **wasm component** on `runtime-local` with the full runtime (workflows/actors/sagas/agents), and have resources **collected into a manifest** — all offline, with replay.
**Depends on.** Stage 0.

> **Resource Definitions / Matching / Deltas:** resources gain a **`class`** ([Plan 21](../21-resources-catalog.md)); platform engineers can author **Resource Definitions** locally and the local Planner resolves them by **Matching** (emitting `match.Decided`) — the `hobo.config.ts` mapping compiles to default definitions ([Plan 25](../25-resource-definitions-matching.md)); `hobo dev` exercises **Deltas→Sets** + Camp **environment types** on `runtime-local` ([Plan 26](../26-environments-deltas.md)).

## Workstream 1 — Authoring & resources (`@hobo/sdk`)
1. Resource builders for the full catalog ([Plan 21](../21-resources-catalog.md)): `api`, `kv`, `bucket`, `queue`, `topic`, `secret`, `sql`, `schedule`, `websocket`, `job`, `web`, `service`.
2. The **`.allow(verbs)`** model with typed per-resource verbs; record permission intent for IAM + links + token scope.
3. Handler/trigger registration (`api.get`, `topic.subscribe`, `bucket.on`, `schedule.cron`, `queue` workers, `websocket.on`, `job.handler`).
4. The advanced explicit `bindle()` topology API (escape hatch) — same primitives, declared by hand.

## Workstream 2 — IfC resource-collection → manifest IR
1. **Resource-collection mode:** run a component capturing resource + `.allow()` declarations without executing handlers ([Plan 21](../21-resources-catalog.md)).
2. Emit the **manifest IR** ([Plan 22](../22-wiring-manifest.md)) with resources, links, endpoints, env, annotations; content-address + record as `bindle.ManifestProduced` ([Plan 11](../11-event-model.md)).
3. Bindings/references (Aspire-style, lazy) resolve into typed `ctx.bindings.<name>` clients generated from WIT ports.

## Workstream 3 — Runtime primitives (`@hobo/runtime`)
1. `step` (memoized, retried), `workflow` (deterministic replay), `emit`, `sleep`, `cron`, hooks/webhooks, streams.
2. `actor`/grain (durable state via ActorHost), `saga` (choreography + compensation).
3. `agent()` skeleton (full identity/tools wiring lands in stage 3) and **`stub()`** placeholders ([Plan 23](../23-stubbable-ai-implementations.md)).
4. Determinism guarantees (seeded RNG/clock, frozen env) verified by replay.

## Workstream 4 — Components (`@hobo/componentize`, `@hobo/build-wasm`)
1. Build a TS service → **wasm component** via jco/componentize; generate guest types from WIT.
2. Run components on the local wasm host with the link table wired to `runtime-local`-backed providers (in-memory/local equivalents).
3. Produce + load components as **OCI artifacts** locally (fallback: plain OCI container).

## Workstream 5 — CLI & local dashboard (`@hobo/cli`)
1. `hobo new` (templates), `hobo dev` (run on `runtime-local`, hot reload), `hobo collect` (print manifest), `hobo inspect`/`logs`, `hobo stub`.
2. Local dashboard MVP: architecture/topology view, run inspector, resource browsers, trigger buttons ([Plan 7](../07-ui-dashboard.md)).

## Deliverables
- `@hobo/sdk` + `@hobo/runtime` + `@hobo/componentize` + `@hobo/cli`; `examples/hello-bindle`; local dashboard MVP.

## Exit criteria (acceptance)
- `hello-bindle` **runs offline** as a wasm component on `runtime-local`, exercising a workflow + actor + saga + a stubbed port.
- `hobo collect` emits a **manifest** that matches a fixture (IfC-collection test).
- **Replay == live state** determinism test is green.
- Local dashboard shows the topology, a run trace, and lets you trigger a schedule/topic.

## Risks / iteration hooks
- Directive (`"use workflow"`) compiler transform vs pure runtime wrappers ([Plan 2](../02-sdk-api.md)).
- IfC collection fidelity for non-TS languages (run-to-collect vs static analysis).
- jco/StarlingMonkey build ergonomics + cold-start of the local wasm host.
