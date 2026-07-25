---
layout: ../../layouts/Docs.astro
title: Camps
description: "The Camp is where your bindle lives right now — one provider, one durable runtime. Write one to pin placement, or let HoBo infer it from your configured code."
---

# Camps

> *A camp is where you stay, not who you are. Good campsites are worth appreciating — and leaving, when the rent goes up.*

The **Camp** is HoBo's second foundational primitive: the answer to the question the [Bindle](/HoBo/primitives/bindles/) deliberately refuses to answer — *where does this app live right now?* A camp binds a bindle to **exactly one provider** and supplies the **durable runtime** the app's actors, workflows, queues, and clocks run on. Every running app lives in a camp — but **writing one is optional**: leave it out and HoBo infers a camp from the code you've configured. You write one to pin the choice yourself, or because your junction's broker admin requires explicit camps.

## Pitching a camp

> **Design-stage:** `@hobo/camps` ships (with `camp()`, `defaultProvider`/`tiers`/`bindings` resolution, and env-type inference), but the `@hobo/provider-fly` and `@hobo/runtime-postgres` packages imported in these snippets **do not ship yet** — they show the designed surface. Shipped today: `@hobo/provider-cloudflare` (plus the `ax` and `agentv` adapters) and the `runtime-local` backend; the default `hobo up` lane is local/in-memory, with live lanes credential-gated.

```ts
import { camp } from "@hobo/camps";
import { fly } from "@hobo/provider-fly";
import { postgresRuntime } from "@hobo/runtime-postgres";

import app from "./bindle";

export default camp("prod", {
  bindle: app,
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
  defaultProvider: fly({ region: "iad" }),
});
```

A camp needs only `{ bindle, runtime, defaultProvider }` — the provider's built-in resource definitions match every port in the bindle's manifest automatically. Then:

```sh
hobo plan --camp prod   # dry run: placement, cost, warnings
hobo up --camp prod     # converge
```

## Three levels of placement control

All three mapping styles are **overrides** — each narrower one wins over the broader one. Resolution order per resource: **bindings → tiers → defaultProvider**.

```ts
export default camp("prod", {
  bindle: app,
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),

  // (a) whole-app: "host everything here, figure out the best way"
  defaultProvider: fly({ region: "iad" }),

  // (b) per-tier: route classes of resource differently
  tiers: {
    saas: fly,                     // managed data services
    edge: fly.machines(),          // compute tier
  },

  // (c) per-boundary pin: a named resource → specific options
  bindings: {
    "my-app.db": fly.postgres({ plan: "shared-1x" }),
  },
});
```

## Rules camps enforce

- **One provider per camp.** Mixing providers in one camp is a hard error — that's what [Yards](/HoBo/primitives/yards/) (regions) and [Junctions](/HoBo/primitives/junctions/) (clouds) are for. The constraint is what keeps a camp cheap to reason about, price, and leave.
- **The runtime is part of the address.** A camp's durable runtime (event store, queues, streams, actor host, clock) is a swappable backend — `runtime-local` ships today; postgres, temporal, restate, and cloudflare backends are designed. Swapping it changes durability backing, never app logic.
- **Environment comes from the name.** `prod`, `staging`, `preview`/`pr-*`, and `dev` camps get sensible environment semantics inferred (and you can override `envType` when your naming is more creative).

## Writing a camp is optional

Every app lives in a camp — but *pitching* one isn't always your job:

- **Inferred camps (the default).** With no camp declared, the Dispatcher infers one from the code you've configured and your platform's approved providers, optimizing for price under policy. An inferred camp is approved by policy, not automatically.
- **Locked-down placement.** A [junction](/HoBo/primitives/junctions/) broker admin can turn inference off and require explicit, approved camps — governance decides how much choice stays with the app team.
- **Local camp.** `hobo dev` runs your bindle against `runtime-local` — a full offline camp on your laptop, with honest fidelity labels where local behavior differs from cloud.

## Camps and continuous migration

Here's the point of the whole design: **the camp is your app's current address, not its identity.** Because the bindle is provider-agnostic and every camp exposes the same runtime contract, the Dispatcher can propose a cheaper camp at any time — and the move is the same plan → gate → converge loop as `hobo up`. Appreciate every campsite. Commit to none.

## Where camps go next

- Several camps, one provider: [Yards](/HoBo/primitives/yards/).
- Several providers: [Junctions](/HoBo/primitives/junctions/).
- The machinery underneath: [Architecture](/HoBo/guide/architecture/).
