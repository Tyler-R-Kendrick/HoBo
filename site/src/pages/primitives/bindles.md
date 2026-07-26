---
layout: ../../layouts/Docs.astro
title: Bindles
description: "The Bindle is HoBo's first primitive: your whole app — services, resources, wiring, and permissions — packed into one provider-agnostic bundle that's cheap to move."
---

# Bindles

> *A hobo's bindle is everything they own, tied to a stick. If it doesn't fit in the bindle, it doesn't come along.*

The **Bindle** is HoBo's first primitive and the only thing HoBo ships. It's your whole application — services, resources, wiring, policies, deployment intent — packed into one **provider-agnostic** bundle. You cannot run HoBo without one, and the discipline it imposes is the whole business model: an app that fits in its bindle is an app that's cheap to move, and an app that's cheap to move is an app whose rent goes down.

## Declaring a bindle

A bindle is plain code, and this surface ships today in `@hobo/bindles`: the default export of your project's `src/bindle.ts` is exactly what `hobo collect`, `hobo plan`, `hobo up`, and `hobo dev` load (a committed `hobo.bindle.json` manifest artifact wins when present). `bindle(name, build)` hands your build function a resource builder; the object you return *is* the manifest:

```ts
import { bindle } from "@hobo/bindles";

import { app as api } from "./api";
import { app as web } from "./webapp";

export default bindle("my-app", (b) => {
  const db = b.data().allow("read", "write");
  const jobs = b.queue().allow("enqueue");
  const cache = b.kv().allow("get", "set");
  const uploads = b.bucket();
  const apiKey = b.secret().allow("access");

  const apiSvc = b
    .api(() => api.fetch)
    .dependsOn(db, jobs, cache, apiKey);

  const webSvc = b.web(() => web.fetch).dependsOn(apiSvc);

  return { db, jobs, cache, uploads, apiKey, api: apiSvc, web: webSvc };
});
```

## The builder surface

| Builder | Resource kind | What it declares |
|---|---|---|
| `b.api(handler?)` | `api` | An HTTP API entrypoint. The handler rides along as an app-host entrypoint, never in the manifest. |
| `b.web(handler?)` | `web` | A web app entrypoint. |
| `b.service()` | `service` | A long-running internal service. |
| `b.data()` | `data` | A SQL-ish managed data port. |
| `b.kv()` | `kv` | Key-value storage. |
| `b.bucket()` | `bucket` | Object storage. |
| `b.queue()` | `queue` | Point-to-point work queue. |
| `b.topic()` | `topic` | Pub/sub topic. |
| `b.secret()` | `secret` | A secret reference — never a secret value. |

Every resource supports three chainable refinements:

| Method | Meaning |
|---|---|
| `.dependsOn(...resources)` | Declares wiring edges **and** injects typed bindings at runtime. Deny-by-default: no declared edge, no access. |
| `.allow(...verbs)` | Inline least privilege, with verbs typed per resource kind (`"read"`/`"write"`/`"query"` on `data`, `"enqueue"`/`"dequeue"` on `queue`, `"get"`/`"set"` on `kv`, …). Permissions travel in the bindle. |
| `.with(...annotations)` | Typed provider-specific options — the escape hatch. Optimization, never a requirement. |

## Greenfield: declare the bindle, generate the code

Packing an existing app — the brownfield path above — is only half the story. A bindle is also a **declarative surface**: every builder handler is optional, and a resource declared *without* an implementation is still a fully typed WIT port. That makes the bindle a spec HoBo can generate code *from*, not just a wrapper around code you already have.

```ts
import { bindle } from "@hobo/bindles";

/**
 * A greenfield app: nothing is implemented yet.
 * Each declaration is a typed WIT port; the host links a stub
 * until a real implementation is promoted.
 */
export default bindle("hello-greenfield", (b) => {
  const db = b.data().allow("read", "write");

  // No handler — declared intent only. Runs as a contract-backed
  // stub from day one; the generation pipeline grows it into a
  // real wasm component.
  const payments = b.service().stub().dependsOn(db);

  const api = b.api().dependsOn(payments);

  return { db, payments, api };
});
```

The loop from declaration to running implementation:

1. **Declare.** The bindle above is a complete, plannable manifest — `hobo plan` and `hobo up` work on it unchanged. `hobo stub` materializes contract-backed stubs (in `src/_generated/`) for every unimplemented port, so the whole app runs end-to-end on day one: stubs satisfy the type system and the link table, and return typed responses derived from the WIT types.
2. **Record.** Every stub call is an event. Those recorded traces become a **specification by example** — the inputs any real implementation must satisfy, alongside the port's contract (typed I/O, invariants, forbidden outputs).
3. **Generate.** The same **generation pipeline** that writes [provider adapters](/HoBo/guide/custom-providers/) synthesizes the component implementation from the WIT interface + contract + recorded traces. Candidates run in a capability-scoped sandbox with no egress.
4. **Gate.** Promotion requires all three lenses: **conformance green** (the contract must never break), **eval thresholds met** (the rubric should improve), and **policy allows** (prod promotions can require human approval).
5. **Promote.** A passing candidate is written back to source as an AST-aware, region-scoped edit with signed provenance — auto-applied when low-risk, or raised as a PR for approval. Prior candidates live in the event log, so promotion is reversible.

Methods you want to *stay* AI-maintained carry the `"use training"` directive: the body is the baseline, and HoBo's optimizer keeps rewriting it against the method's intent, contract, and rubric — under the same gates.

```ts
/**
 * @intent Charge the order; refuse when the amount disagrees with the cart.
 */
export async function charge(order: Order): Promise<Receipt> {
  "use training"; // AI-rewritable: optimized against intent + contract + rubric
  return stubCharge(order); // baseline — the optimizer grows this
}
```

Brownfield and greenfield converge on the same artifact: one manifest, one `hobo up`, one event log. Pack code you have, declare code you don't, and mix freely — a half-implemented bindle is a normal bindle.

## Rules the bindle enforces

- **Names come from the returned object keys.** `{ db, api }` yields stable IDs like `data:db` and `api:api`. Duplicate stable IDs are a hard error.
- **The manifest is pure data.** Serializing a bindle yields exactly `{ name, resources, edges }` — handlers are reachable for tooling via `definition.entrypoint(name)` but never leak into the graph.
- **Everything is frozen.** A built bindle is deeply immutable. The manifest you planned against is the manifest that ships.
- **Provider-agnostic by construction.** Nothing in the builder surface names a cloud. Provider choices live in [Camps](/HoBo/primitives/camps/); provider *hints* live in `.with(...)` annotations, which any other provider is free to ignore.

## Why this shape matters

Every classic lock-in mechanism is a thing that lives *outside* your app description: the console-clicked queue, the IAM policy in a wiki, the env var that only exists in one region. The bindle's job is to leave nothing outside. When permissions (`.allow`), wiring (`.dependsOn`), and intent are all in the bundle, **unpacking it somewhere cheaper is a mechanical operation** — which is what lets [continuous migration](/HoBo/guide/concepts/#continuous-migration) be routine rather than heroic.

## Where bindles go next

- A bindle needs a home: [Camps](/HoBo/primitives/camps/) — pitch one to pin placement, or let HoBo infer it from the code you've configured.
- Multiple homes under one provider: [Yards](/HoBo/primitives/yards/).
- Homes across clouds: [Junctions](/HoBo/primitives/junctions/).
