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

> **Pre-release note:** HoBo is pre-release, but the core flow on this page **runs today**: a project with a `src/bindle.ts` runs `hobo collect`, `hobo plan`, `hobo up`, and `hobo dev` against HoBo's default **local, in-memory lane** — no cloud account required. Live deploy lanes (Cloudflare, Vercel, the real pinned Pulumi engine) are credential-gated by environment variables. Sections still maturing are marked design-stage below.

## Prerequisites

- **Node.js** ≥ 20 (any Component-Model language can author bindles eventually — TypeScript is the first reference implementation).
- A terminal, ten minutes, and no cloud account. Really: `hobo dev` and even your first deploy work without one.

## Scaffold a program

```sh
npx hobo new my-app --template fullstack
cd my-app
hobo dev
```

`hobo new` scaffolds a runnable SDK program (templates: `todo`, `api`, `agent`, `fullstack`); `hobo dev` boots an offline local camp and serves **your bindle's own api/web entrypoint handler in-process** — no sign-up, no network.

## Step 1 — Pack your bindle

The bindle is the first thing HoBo looks for and the only thing it ships. It's plain code — no YAML sidecar, no config dialect:

```ts
// src/bindle.ts
import { bindle } from "hobo/bindles";

import { app as api } from "./api";
import { app as web } from "./webapp";

export default bindle("my-app", (b) => {
 const db = b.data().allow("read", "write"); // a SQL-ish data port, least-privilege verbs inline
 const jobs = b.queue().allow("enqueue"); // background work

 const apiSvc = b
.api(() => api.fetch) // HTTP API entrypoint
.dependsOn(db, jobs); // typed bindings, injected at runtime

 const webSvc = b.web(() => web.fetch).dependsOn(apiSvc);

 return { db, jobs, api: apiSvc, web: webSvc };
});
```

Three things to internalize — they're what make everything later cheap:

- **Resource names come from the returned object keys.** `{ db, jobs, api, web }` is your app's topology; the object *is* the manifest.
- **`.dependsOn(...)` is the wiring.** It declares edges *and* injects typed bindings at runtime. Nothing reaches a backend it didn't declare — deny by default.
- **`.allow(...)` is inline least privilege.** Verbs are scoped to the resource's kind — `"read"`/`"write"` on a data port, `"enqueue"` on a queue, `"get"`/`"set"` on a kv store. Permissions travel *in* the bindle, so they move when the app moves. That's the trick: a bindle carries everything needed to unpack it anywhere, which is exactly what makes migrating to a cheaper home a routine event instead of a rewrite.

That's a complete, deployable description — and it deploys today: run `hobo up` and HoBo converges the graph against the default local, in-memory lane (build, plan, gate, provision, deploy — all in-process, no cloud account). If a committed `hobo.bindle.json` manifest artifact is present it wins; otherwise the manifest is compiled from `src/bindle.ts` itself. Which brings us to what a camp *is*, and when to write one yourself.

> **Starting from nothing?** You don't need existing code to pack a bindle. Declare a `@component` class whose `@operation` methods carry an intent, a typed contract shape, and an optional rubric — a `stub()` body declares *code to be generated* — and hand it straight to `b.api(...)`. The app runs on contract-derived stubs day one, and the generation pipeline grows the real implementations behind conformance, eval, and policy gates. See [Greenfield: declare the bindle, generate the code](/HoBo/primitives/bindles/#greenfield-declare-the-bindle-generate-the-code).

## Step 2 — Pitch a camp (or let HoBo pitch it)

A camp answers one question the bindle deliberately doesn't: **where does this live right now?** One provider, one durable runtime (event store, queues, streams, actors, clock). Declaring one is how you *pin* that answer:

> **Design-stage:** Camps ship, but the Fly provider and Postgres runtime shown below are not available yet — this snippet is the intended authoring surface. Today the default lane is local/in-memory; Cloudflare is among the credential-gated live providers.

```ts
// src/camp.ts
import { camp } from "hobo/camps";
import { aws } from "hobo/providers/aws";
import { postgresRuntime } from "hobo/runtimes/postgres";

import app from "./bindle";

export default camp("prod", {
 bindle: app,
 runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
 defaultProvider: aws({ region: "us-east-1" }), // "host everything here, figure out the best way"
});
```

Then converge:

```sh
hobo plan --camp prod # dry run: placement, cost, warnings — read-only
hobo up --camp prod # build, plan, gate, provision, deploy
hobo logs --camp prod # live-tail through the camp runtime
```

A few useful truths about camps:

- **The camp is a *current answer*, not a vow.** The whole point of keeping the bindle provider-agnostic is that the camp can change out from under it. When continuous migration finds a cheaper camp that passes your policies, the move is the same convergence loop as `hobo up` — plan, gate, converge — never a special event.
- **Writing a camp is optional.** With no camp pinned, the Dispatcher infers one from the code you've configured and your platform's approved providers, optimizing for price under policy. Explicit camps are for when *you* want to choose — or when your junction's broker admin has locked placement down and requires explicit, approved camps.
- **Zero-setup first deploy:** `hobo up` works with no account and no cloud credentials — the default lane converges anonymously against the local, in-memory Yard runtime. `hobo login` mints a local dev session, and `hobo claim` binds an anonymous deployment to an account afterwards without re-provisioning. **Live** deploy lanes are credential-gated by environment: Cloudflare (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`), Vercel (`VERCEL_TOKEN`), or the real pinned Pulumi CLI engine (`provider live credentials`).

And if you do want provider-native power, it's a typed annotation away, still inside the bindle (`.with(...)` ships; the `fly` annotation below is the same design-stage provider surface as above):

```ts
const apiSvc = b
.api(() => api.fetch)
.with(aws.fargate({ cpu: 512, memory: 1024 })); // optimization, not a rewrite
```

**You now know everything required to run HoBo.** A bindle is the whole entry fee — the camp comes with the campsite, whether you pitched it or HoBo did. Everything below is for apps with wanderlust.

## Advanced — Yards and Junctions

Skip this on day one. Come back when one camp stops being enough.

### Yard: one provider, many camps

Running `prod` in two regions plus preview camps, all on one provider? A **yard** composes that provider's camps and carries what's shared across them — policy, identity, reconciliation, provider-global networking:

```ts
import { yard } from "hobo/yards";
import prodEast from "./camps/prod-east";
import prodWest from "./camps/prod-west";

export default yard("aws", { camps: [prodEast, prodWest] });
```

One yard per provider, by rule. A yard cannot mix providers — that's the next primitive's job. (And pleasingly: the Yard control plane is itself a bindle, so self-hosting HoBo is just… hosting.)

### Junction: many yards, many clouds

When the journey goes multi-cloud or hybrid, a **junction** federates yards — peer to peer, no shared mutable state, cross-cloud connectivity inferred from the member yards' manifests.

> **Design-stage:** Junctions are not available yet — multi-cloud federation is coming. This snippet is the intended surface.

```ts
import { junction } from "hobo/junctions";
import awsYard from "./yards/aws";
import azureYard from "./yards/azure";

export default junction("my-app", { yards: [awsYard, azureYard] });
```

Now continuous migration has a bigger map to roam: the Dispatcher can weigh homes *across clouds*, and your data-residency and sovereignty policies decide what's allowed to cross which border.

## Where to next

- [Bindles](/HoBo/primitives/bindles/) and [Camps](/HoBo/primitives/camps/) — the full reference for the two primitives you just used.
- Worked examples ship with the product docs and starter templates.
- [Core concepts](/HoBo/guide/concepts/) — the vocabulary in one sitting.
- [The hobo CLI](/HoBo/guide/cli/) — the whole verb surface (it's deliberately small).
- [HoBo for agents](/HoBo/agents/) — pointing an AI agent at HoBo? It gets its own credentials, not yours.
