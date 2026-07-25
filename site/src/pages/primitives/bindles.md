---
layout: ../../layouts/Docs.astro
title: Bindles
description: "The Bindle is HoBo's first primitive: your whole app — services, resources, wiring, and permissions — packed into one provider-agnostic bundle that's cheap to move."
---

# Bindles

> *A hobo's bindle is everything they own, tied to a stick. If it doesn't fit in the bindle, it doesn't come along.*

The **Bindle** is HoBo's first primitive and the only thing HoBo ships. It's your whole application — services, resources, wiring, policies, deployment intent — packed into one **provider-agnostic** bundle. You cannot run HoBo without one, and the discipline it imposes is the whole business model: an app that fits in its bindle is an app that's cheap to move, and an app that's cheap to move is an app whose rent goes down.

## Declaring a bindle

A bindle is plain code. `bindle(name, build)` hands your build function a resource builder; the object you return *is* the manifest:

```ts
import { bindle } from "@hobo/bindles";

import { app as api } from "./api";
import { app as web } from "./webapp";

export default bindle("my-app", (b) => {
  const db = b.data();
  const jobs = b.queue();
  const cache = b.kv();
  const uploads = b.bucket();
  const apiKey = b.secret();

  const apiSvc = b
    .api(() => api.fetch)
    .dependsOn(db, jobs, cache, apiKey)
    .allow("db:read", "db:write", "queue:send");

  const webSvc = b.web(() => web.fetch).dependsOn(apiSvc);

  return { db, jobs, cache, uploads, apiKey, api: apiSvc, web: webSvc };
});
```

## The builder surface

| Builder | Resource kind | What it declares |
|---|---|---|
| `b.api(handler?)` | `api` | An HTTP API entrypoint. The handler rides along as an app-host entrypoint, never in the manifest. |
| `b.web(handler?)` | `web` | A web app entrypoint. |
| `b.service(handler?)` | `service` | A long-running internal service. |
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
| `.allow(...verbs)` | Inline least privilege, scoped to the resource kind (`"db:read"`, `"queue:send"`, …). Permissions travel in the bindle. |
| `.with(...annotations)` | Typed provider-specific options — the escape hatch. Optimization, never a requirement. |

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
