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

## HTTP frameworks are L2 adapters (not core)

`@hobo/hobo` / `@hobo/core` do **not** depend on Hono or other HTTP frameworks.

| Surface | What HoBo sees | Where frameworks live |
|---------|----------------|------------------------|
| local component host | bindle entrypoint as `(Request) => Response` | `@hobo/adapter-hono` + app Hono routes |
| isolated-wasm host | project wasi:http guest under `src/adapters/wasm/<name>-guest.mjs` | app wasm adapter (framework-free guest) |
| mesh env | `x-hobo-env-*` headers from bindle `.with({ option: "env" })` | HoBo Camp mesh only |

Framework packages live under `packages/adapters/` (L2), e.g. `@hobo/adapter-hono`.
Do not fold Hono or jco-std into `@hobo/core` / `@hobo/hobo`.
