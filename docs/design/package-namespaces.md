---
type: Reference
title: "Package Namespace Map"
description: "This note is the canonical import-ownership map for HoBo TypeScript packages. It"
tags: [hobo, design]
---

# Package Namespace Map

This note is the canonical import-ownership map for HoBo TypeScript packages. It
backs ADR-0087 and gives docs, generators, and boundary lint one table to check.

## Namespace Rules

- `hobo:sdk` is the WIT package contract. It is not the same thing as npm
  `@hobo/sdk`.
- `@hobo/bindles` is the app authoring idiom layer. It owns the explicit
  `bindle(name, builderFn)` closure builder, resource catalog builder methods,
  app config references, connector helpers, and fluent bindle composition.
- `@hobo/runtime` is the app runtime authoring layer. It owns workflow, step,
  handler, actor, hook, training, and runtime error primitives.
- `@hobo/data` owns CQRS read/write model helpers. `@hobo/events` owns messaging
  and choreography helpers.
- `@hobo/camps`, `@hobo/yards`, and `@hobo/junctions` own topology factories.
  They stay separate from `@hobo/bindles` so topology placement is visible in
  imports.
- `@hobo/sdk` is the operator and self-host SDK. It owns provider/resource
  implementation contracts, policy packs, runbooks, dispatchers, generated
  provider helpers, and chaos tooling. App authors should
  not import application resources from `@hobo/sdk`.
- `@hobo/core` is the shared type substrate for generated bindings and package
  internals. It does not expose app authoring factories.

## Canonical Import Table

| Symbol or family | Package | Importer | Boundary rationale |
|---|---|---|---|
| `bindle(name, builderFn)`, `.allow`, `.with` | `@hobo/bindles` | app authors | App manifest assembly belongs with the resource idiom layer; app-host behavior belongs to imported app/framework code. |
| closure builder methods (`b.api()`, `b.web()`, `b.kv()`, `b.bucket()`, `b.queue()`, `b.topic()`, `b.secret()`, `b.data()`, `b.service()`) | `@hobo/bindles` | app authors | Explicit Bindle v1 resource methods stay inside the closure builder and do not take resource name arguments. Names come from the record keys the builder returns. |
| standalone IfC resource factories (`api`, `kv`, `bucket`, `queue`, `topic`, `secret`, `data`, `schedule`, `websocket`, `job`, `web`, `service`, `flag`, `auth`, `crypto`, `notify`, `guardrail`, `ui`, `golden`, `experiment`) | `@hobo/bindles` | app authors | Plan 21 catalog (20 factories); frozen in `packages/bindles/contracts/bindles-public-api.snapshot.json`. `search` is not a factory (ADR-0034). Legacy names such as `database`, `objectStore`, `rollout`, `slo`, and `trainable` are not part of this catalog. |
| `connector` | `@hobo/bindles` | app authors | Connector binding is an app-level external dependency declaration, not operator topology. |
| `config`, `secretRef`, `env`, `fromBinding` | `@hobo/bindles` | app authors | Config references are app authoring values that resolve through bindles. |
| `secret` | `@hobo/bindles` | app authors | Managed secret resources are catalog resources; `secretRef` is the config-value reference. |
| `workflow`, `step`, `handler`, `cron`, `sleep`, `actor`, `start`, `createHook`, `training`, `from`, runtime errors | `@hobo/runtime` | app authors | Runtime control flow is separate from resource declaration. |
| `command`, `view`, `projection`, `repo` | `@hobo/data` | app authors | CQRS helpers are data-plane authoring, not runtime control flow. |
| `emit`, `subscribe`, `saga` | `@hobo/events` | app authors | Messaging and choreography stay in the events namespace. |
| `camp` | `@hobo/camps` | platform authors and app/platform topology docs | Camp placement is topology, not an app resource catalog primitive. |
| `yard`, `domain` | `@hobo/yards` | platform authors | Yard tenancy, placement, and admission attach policy without builder-level approval shortcuts. |
| `junction` | `@hobo/junctions` | platform authors | Junction routing stays explicit at topology edges. |
| Session Replay (tracker, privacy, dual fixtures, player, retention) | `@hobo/replay` | app authors + platform + agents | Privacy-first session reconstruction composed over Stations/Junctions/Trails/Harness; not control-plane event-log replay ([ADR-0137](./adr/03-data-plane.md#adr-0137)). |
| Trails (continuous migration recipes, can-trail, history, dual fixtures) | `@hobo/trails` | app authors + platform | App-owned versioned Trails compose platform `identity.continuous` (hands-off). Continuous identity itself remains Matching/policy-driven with zero Trail authoring ([ADR-0134](./adr/02-identity-security.md#adr-0134)). |
| `defineResource`, `dispatcher`, `runner`, `runbook`, `generateProvider` | `@hobo/sdk` | provider authors and self-host operators | Provider/runtime implementation hooks are not app authoring factories. |
| `policyPack`, `rule`, `waiver`, `chaos` | `@hobo/sdk` | operators | Governance and resilience tooling target operator workflows. |
| shared schemas and branded IDs | `@hobo/core` | package internals, generated code | Stable internal substrate without app factory ownership. |
| EventStore / DurableEventStore ports, positions, fence errors | `@hobo/core` | package internals, runtimes | Shared internal contract substrate; not app authoring. |
| SQLite schema, migrations, journal semantics | `@hobo/storage-sqlite` | runtime adapters | Driver-neutral default engine logic; not the public portability boundary ([ADR-0135](./adr/03-data-plane-sqlite-default.md)). |
| generated WIT bindings | `@hobo/wit` | package internals, generated code | WIT contract materialization, not the ergonomic authoring API. |
| host event-store/runtime-journal WIT | `hobo:storage@0.1.0` via `@hobo/wit` | component hosts | Engine-neutral storage capability; no SQL/paths cross the membrane. |
| local runtime harness | `@hobo/runtime-local/testing` | tests | Local test runtime is intentionally separate from production runtime imports. |
| Node SQLite EventStore + storage worker | `@hobo/runtime-local` | Camp local runtime | Native single-owner partition adapter. |
| Browser SQLite WASM + OPFS EventStore | `@hobo/runtime-browser` | browser hosts | Worker + OPFS policy; transient fallback only when allowed. |
| Station factories, Rails, local Station client, PAM hooks | `@hobo/stations` | operators + CLI | Station is control-plane isolation (ADR-0131), not Bindle/Camp/Yard topology. |
| Trail definitions, can-trail, dual fixtures, recipe runner | `@hobo/trails` | app authors + platform | Continuous migration recipes; pure identity continuous needs zero Trail authoring (ADR-0134). |
| Overlay, DNS managers, secretless connectors, isolation tiers, metering sinks | `@hobo/connectivity` | runtimes + operators | Multi-tenant connectivity foundations; hierarchical naming pure functions stay in `@hobo/core` (ADR-0130). |
| Harness (OpenFeature provider, OpenDelivery, OpenExperiment) | `@hobo/identity` | app + platform | Progressive delivery plane; flags are facts. |
| Planner / Matching / continuous-delivery apply | `@hobo/cloud` | control plane | Provider-neutral ResourceIntent + workload-attested apply. |
| Conductor placement, receipts, rejections | `@hobo/broker` | operators + CLI | Pure runtime mounting Station client; no durable Connection ownership. |
| Component host: Wasmtime sandboxes (`componentHost=wasm`) | `@hobo/runtime-wasm` | Camp hosts | Private components as wasi:http processes. |
| Component host: OCI + kubectl transport (`componentHost=oci`) | `@hobo/runtime-oci` | Camp hosts | PACT-shaped KubectlTransport; schedule on Kubernetes. |
| Component host: multi-cloud registry (`componentHost=cloud-native`) | `@hobo/runtime-cloud-native` | Camp hosts | Mock provider for parity; cloud providers stubbed until certified. |

## Re-export Decision

`@hobo/bindles` must not re-export topology factories (`camp`, `yard`,
`junction`), operator/provider symbols (`defineResource`, `policyPack`,
`runbook`, `dispatcher`, `runner`, `generateProvider`, `chaos`), or runtime
control-flow primitives (`workflow`, `step`, runtime `agent`). It may re-export
generated WIT-facing resource and client types when those types are directly
part of app resource authoring.

This keeps import sites reviewable: app resources come from `@hobo/bindles`,
runtime behavior from `@hobo/runtime`, topology from topology packages, and
operator/provider extensions from `@hobo/sdk`. Agent interoperability uses connector
protocols such as A2A and ACP instead of a public HoBo agent SDK.

## Collision Rules

- `@hobo/sdk` must be described as "operator SDK" or "self-host SDK" in docs
  whenever the surrounding text could be read as app authoring guidance.
- `agent` is not a public SDK collection/factory. Agent-capable integrations use
  `connector(..., { protocol: "a2a" | "acp" })` so HoBo owns connection,
  identity, policy, sandboxing, and audit without maintaining an agent SDK.
- `secret` and `secretRef` intentionally share `@hobo/bindles` but mean
  different things. `secret()` declares a managed secret resource. `secretRef()`
  creates a config reference to a secret value. `@hobo/core` may hold schema
  types for both but must not become the authoring import home.

## Existing Example Reconciliation

Current design examples align to this map:

- `sdk-api.md` imports the closure builder from `@hobo/bindles`, runtime primitives from
  `@hobo/runtime`, choreography from `@hobo/events`, topology factories from
  `@hobo/camps`, `@hobo/yards`, and `@hobo/junctions`, and provider hooks from
  operator npm `@hobo/sdk`.
- `authoring-resources-wiring.md` imports `connector`, `config`, `secretRef`,
  `env`, and `fromBinding` from `@hobo/bindles`.
- `data-plane.md` and `walkthrough.md` keep CQRS helpers in `@hobo/data` and
  messaging/choreography helpers in `@hobo/events`.
- `platform-engineering.md` imports `defineResource` from operator npm
  `@hobo/sdk`.
- `walkthrough.md` keeps operator SDK examples separate from app authoring
  imports.
