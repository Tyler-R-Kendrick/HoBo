# Plan 19 — End-to-end worked example

> Part of the [HoBo Design Plan Suite](./README.md). A single narrative that exercises the whole platform, to prove the pieces in Plans 2–23 actually compose. App: **"snapshop"**, a tiny commerce app (catalog + checkout + an ops agent).

> **v2 authoring (IfC + wasm + `.allow()`).** In the v2 model the same app is authored Nitric-style: resources are declared inline with `.allow()`, the service compiles to a **wasm component**, and the topology is **collected by running it** ([Plan 20](./20-wasm-wasi-runtime.md)/[Plan 21](./21-resources-catalog.md)/[Plan 22](./22-wiring-manifest.md)). The explicit `bindle.ts` below still works (advanced mode).
> ```ts
> // src/api.ts — IfC: resources + permissions inline; compiles to a wasm component via jco
> import { api, kv, bucket, queue, workflow, step } from "@hobo/sdk";
> const orders = kv("orders").allow("get", "set");          // → wasi:keyvalue link + IAM + token scope
> const images = bucket("images").allow("read", "write");   // → wasi:blobstore
> const events = queue("orders").allow("enqueue");          // → hobo:queue
> const app = api("main");
> app.post("/checkout", async (ctx) => { await checkout(await ctx.json()); ctx.json({ ok: true }); });
> // `hobo collect` runs this in resource-collection mode → manifest IR (see Plan 22)
> ```
> **Stub → AI-implement (Plan 23):** a `payments` capability can ship as `service("payments").stub()` so checkout runs end-to-end on day one; the Forge later generates the real component, validated against conformance + the recorded stub traces, and promotes it through a gated rollout. Everything else in the narrative below (deploy to one cloud → multi-cloud split → provider tuning → agent-operated → Forge) is unchanged.

## 1. Scaffold & build locally (no cloud)
```bash
npx hobo new snapshop -t fullstack && cd snapshop && hobo dev
```
`bindle.ts` — the *what* (agnostic):
```ts
import { bindle, database, objectStore, service, web, queue } from "@hobo/sdk";
import type { OrderEvent } from "./shared/types";

export default bindle("snapshop", (b) => {
  const db     = b.use(database("db", { engine: "postgres", require: "managed" }));
  const images = b.use(objectStore("images"));
  const orders = b.use(queue<OrderEvent>("orders"));

  const api = b.use(service("api", { handler: "./src/api", bind: { db, images, orders } }));
  b.use(web("site", { handler: "./src/site", bind: { api } }));
  return { db, images, orders, api };
});
```
`src/api/checkout.ts` — the *runtime* (durable workflow + choreography saga):
```ts
import { step, saga, emit } from "@hobo/runtime";

const reserve = step(async (o: Order, ctx) => ctx.bindings.db.reserve(o));
const charge  = step(async (o: Order) => paymentApi.charge(o), { retries: 5 });

export async function checkout(order: Order) {
  "use workflow";
  await reserve(order);
  await charge(order);
  await emit("OrderConfirmed", { orderId: order.id });   // ambient, like sleep/start
  return { status: "confirmed" as const };
}

export const fulfillment = saga("fulfillment")
  .on("OrderConfirmed", (e, ctx) => ctx.emit("ShipmentRequested", { orderId: e.orderId }))
  .compensate("ChargeCaptured", (e, ctx) => ctx.emit("RefundRequested", e)); // on later failure
```
`hobo dev` runs this against `@hobo/world-local`: Postgres in a container, a local object store, an in-memory queue. The developer drives a checkout; `hobo inspect run <id>` shows the workflow/step timeline; killing and restarting `hobo dev` **replays** the run to the same state (durability proven before any cloud).

## 2. Map to one provider ("just host it on Azure")
`hobo.config.ts` — the *where/how*:
```ts
import { defineHobo } from "@hobo/core";
import { azure } from "@hobo/provider-azure";
import { postgresWorld } from "@hobo/world-postgres";

export default defineHobo({
  world: postgresWorld({ url: process.env.DATABASE_URL }),
  defaultProvider: azure({ region: "eastus" }),   // figure out the best hosting
});
```
```bash
hobo login            # dev obtains an SVID (OIDC); no cloud keys pasted
hobo plan --camp prod # dry run
```
`hobo plan` output (illustrative): resolves `db→Azure Flexible Server (managed ✓)`, `images→Blob`, `orders→Service Bus`, `api→Container Apps`, `site→edge`; **estimated cost $X/mo**; all colocated in `eastus` (no cross-cloud egress). Then:
```bash
hobo deploy --camp prod --strategy canary
```
Under the hood ([Plan 4](./04-control-plane.md), [Plan 11](./11-event-model.md)): Gateway emits `deployment.Requested` → Planner `deployment.Planned` → ResourceActors provision in DAG order (`db`, `images`, `orders` in parallel → then `api` → then `site`), each via Pulumi Automation API inside a Firecracker Executor holding a **short-lived Azure token brokered from the dev's SVID** — no static secret anywhere. Outputs (conn strings) wire into `api` as secret refs. Canary shifts traffic with a health gate before going 100%. Every step is an event; the dashboard shows the live timeline and the credential audit.

## 3. Optimize a boundary (split providers, no app edits)
Marketing wants the storefront on the edge and the team has a Cosmos commitment. Change **only** `hobo.config.ts`:
```ts
export default defineHobo({
  world: postgresWorld({ url: process.env.DATABASE_URL }),
  defaultProvider: azure({ region: "eastus" }),
  tiers: { edge: cloudflare.workers() },                       // storefront → edge
  bindings: {
    "snapshop.db": azure.cosmos({ consistency: "session" })    // pin db to Cosmos
      // app's ctx.bindings.db is still the same typed client
  },
});
```
`bindle.ts` and all of `src/` are untouched. `hobo plan` now shows `site→Cloudflare`, `db→Cosmos`, flags a **cross-cloud egress edge** `site↔api` with its estimated cost ([Plan 13](./13-networking-connectivity.md), [Plan 16](./16-cost-finops.md)), and connects them over mTLS keyed by workload SVIDs. `hobo deploy` reconciles: only the changed resources are re-provisioned; the rest are diff-empty no-ops.

## 4. Provider-specific tuning (the escape hatch)
Black-Friday prep — tune just the API tier, still cloud-portable:
```ts
// bindle.ts (the only app-side change, additive + typed)
b.use(service("api", { handler: "./src/api", bind: { db, images, orders } }))
 .with(aws.fargate({ autoscale: { min: 3, max: 50 } }),
       azure.containerApps({ minReplicas: 3, maxReplicas: 50 }));
```
Only the resolved provider's block applies; targeting the other cloud needs no further edits ([Plan 2](./02-sdk-api.md)).

## 5. An agent operates it (zero developer effort)
The team points an MCP client (Claude) at the Yard. The ops agent:
1. `search_registry("database postgres managed")` → reads Hobo Code; finds a cheaper region.
2. `plan` a region move → sees cost delta + egress impact.
3. The move would exceed its `spendCapUsd`, so the **policy gate** opens a `require-approval` hook → a human approves in the dashboard.
4. `deploy` → the agent obtains scoped tokens via the broker (no keys), reconciles, and watches `inspect_run`/`tail_logs`; if a step regresses, the canary gate auto-rolls back and the agent reports why.
Every agent action, token grant, and approval is an event in the `CredentialAudit` trail ([Plan 6](./06-ai-native-agent-auth.md), [Plan 14](./14-observability.md)).

## 6. A missing provider appears on demand
The team wants a niche EU host with no `@hobo/provider-*` yet:
```bash
hobo forge https://niche-eu-cloud.example.com/docs
```
The **Forge** generates a candidate provider, runs it sandboxed against `@hobo/conformance` for the ports snapshop uses, and on pass publishes a signed plugin to the Registry. `hobo.config.ts` can now target it like any first-party provider ([Plan 6](./06-ai-native-agent-auth.md), [Plan 9](./09-verification-open-questions.md)).

## What this proves
A single, untouched application description (`bindle.ts` + `src/`) ran locally, shipped to one cloud, split across three, was tuned per-provider, operated by an agent under guardrails, and extended to a brand-new provider — **agnostic by default, optimizable on demand, AI-native throughout, fully auditable.** That is the thesis of HoBo, demonstrated end to end.
