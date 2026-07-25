---
layout: ../../layouts/Docs.astro
title: Getting started
description: "Pack your first Bindle, pitch a Camp (or let HoBo pitch it for you), and let your app ride — plus where Yards and Junctions come in."
---

# Getting started

Time to leave home. This guide takes you from an empty directory to an app that has a home — and a standing ticket to a cheaper one. You'll meet HoBo's two foundational primitives, in the order you need them:

1. **[Bindle](/HoBo/primitives/bindles/)** — *pack.* Everything your app owns, rolled into one provider-agnostic bundle. The one thing you must write: no bindle, nothing to host.
2. **[Camp](/HoBo/primitives/camps/)** — *settle.* The place your bindle lives right now: one provider, one durable runtime. Every app lives in a camp, but **writing one is optional** — leave it out and HoBo infers a camp from the code you've configured. (The exception: a junction broker admin can lock placement down and require explicit camps.)

**[Yards](/HoBo/primitives/yards/)** and **[Junctions](/HoBo/primitives/junctions/)** are advanced scenarios — you'll want them when your app starts collecting regions and clouds, and not a minute before. They get a short section [at the end](#advanced--yards-and-junctions).

> **Pre-release note:** HoBo is pre-release; this is the canonical developer surface the product is being built to. Commands and APIs shown here are the stable contract — the same ones the conformance suites pin.

## Prerequisites

- **Node.js** ≥ 20 (any Component-Model language can author bindles eventually — TypeScript is the first reference implementation).
- A terminal, ten minutes, and no cloud account. Really: `hobo dev` and even your first deploy work without one.

## Scaffold a program

```sh
npx hobo new my-app --template fullstack
cd my-app
hobo dev
```

`hobo new` scaffolds a runnable SDK program; `hobo dev` runs it against the local runtime with hot reload — offline, no sign-up, honest fidelity labels for anything that behaves differently than the cloud.

## Step 1 — Pack your bindle

The bindle is the first thing HoBo looks for and the only thing it ships. It's plain code — no YAML sidecar, no config dialect:

```ts
// src/bindle.ts
import { bindle } from "@hobo/bindles";

import { app as api } from "./api";
import { app as web } from "./webapp";

export default bindle("my-app", (b) => {
  const db = b.data();                       // a SQL-ish data port
  const jobs = b.queue();                    // background work

  const apiSvc = b
    .api(() => api.fetch)                    // HTTP API entrypoint
    .dependsOn(db, jobs)                     // typed bindings, injected at runtime
    .allow("db:read", "db:write", "queue:send");

  const webSvc = b.web(() => web.fetch).dependsOn(apiSvc);

  return { db, jobs, api: apiSvc, web: webSvc };
});
```

Three things to internalize — they're what make everything later cheap:

- **Resource names come from the returned object keys.** `{ db, jobs, api, web }` is your app's topology; the object *is* the manifest.
- **`.dependsOn(...)` is the wiring.** It declares edges *and* injects typed bindings at runtime. Nothing reaches a backend it didn't declare — deny by default.
- **`.allow(...)` is inline least privilege.** Permissions travel *in* the bindle, so they move when the app moves. That's the trick: a bindle carries everything needed to unpack it anywhere, which is exactly what makes migrating to a cheaper home a routine event instead of a rewrite.

That's a complete, deployable description. If you stopped reading here and ran `hobo up`, HoBo could take it from this point — it would infer a camp from what you've configured and land the app there. Which brings us to what a camp *is*, and when to write one yourself.

## Step 2 — Pitch a camp (or let HoBo pitch it)

A camp answers one question the bindle deliberately doesn't: **where does this live right now?** One provider, one durable runtime (event store, queues, streams, actors, clock). Declaring one is how you *pin* that answer:

```ts
// src/camp.ts
import { camp } from "@hobo/camps";
import { aws } from "@hobo/provider-aws";
import { postgresRuntime } from "@hobo/runtime-postgres";

import app from "./bindle";

export default camp("prod", {
  bindle: app,
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
  defaultProvider: aws({ region: "us-east-1" }),   // "host everything here, figure out the best way"
});
```

Then converge:

```sh
hobo plan --camp prod    # dry run: placement, cost, warnings — read-only
hobo up --camp prod      # build, plan, gate, provision, deploy
hobo logs --camp prod    # live-tail through the camp runtime
```

A few useful truths about camps:

- **The camp is a *current answer*, not a vow.** The whole point of keeping the bindle provider-agnostic is that the camp can change out from under it. When continuous migration finds a cheaper camp that passes your policies, the move is the same convergence loop as `hobo up` — plan, gate, converge — never a special event.
- **Writing a camp is optional.** With no camp pinned, the Dispatcher infers one from the code you've configured and your platform's approved providers, optimizing for price under policy. Explicit camps are for when *you* want to choose — or when your junction's broker admin has locked placement down and requires explicit, approved camps.
- **Zero-setup first deploy:** `npx hobo up` from any directory deploys anonymously and returns a live URL — no account. `hobo login` and `hobo claim` later bind it to you, keeping its state and URL. Commitment-free, like all good first visits.

And if you do want provider-native power, it's a typed annotation away, still inside the bindle:

```ts
const apiSvc = b
  .api(() => api.fetch)
  .with(aws.fargate({ cpu: 512, memory: 1024 }));   // optimization, not a rewrite
```

**You now know everything required to run HoBo.** A bindle is the whole entry fee — the camp comes with the campsite, whether you pitched it or HoBo did. Everything below is for apps with wanderlust.

## Advanced — Yards and Junctions

Skip this on day one. Come back when one camp stops being enough.

### Yard: one provider, many camps

Running `prod` in two regions plus preview camps, all on one provider? A **yard** composes that provider's camps and carries what's shared across them — policy, identity, reconciliation, provider-global networking:

```ts
import { yard } from "@hobo/yards";
import prodEast from "./camps/prod-east";
import prodWest from "./camps/prod-west";

export default yard("aws", { camps: [prodEast, prodWest] });
```

One yard per provider, by rule. A yard cannot mix providers — that's the next primitive's job. (And pleasingly: the Yard control plane is itself a bindle, so self-hosting HoBo is just… hosting.)

### Junction: many yards, many clouds

When the journey goes multi-cloud or hybrid, a **junction** federates yards — peer to peer, no shared mutable state, cross-cloud connectivity inferred from the member yards' manifests:

```ts
import { junction } from "@hobo/junctions";
import awsYard from "./yards/aws";
import azureYard from "./yards/azure";

export default junction("my-app", { yards: [awsYard, azureYard] });
```

Now continuous migration has a bigger map to roam: the Dispatcher can weigh homes *across clouds*, and your data-residency and sovereignty policies decide what's allowed to cross which border.

## Where to next

- [Bindles](/HoBo/primitives/bindles/) and [Camps](/HoBo/primitives/camps/) — the full reference for the two primitives you just used.
- [Core concepts](/HoBo/guide/concepts/) — the vocabulary in one sitting.
- [The hobo CLI](/HoBo/guide/cli/) — the whole verb surface (it's deliberately small).
- [HoBo for agents](/HoBo/agents/) — pointing an AI agent at HoBo? It gets its own credentials, not yours.
