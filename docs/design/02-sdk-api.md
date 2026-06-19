# Plan 2 — SDK / API design ⭐ (deep)

> Part of the [HoBo Design Plan Suite](./README.md).

The SDK is four cooperating layers. Each lower layer is usable on its own; higher layers add ergonomics. The "feels like Vercel Workflows" surface = Layer 4 directives + Layer 3 topology.

## Layer 1 — Worlds (durable runtime ports)
A **World** provides the durable substrate. HoBo's port (superset of Vercel's Storage+Queue+Streamer, adding actors + clock):

```ts
// @hobo/core
export interface World {
  events:  EventStore;   // append-only log; createRun/appendEvents/getRun, subscriptions, projections
  queue:   Queue;        // at-least-once enqueue/handle; idempotent by messageId
  streams: Streamer;     // realtime read/write per run (run.readable)
  actors:  ActorHost;    // virtual-actor placement, single-writer leases, durable state
  clock:   Clock;        // deterministic time + durable timers (sleep/cron)
}
```
Selected per Camp; **same app code regardless of World** (env `HOBO_WORLD` or config). Built-in `@hobo/world-local` for dev; production adapters listed in [Plan 1](./01-monorepo.md). This is the seam that makes durability portable and gives us replay everywhere.

## Layer 2 — Providers (infra capability ports)
Capabilities are grouped by service model. Each is a **port**; providers implement subsets and advertise them via Hobo Code ([Plan 6](./06-ai-native-agent-auth.md)).

```ts
// service-model taxonomy (illustrative)
PaaS:  compute() web() function() cron() queue() topic() gateway()
SaaS:  database() cache() objectStore() secrets() vector() search() auth() email()
CaaS:  containerService() image()        // image built via build-* adapters
IaaS:  vm() microVm() network() volume()  // microVm via Firecracker adapter
```
A **Provider** binds these ports to a backend and declares *how* it realizes them (which IaC/build adapter it uses under the hood):
```ts
export interface Provider {
  id: string;                           // "aws", "azure", ...
  capabilities: Capability[];           // which ports it implements
  realize(plan: ResourcePlan): IacProgram;   // emits work for an IaC adapter
  code(): HoboCode;                     // its machine-readable signs (Plan 6)
}
```
IaC and build/VM are the *same shape*: `IacProvider` (Pulumi/CDKTF/Crossplane/OpenTofu) and `BuildProvider` (Dagger/Packer/Firecracker/Vagrant) are ports too, so a cloud provider composes them.

## Layer 3 — Topology / resources (declare the app, map to providers)
`bindle()` declares resources and bindings; **mapping rules** decide which provider realizes each port. Three mapping styles, all supported:

```ts
// hobo.config.ts — Worlds + provider mapping (the "where/how")
import { defineHobo } from "@hobo/core";
import { azure } from "@hobo/provider-azure";
import { aws } from "@hobo/provider-aws";
import { cloudflare } from "@hobo/provider-cloudflare";
import { postgresWorld } from "@hobo/world-postgres";

export default defineHobo({
  world: postgresWorld({ url: process.env.DATABASE_URL }),

  // (a) whole-app: "just host everything on Azure, figure out the best way"
  defaultProvider: azure({ region: "eastus" }),

  // (b) per-tier overrides (PaaS/SaaS/CaaS/IaaS routed differently)
  tiers: {
    saas: azure,            // managed data services on Azure
    paas: aws.appRunner(),  // app/sidecar tier on AWS
    edge: cloudflare.workers(),
  },

  // (c) per-boundary pin (named resources → specific provider + options)
  bindings: {
    "shop.db":   azure.cosmos({ consistency: "session" }),
    "shop.api":  aws.fargate({ cpu: 512, memory: 1024 }),
  },
});
```

```ts
// bindle.ts — the app topology (the "what")
import { bindle, database, service, web, queue } from "@hobo/sdk";

export default bindle("shop", (b) => {
  const db     = b.use(database("db", { engine: "postgres" }));      // SaaS port
  const orders = b.use(queue<OrderEvent>("orders"));                 // PaaS port

  const api = b.use(service("api", {
    handler: "./src/api",
    bind: { db, orders },        // typed bindings → conn strings/creds injected at runtime via ctx
  }))
  .with(aws.fargate({ autoscale: { min: 1, max: 10 } }));            // provider-specific options (typed)

  b.use(web("site", { handler: "./src/site", bind: { api } }));      // SSR/static, edge by mapping rule
});
```
Resolution order for each port: explicit `bindings` → `tiers` → `defaultProvider`. Bindings are typed: `bind: { db }` injects `ctx.bindings.db` with a provider-agnostic client whose driver is chosen by the resolved provider.

## Layer 4 — Runtime primitives (actors, workflows, steps, sagas, agents)
This is the Vercel-feel surface. Both **directive** sugar and **wrapper** form are supported (directive compiles to wrapper).

```ts
import { workflow, step, actor, saga, sleep, start } from "@hobo/runtime";

// step: full Node access, retried, result memoized in the event log
export const reserveInventory = step(async (orderId: string) => {
  /* side effect */ return { reserved: true };
});

// durable workflow: deterministic + replayable (directive form)
export async function checkout(order: Order) {
  "use workflow";
  await reserveInventory(order.id);
  await sleep("10s");
  await chargePayment(order);
  return { status: "confirmed" as const };
}

// virtual actor / grain: durable single-writer state per key, backed by World.actors
export const Cart = actor("Cart", {
  state: () => ({ items: [] as Item[] }),
  on: {
    addItem: (ctx, item: Item) => ctx.state.items.push(item),
    checkout: async (ctx) => { await start(checkout, ctx.snapshot()); },
  },
});

// choreography saga: react to events, emit next events / compensations (no central coordinator)
export const fulfillment = saga("fulfillment")
  .on("OrderConfirmed", async (e, ctx) => ctx.emit("ShipmentRequested", { orderId: e.orderId }))
  .on("ShipmentFailed",  async (e, ctx) => ctx.emit("PaymentRefundRequested", { orderId: e.orderId }))
  .compensate("PaymentCharged", async (e, ctx) => ctx.emit("PaymentRefundRequested", e));
```
Durability/replay semantics match Vercel's model: append-only event log, step memoization, deterministic replay (seeded `Math.random`/`Date`/`crypto`, frozen env), at-least-once queue + idempotency keys for exactly-once effects. The difference is the **actor** primitive and **choreography sagas** are first-class, and it all runs on whichever World the Camp selects.

## The provider-specific options pattern (escape hatch, the core promise)
- `.with(provider.option({...}))` on any resource — **fully typed by the provider package**, additive, ignored by other providers.
- Capability-level hints too: `database("db", { engine: "postgres" }).with(aws.rds({ multiAz: true }), azure.flexibleServer({ haMode: "zoneRedundant" }))` — only the resolved provider's options apply; the rest are inert, so one bindle can target many providers without edits.
- A `prefer`/`require` qualifier lets devs say "I *need* Cosmos here" (fail if unavailable) vs "prefer Postgres-compatible."

## Type ergonomics
- Generics flow bindings end-to-end: `service({ bind: { db } })` types `ctx.bindings.db` as the db's client.
- `start(checkout, order)` is type-checked against the workflow signature; hooks/streams are typed (`getWritable<UIMessageChunk>()`).
- Provider option types come from each provider package, so autocomplete shows only valid knobs for the resolved provider.

## Iteration hooks
- Directive vs wrapper default.
- How much to lean on a compiler/transform (Vercel uses a build step).
- Binding injection mechanics.
- Whether `actor` and `grain` are distinct.
- Saga DSL shape.
