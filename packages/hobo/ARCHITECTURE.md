# @hobo/hobo — composition-root architecture

`@hobo/hobo` is HoBo's composition root (apps layer, layer 3). It wires the
default runtimes so the composed `hobo` binary runs the cloud verbs end to end in
the LOCAL/MOCKED lane, instead of falling back to the shell stubs that
adapter-free `@hobo/cli` returns when its command factories are un-injected.

## Layering (apps -> adapters -> sdk/runtime -> core)

```
@hobo/hobo (apps, L3)
  ├─ @hobo/cli        (L3)  command factories + createHoboCli
  ├─ @hobo/cloud      (L3)  gateway, orchestrator, executor, registry
  ├─ @hobo/bindles    (L3)  collection target types
  ├─ @hobo/data       (L3)  in-memory actor host
  ├─ @hobo/runtime-local        (adapter, L2)  event store, component host, streamer
  ├─ @hobo/provider-cloudflare  (adapter, L2)  capability provider
  └─ @hobo/core       (core, L0)  shared ports/types
```

Importing the L2 adapters here is INWARD (L3 → L2) and therefore boundary-legal.
That is precisely why the default wiring lives at this root: adapter-free
`@hobo/cli` must not import an infra adapter, so it accepts an injected runtime
and the composition root supplies the concrete one.

## The composed default runtime (LOCAL/MOCKED lane)

`createDefaultYardRuntime()` assembles the `YardRuntime` the deploy verbs drive.
Every field is reused from an existing constructor — no runtime is reimplemented:

- **event store** — `@hobo/runtime-local`'s file-backed in-memory **event store**
  with a manual clock. All deploy verbs share ONE store, so `up` then `down` fold
  the same durable log.
- **actor host** — `@hobo/data`'s in-memory host. Each resource is a
  choreographed **actor** whose state is folded from the **event** stream.
- **executor** — `@hobo/cloud`'s in-process executor over a mock in-memory
  IaC backend (synthetic endpoints, no-op destroy) — no real cloud calls.
- **credential broker + registry** — `@hobo/cloud`'s in-process broker plus a
  provider registry built from the real `@hobo/provider-cloudflare` provider.

`createDefaultDevRuntime()` and `createDefaultCollectionTarget()` do the same for
`hobo dev` (runtime-local component host + Streamer, offline) and `hobo collect`.

## Event-sourced flow

`hobo up` issues a Deploy **command** through the gateway, which records
past-tense **events** into the shared **event store**. Resource **actors**
reconcile desired against observed state through the executor; the
`DeploymentView` **projection** (a **materialized view**) is rebuilt from those
**events** — with periodic **snapshot** folding — and serves the CLI's **read
store** queries. `hobo down` replays the same log to choreograph
reverse-dependency teardown to `deployment` destroyed.

## Parse, don't validate

This package adds no new wire records; it composes existing ones. Consistent with
the repo rule, boundary payloads are turned into **parse, don't validate**
**derived types** at the seams they cross — the `@hobo/cli` yard-client and the
`@hobo/cloud` gateway own those parsers, and the composition root only hands them
already-parsed runtime objects. The `data-models/` proto + CUE here describe the
composed runtime manifest purely as architecture-guard evidence.

## Why @hobo/iac-pulumi is not wired

The executor's `IacProvider` port (from `@hobo/cloud`) speaks the kernel
`IacProgram` dialect that the orchestrator's `iacProgramFor` emits. The
`@hobo/iac-pulumi` in-memory adapter validates a different `hobo.iac-program/v1`
dialect (`validateIacProgram`) that the cloud kernel never produces, so it cannot
apply the executor's programs. The default runtime therefore injects the same
in-memory `IacProvider` the `@hobo/cloud` + `@hobo/cli` tests use — the one that
actually applies the executor's programs — and does not depend on
`@hobo/iac-pulumi`.

## HTTP frameworks are L2 packages under `packages/adapters/`

`@hobo/hobo` / `@hobo/core` do **not** depend on Hono or other HTTP frameworks.

| Surface | What HoBo sees | Where frameworks live |
|---------|----------------|------------------------|
| local component host | bindle entrypoint as `(Request) => Response` | **`@hobo/runtime-local`** + **`packages/adapters/*`** |
| wasm host | bundles `src/<name>.ts` to wasi:http → Wasmtime OS sandboxes | **`@hobo/runtime-wasm`** |
| oci host | WASM packed as OCI, scheduled on Kubernetes via real kubectl client | **`@hobo/runtime-oci`** |
| cloud-native host | multi-cloud registry (mock + aws/gcp/azure/vercel/cloudflare stubs) | **`@hobo/runtime-cloud-native`** |
| mesh env | `x-hobo-env-*` when camp injects config | Camp mesh |

Host runtimes are **separate packages** under `packages/runtimes/*`. The composition
root dispatches via `serveProjectOnHost` / `getRuntimeHost`. Alias: `isolated-wasm` → `wasm`.

### External dependencies (Aspire-style)

Bindle authoring (`@hobo/bindles`):

| Factory | Runtime required | Discovery |
|---------|------------------|-----------|
| `b.external({ connectionString, endpoints })` | none (BYO) | `ConnectionStrings__*` / `services__*` |
| `b.container({ image })` | **oci** | mesh + K8s Deployment |
| `b.wasmComponent({ source })` | **wasm** | wasmtime sandbox |
| `.withReference(...)` | — | alias of `dependsOn` |

Broker hard-fails when required runtimes are not installed:

```bash
hobo add runtime-wasm    # enable wasm host on this yard
hobo add runtime-oci     # enable oci/k8s host
hobo yard ensure         # equip toolchains
```

Missing install → `required-runtime-unavailable` (same plane as provider pins).

Adapters are **shared monorepo packages** for any project (`pnpm add @hobo/adapter-hono`).
Examples only *consume* them — adapter source does not live under `examples/`.

## Broker targeting + anonymous deploy (identity ≠ placement)

`createBrokerAwareUpCommand` resolves the target broker as:

1. `--broker` / `--broker-uri`
2. `HOBO_BROKER` / `HOBO_BROKER_URI`
3. `HOBO_HOME/profile.json` default from `hobo login --broker`
4. Local embedded broker / Yard event-sourced lane

Remote paths **discover** first (`.well-known/hobo-broker`). Anonymous/`--temporary` requires `supportsAnonymous`. Claim rebinds ownership locally (event store) or remotely (`--broker` + `--token`) without re-provision. Human vs agent principals stay distinct: the credential presenter mints **real ES256 DPoP** proofs and audience-bound **JWT-SVIDs** (self-verified before send). Follow-ons: broker **server-side** DPoP verify, SPIRE Workload API fetch, WebAuthn human step-up.

