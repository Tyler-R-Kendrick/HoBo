# Plan 19 — End-to-end worked example

> Part of the [HoBo Design Plan Suite](./README.md). A single narrative that exercises the whole platform, to prove the pieces in Plans 2–39 actually compose (the base narrative is Plans 2–23; the **v2–v5 addenda** below layer in the later models without rewriting it). App: **"snapshop"**, a tiny commerce app (catalog + checkout + an ops agent).

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

> **v3 dynamic configuration (Plan 25/26):** the developer never picks infra for `db` — a **platform engineer** writes **Resource Definitions** and the *same* `bindle.ts` resolves differently per **environment type**:
> ```ts
> // platform/resource-defs.ts
> defineResource({ type: "database", engine: "postgres", class: "ha",
>   provider: aws, driver: "terraform", with: aws.rds({ multiAz: true }),
>   match: { envType: "production" } });               // prod → managed HA RDS
> defineResource({ type: "database", engine: "postgres",
>   driver: "container", with: { image: "postgres:16" },
>   match: { envType: "ephemeral" } });                // preview → cheap in-cluster
> ```
> `hobo deploy --camp prod` → matches the HA definition; `hobo deploy --camp preview` (an **ephemeral** Camp, auto-TTL) → matches the in-cluster one. Each choice emits a **`match.Decided`** event (score + rejected candidates) so the dashboard answers "*why did preview get the cheap DB?*". A **Pipeline** can open the prod **Delta** behind an **approval gate**; if the cluster is private, Executors run behind the **HoBo Agent**. The app code and `bindle.ts` are untouched throughout.

> **v4 gates (Plan 29/30):** later, the team ships `api@v3` that drops `tenantId` from `order.created`. `hobo verify --target prod` **blocks**: the contract plane's `can-deploy` finds `worker@v2` (running in prod) still consumes `tenantId` (`compat.GateFailed`), and the policy plane flags the new public endpoint with an *obligation* ("allow but require auth middleware"). `hobo explain-failure` replays the gate events; `hobo fix --dry-run` proposes a **dual-publish migration window** + an auth binding. After the shim + a green eval gate on the updated classifier, `hobo verify` passes and the prod Delta promotes as a canary (the policy obligation). Nothing here is a separate CI tool — it's the same event-sourced graph.

> **v5 data plane ([Plan 39](./39-data-plane-projections.md)):** snapshop's domain data is **event-sourced by default**. The `reserve`/`charge` steps in §1 use `ctx.bindings.db.reserve(...)` — that direct DB call is now the *escape-hatch* form ([raw/adopted access](./39-data-plane-projections.md)); the default domain write is **command → aggregate → event**, and reads come from **projections** a data architect maps onto any backend.
> ```ts
> // domain.wit — the canonical domain schema (Plan 24 / ADR-0051) → generates TS types + protobuf event bodies
> //   record order { id: string, status: order-status, total: u64 }   enum order-status { placed, confirmed, shipped }
>
> // src/api/orders.ts — WRITE: a command runs inside the Order aggregate (an actor; ADR-0053)
> import { command, view } from "@hobo/runtime";
> export const placeOrder = command("Order.Place", { key: (i: PlaceOrder) => i.id }, (input, ctx) => {
>   if (ctx.state.status) throw new Conflict("order exists");         // invariant vs the aggregate's write-model fold
>   ctx.emit("OrderPlaced", { id: input.id, total: input.total });   // appended under the aggregate's lease + optimistic seq
> });
>
> // READ: a reactive, projection-backed view (Plan 32) — no table, no SQL, backend-neutral by logical name
> export async function myOrders(userId: string) {
>   "use query";
>   return view("orders").where({ userId, status: "placed" }).order("createdAt").paginate({ limit: 20 });
> }
> ```
> The `orders` **projection** folds `Order.*` events into a read model; a **platform/data engineer** picks its sink exactly like the `db` definition in v3 — `defineResource({ type: "projection-sink", paradigm: "relational", match: { envType: "production" } })` in prod, the native log-backed projection in preview — recorded in **`match.Decided`**. App code names `view("orders")`, never a backend, and the `OrderConfirmed` saga (§1) is unchanged (it already reacts to domain events). *Developers don't know how orders are stored or queried; the architect has full control* — the data-plane thesis, shown end to end.

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
`hobo dev` runs this against `@hobo/runtime-local`: Postgres in a container, a local object store, an in-memory queue. The developer drives a checkout; `hobo inspect run <id>` shows the workflow/step timeline; killing and restarting `hobo dev` **replays** the run to the same state (durability proven before any cloud).

## 2. Map to one provider ("just host it on Azure")
`hobo.config.ts` — the *where/how*:
```ts
import { defineHobo } from "@hobo/core";
import { azure } from "@hobo/provider-azure";
import { postgresRuntime } from "@hobo/runtime-postgres";

export default defineHobo({
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
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
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),
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
1. `search_registry("database postgres managed")` → reads Capability Manifest; finds a cheaper region.
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
