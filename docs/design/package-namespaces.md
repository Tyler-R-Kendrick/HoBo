# Package Namespace Map

This note is the canonical import-ownership map for HoBo TypeScript packages. It
backs ADR-0087 and gives docs, generators, and boundary lint one table to check.

## Namespace Rules

- `hobo:sdk` is the WIT package contract. It is not the same thing as npm
  `@hobo/sdk`.
- `@hobo/bindles` is the app authoring idiom layer. It owns resource catalog
  factories, app config references, connector helpers, and fluent bindle
  composition.
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
| `bindle`, `.allow`, `.with` | `@hobo/bindles` | app authors | App composition belongs with the resource idiom layer. |
| `api`, `auth`, `database`, `bucket`, `objectStore`, `kv`, `queue`, `topic`, `flag`, `experiment`, `rollout`, `slo`, `trainable`, `web`, `websocket` | `@hobo/bindles` | app authors | Resource catalog factories are the WIT-backed authoring surface. |
| `connector` | `@hobo/bindles` | app authors | Connector binding is an app-level external dependency declaration, not operator topology. |
| `config`, `secretRef`, `env`, `fromBinding` | `@hobo/bindles` | app authors | Config references are app authoring values that resolve through bindles. |
| `secret` | `@hobo/bindles` | app authors | Managed secret resources are catalog resources; `secretRef` is the config-value reference. |
| `workflow`, `step`, `handler`, `cron`, `sleep`, `actor`, `start`, `createHook`, `training`, `from`, runtime errors | `@hobo/runtime` | app authors | Runtime control flow is separate from resource declaration. |
| `command`, `view`, `projection`, `repo` | `@hobo/data` | app authors | CQRS helpers are data-plane authoring, not runtime control flow. |
| `emit`, `subscribe`, `saga` | `@hobo/events` | app authors | Messaging and choreography stay in the events namespace. |
| `camp` | `@hobo/camps` | platform authors and app/platform topology docs | Camp placement is topology, not an app resource catalog primitive. |
| `yard`, `domain` | `@hobo/yards` | platform authors | Yard tenancy, placement, and admission attach policy without builder-level approval shortcuts. |
| `junction` | `@hobo/junctions` | platform authors | Junction routing stays explicit at topology edges. |
| `defineResource`, `dispatcher`, `runner`, `runbook`, `generateProvider` | `@hobo/sdk` | provider authors and self-host operators | Provider/runtime implementation hooks are not app authoring factories. |
| `policyPack`, `rule`, `waiver`, `chaos` | `@hobo/sdk` | operators | Governance and resilience tooling target operator workflows. |
| shared schemas and branded IDs | `@hobo/core` | package internals, generated code | Stable internal substrate without app factory ownership. |
| generated WIT bindings | `@hobo/wit` | package internals, generated code | WIT contract materialization, not the ergonomic authoring API. |
| local runtime harness | `@hobo/runtime-local/testing` | tests | Local test runtime is intentionally separate from production runtime imports. |

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

- `sdk-api.md` imports resources from `@hobo/bindles`, runtime primitives from
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
