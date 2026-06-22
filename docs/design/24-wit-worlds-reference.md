# Plan 24 — WIT worlds reference (the canonical ports)

> Part of the [HoBo Design Plan Suite](./README.md). The authoritative enumeration of HoBo's **ports as WIT worlds** ([Plan 20](./20-wasm-wasi-runtime.md)). Reused `wasi:*` interfaces + HoBo-authored `hobo:*` worlds. The TS SDK's typed clients ([Plan 2](./02-sdk-api.md)) are generated from these via `jco guest-types`; capability providers ([Plan 3](./03-providers-iac.md)) implement their exports; `bind` creates the link.

> **v4 (gates):** two governance ports join the catalog — **`hobo:contract-engine`** ([Plan 29](./29-contracts-compatibility.md)) and **`hobo:policy-engine`** ([Plan 30](./30-policy-plane.md)) — each with a built-in HoBo implementation and optional providers (Pact / OPA / Cedar). A port's WIT world *is* its provider contract; this doc's worlds are what the Gatekeeper's compatibility checks are written against.

## Conventions
- **Package/version:** `namespace:package@semver` (e.g. `wasi:keyvalue@0.2.0`, `hobo:runtime@0.1.0`). HoBo pins exact versions; upgrades go through upcasters/compat shims, never silent drift.
- **Import = dependency** (inbound port the component needs); **export = capability** (what it provides). A **link** connects an import to a provider's export, late-bound ([Plan 20](./20-wasm-wasi-runtime.md)).
- **`.allow()` ↔ world:** a resource's permitted verbs ([Plan 21](./21-resources-catalog.md)) select which world's functions are linked + which IAM/token scope is granted.

## Reused WASI worlds (don't reinvent)
| WIT interface | HoBo resource | Notes |
|---|---|---|
| `wasi:http/incoming-handler`, `.../outgoing-handler` | `api` / `service` / `web`; outbound fetch | service exports incoming-handler; outbound is an import |
| `wasi:keyvalue/store` | `kv` | `get`/`set`/`delete`/`exists` (+ batch) |
| `wasi:blobstore/blobstore` | `bucket` | object RW; presigned-URL + events extended by `hobo:blob-events` |
| `wasi:messaging` | `topic` (push) | publish/subscribe |
| `wasi:sql` | `sql` | connection + query (draft; HoBo `hobo:sql` fills gaps) |
| `wasi:config/store` | `secret`/config | config + secret access |
| `wasi:logging/logging` | `ctx.log` | structured logging |
| `wasi:filesystem`, `wasi:sockets`, `wasi:clocks`, `wasi:random`, `wasi:cli` | host primitives | granted per capability policy |

## HoBo-authored worlds (`hobo:*`) — what WASI doesn't cover
| World / interface | Purpose | Key functions (illustrative) |
|---|---|---|
| `hobo:runtime/workflow` | durable workflow/step | `run-step(name,input,opts)`, `sleep(ms)`, `emit(type,data)` |
| `hobo:runtime/actor` | virtual-actor (grain) state + messaging | `get-state`/`append-state`, `signal(key,msg)` |
| `hobo:runtime/saga` | choreography process manager | `on(event)`, `emit(event)`, `compensate(event)` |
| `hobo:runtime/agent` | durable AI agent | `run(messages)`, `tool(name,input)`, `token(provider,scope)` |
| `hobo:queue` | pull queue (Nitric parity) | `enqueue`, `dequeue(n)`, `complete` |
| `hobo:blob-events` | bucket notifications + presigned URLs | `on(event,prefix)`, `download-url`, `upload-url` |
| `hobo:websocket` | websocket connections | `on(connect/message/disconnect)`, `send(conn,msg)` |
| `hobo:job` | batch jobs (cpu/mem/gpu) | `handler(opts)`, `submit(input)` |
| `hobo:scheduler` | cron/interval triggers | `every(spec)`, `cron(expr)` |
| `hobo:search` | full-text + vector + hybrid retrieval ([Plan 35](./35-search-vector-surface.md)) | `text-query(q,filter)` (reactive), `vector-query(vec,filter,k)`, `hybrid(q,vec,...)`, `upsert`/`delete` |
| `hobo:embed` | embedding generation behind `search` ([Plan 35](./35-search-vector-surface.md)) | `embed(text)` → vector (local model or hosted API; secretless) |
| `hobo:dns` | DNS records + custom-domain routing ([Plan 13](./13-networking-connectivity.md)/[ADR-0035](./adr/ADR-0035-custom-domains-and-multi-cloud-ingress.md)) | `upsert-record`, `set-routing(policy)`, `verify`, health-checked failover across Camps |
| `hobo:auth` | end-user auth: federate + verify ([Plan 36](./36-end-user-auth.md)/[ADR-0038](./adr/ADR-0038-end-user-application-auth.md)) | `verify(jwt)` → `ctx.user` claims (OIDC/JWKS/customJwt), `start-session`/`revoke-session`; thin built-in (passkey/email) for dev |
| `hobo:feature-flag` | runtime flags, OpenFeature-compatible ([Plan 37](./37-feature-flags-progressive-delivery.md)/[ADR-0044](./adr/ADR-0044-feature-flags-progressive-delivery.md)) | `eval(flag, ctx)` (bool/string/number/object, in-process deterministic), `change`/`target`; built-in store or OpenFeature provider |
| `hobo:control/provisioning` | control-plane resource ops | `provision(spec)`, `deprovision(id)`, `refresh(id)` |
| `hobo:control/observability` | metrics/traces/logs emit | `emit-metric`, `emit-trace` |
| `hobo:control/config` | tenant/Camp config | `get`, `set` |
| `hobo:code` | Hobo Code capability/auth manifest | `capabilities()`, `auth()`, `cost()` ([Plan 6](./06-ai-native-agent-auth.md)) |

## Example world (a typical service)
```wit
package hobo:examples@0.1.0;
world shop-api {
  // dependencies (imports → links)
  import wasi:keyvalue/store@0.2.0;
  import wasi:blobstore/blobstore@0.2.0;
  import hobo:queue/queue@0.1.0;
  import hobo:runtime/workflow@0.1.0;
  import wasi:logging/logging@0.2.0;
  // capability (export)
  export wasi:http/incoming-handler@0.2.0;
}
```
The SDK author never writes this by hand — declaring `kv()/bucket()/queue()` + `.allow()` and an `api`/`service` generates the world; `jco` emits the typed bindings the handler code uses. These `jco guest-types` are one of the four codegen sources (with Zod, `.allow()`, and the bindle graph) that land in the checked-in `_generated/` directory ([ADR-0037](./adr/ADR-0037-sdk-codegen-surface.md)/[Plan 2 §Generated code](./02-sdk-api.md)).

## Versioning & evolution
- Worlds are versioned independently; the manifest IR ([Plan 22](./22-wiring-manifest.md)) records the exact versions a component imports/exports.
- Upstream `wasi:*` draft churn is absorbed by pinning + a compat layer; `hobo:*` worlds follow semver with conformance suites per version ([Plan 9](./09-verification-open-questions.md)).
- Every world ships a `@hobo/conformance` suite; providers/implementations must pass the version they claim — the gate for human- and Forge-authored adapters ([Plan 23](./23-stubbable-ai-implementations.md)).

## Iteration hooks
- Final `hobo:*` package names/namespacing; which `hobo:*` worlds to upstream as `wasi:*` proposals (queue/websocket/blob-events).
- Whether intra-app calls use runtime links or build-time composition (`wac`).
- `wasi:sql` adoption vs a richer `hobo:sql` — the **migration** half is now specified in [Plan 34](./34-app-data-migrations.md) ([ADR-0032](./adr/ADR-0032-data-portability-schema-versioning.md)); `hobo:sql` is where the declarative-schema/diff + snapshot/export capabilities live (the connection/query surface stays `wasi:sql`).
