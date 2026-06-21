# Plan 2 — SDK / API design ⭐ (deep)

> Part of the [HoBo Design Plan Suite](./README.md). This is one of the two deepest plans. See also the [event model](./11-event-model.md) (durability) and [providers](./03-providers-iac.md) (mapping).

The SDK is four cooperating layers. Each lower layer is usable on its own; higher layers add ergonomics. The "feels like Vercel Workflows" surface = Layer 4 primitives + Layer 3 topology. **Design tenet:** the *agnostic* path is the default and the shortest; provider-specific power is always one `.with(...)` away.

> **v2 update (Nitric/WASM/Aspire iteration).** Three refinements now layer on top of this model:
> - **Authoring is IfC-default** ([Plan 21](./21-resources-catalog.md)): you declare resources inline with `.allow(...)` and HoBo collects them by running the component; the explicit `bindle()` topology below becomes the **advanced/escape-hatch** mode.
> - **Ports are WIT worlds** and **services are wasm/wasi components by default** ([Plan 20](./20-wasm-wasi-runtime.md)); the typed clients shown here are generated from those worlds (OCI-container fallback for non-wasm workloads).
> - **Bindings adopt Aspire-style references + a manifest IR** ([Plan 22](./22-wiring-manifest.md)).
> The Layer 1–4 model still holds; read it as the conceptual core, with those three docs as the concrete v2 surface.

> **v3 update (Humanitec iteration).** The `hobo.config.ts` mapping (`defaultProvider`/`tiers`/`bindings`) is now **sugar over default Resource Definitions** — platform engineers can override with explicit, context-matched definitions + resource **classes** ([Plan 25](./25-resource-definitions-matching.md)); Camps gain **environment types** ([Plan 26](./26-environments-deltas.md)). Resources accept a `class` (`standard`/`ha`/…). HoBo can also **import a Score file** as a workload-spec input (interop), like importing an Aspire manifest.

---

## Layer 1 — the Camp runtime (durable runtime ports)
A **Camp** provides the durable runtime substrate via these **runtime ports** — a superset of the usual Storage+Queue+Streamer, adding actors + a deterministic clock. *(This is HoBo's own concept; it deliberately replaces — and does not adopt — Vercel's "World".)*

```ts
// @hobo/core
export interface Runtime {       // the durable runtime a Camp supplies
  events:  EventStore;   // append-only log; append/read/subscribe, optimistic concurrency
  queue:   Queue;        // at-least-once enqueue/handle; dedup by idempotency key
  streams: Streamer;     // realtime read/write per run (run.readable)
  actors:  ActorHost;    // virtual-actor placement, single-writer leases + fencing
  clock:   Clock;        // deterministic time + durable timers (sleep/cron)
}

export interface EventStore {
  append(streamId: string, events: EventInput[], opts: { expectedSeq: number }): Promise<void>;
  read(streamId: string, fromSeq?: number): AsyncIterable<EventEnvelope>;
  subscribe(filter: StreamFilter, handler: (e: EventEnvelope) => Promise<void>): Subscription;
  snapshot(streamId: string, state: unknown, seq: number): Promise<void>;
}
export interface ActorHost {
  acquire(key: string): Promise<Lease>;           // single-writer lease + fenceToken
  state<S>(key: string): DurableState<S>;          // backed by the actor's event stream
}
```
**Provided by the Camp** (the provider-specific layer); **the same app code runs regardless of the runtime backend** (`HOBO_RUNTIME` env or Camp config). Built-in `@hobo/runtime-local` (SQLite/filesystem) for dev; production backends: `runtime-postgres`, `runtime-temporal`, `runtime-restate`, `runtime-cloudflare`. This seam is what makes durability portable and gives replay everywhere ([Plan 11](./11-event-model.md)).

> **Runtime vs Providers** (a key distinction): the **Camp runtime** backs the *data-plane runtime* of your app (durable state, queues, timers). A **Provider** ([Layer 2](#layer-2--providers-infra-capability-ports)) provisions *infrastructure* (databases, compute, buckets). A Camp **supplies both, chosen independently** — its runtime backend **and** its provider can be different vendors (e.g. `provider-aws` for infra + a Temporal runtime). *"Runtime" has three senses — the `@hobo/runtime` SDK-primitives package, the `Runtime` interface, and the `runtime-*` backends; see the [glossary](./README.md#glossary--naming-thematic-all-tunable).*

---

## Layer 2 — Providers (infra capability ports)
Capabilities are grouped by service model. Each is a **port**; providers implement subsets and advertise them via Hobo Code ([Plan 6](./06-ai-native-agent-auth.md)).

```ts
// service-model taxonomy (illustrative)
PaaS:  compute() web() function() cron() queue() topic() gateway()
SaaS:  database() cache() objectStore() secrets() vector() search() auth() email()
CaaS:  containerService() image()        // image built via build-* adapters
IaaS:  vm() microVm() network() volume()  // microVm via Firecracker adapter
```
A **Provider** binds these ports to a backend and declares *how* it realizes them (which IaC/build adapter it uses under the hood). Full interfaces and the resolution/Planner algorithm live in [Plan 3](./03-providers-iac.md).

---

## Layer 3 — Topology / resources (declare the app, map to providers)
`bindle()` declares resources and bindings; **mapping rules** decide which provider realizes each port. Three mapping styles, all supported:

```ts
// hobo.config.ts — Camps (runtime backend + provider mapping; the "where/how")
import { defineHobo } from "@hobo/core";
import { azure } from "@hobo/provider-azure";
import { aws } from "@hobo/provider-aws";
import { cloudflare } from "@hobo/provider-cloudflare";
import { postgresRuntime } from "@hobo/runtime-postgres";

export default defineHobo({
  runtime: postgresRuntime({ url: process.env.DATABASE_URL }),   // the Camp's durable runtime backend

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
**Resolution order** per port: explicit `bindings` → `tiers` → `defaultProvider` (formalized in [Plan 3 §Planner](./03-providers-iac.md)).

### Binding & injection mechanics
`bind: { db }` does three things at deploy time and one at runtime:
- **Deploy:** records a dependency edge (db must provision before api — drives the DAG in [Plan 4](./04-control-plane.md)); requests the right scoped credential for api→db; wires connection info as the resource's env/secret refs (never plaintext in the Bindle).
- **Runtime:** `ctx.bindings.db` is a **provider-agnostic typed client** whose concrete driver is chosen by the resolved provider (e.g. a `SqlClient` over `pg` for RDS/Flexible Server/Neon). The app imports nothing provider-specific.
```ts
// src/api/index.ts
import { handler } from "@hobo/runtime";
export default handler(async (req, ctx) => {
  const rows = await ctx.bindings.db.query("select 1");  // typed; driver chosen by provider
  await ctx.bindings.orders.send({ id: "o1" });          // typed queue client
});
```

---

## Layer 4 — Runtime primitives (actors, workflows, steps, sagas, agents)
This is the Vercel-feel surface. Both **directive** sugar and **wrapper** form are supported (the directive compiles to the wrapper; same semantics).

```ts
import { workflow, step, actor, saga, sleep, cron, start, createHook } from "@hobo/runtime";

// step: full Node access, retried, result memoized in the event log
export const reserveInventory = step(async (orderId: string) => {
  return { reserved: true };
}, { retries: 5, timeout: "30s" });

// durable workflow: deterministic + replayable (directive form)
export async function checkout(order: Order) {
  "use workflow";
  await reserveInventory(order.id);
  await sleep("10s");                          // durable timer (survives restarts)
  using approval = createHook<{ ok: boolean }>(); // pause for external signal
  const decision = await approval;
  if (!decision.ok) return { status: "rejected" as const };
  await chargePayment(order);
  return { status: "confirmed" as const };
}

// virtual actor / grain: durable single-writer state per key, backed by Runtime.actors
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

### Complete primitive catalog
| Primitive | Purpose | Durability semantics |
|---|---|---|
| `step(fn, opts?)` | side-effecting unit | runs once; result memoized; auto-retry per `opts` |
| `workflow(fn)` / `"use workflow"` | deterministic orchestration | replays over memoized steps; seeded RNG/clock |
| `query(fn)` / `"use query"` | deterministic **reactive** read-only query | read-set tracked; re-pushed on change at a consistent `seq`; client `useQuery()` ([Plan 32](./32-reactive-live-queries.md)) |
| `actor(name, def)` | stateful single-writer entity (grain) | state = folded event stream; lease + fencing |
| `saga(name)` | event-driven process manager | choreography; compensations; correlation-keyed |
| `agent(name, def)` | durable AI agent | tools-as-steps; replayable; identity-injected ([Plan 6](./06-ai-native-agent-auth.md)) |
| `training(fn, opts)` / `"use training"` | **AI-rewritable semantic function** | baseline body; HoBo optimizes prompt/code vs a rubric from OTel/OpenInference trajectories + live-evals; gated promotion ([Plan 23](./23-stubbable-ai-implementations.md)) |
| `sleep(d)` / `cron(expr)` | durable timers | scheduled via Runtime.clock; survive restarts |
| `createHook<T>()` | pause until external resume | token-addressable; multi-event via async iterator |
| `createWebhook()` | hook with auto HTTP routing | provider `gateway` wires the URL |
| `getWritable<T>()` | stream output to clients | per-run stream; `run.readable` on the other side |
| `start(wf, args, opts?)` | fire-and-forget a run | returns `{ runId, readable }`; typed against `wf` |
| `emit(type, data)` | publish a domain event | appended to the event store; drives choreography sagas |
| `signal(actorKey, msg)` | message an actor | enqueued; at-least-once; idempotent by key |

### Trainable methods (`"use training"`)
A fourth directive joins `"use workflow"`/`"use step"`: **`"use training"`** marks a method as an **AI-rewritable semantic function** — HoBo continuously optimizes its prompt/code against a rubric, from real recorded executions. The body is the baseline (often a `stub()`); the optimizer may rewrite it.

```ts
import { training } from "@hobo/runtime";

/**
 * @intent Classify a support ticket; `critical` ONLY for security/outage/production impact.
 * @invariant output.category ∈ KnownCategories; `rationale` must not contain PII.
 */
export const classifyTicket = training(
  async (t: Ticket): Promise<Classification> => llm.classify(t),     // baseline
  {
    intent: "Route tickets; critical only for security/outage/prod impact.",
    contract: ClassificationContract,                                 // Zod I/O + invariants (Plan 29)
    rubric: { categoryCorrect: 0.92, urgencyCalibrated: 0.90, piiSafe: 1.0 }, // eval (Plan 23)
  },
);
// directive form is equivalent:  export async function classifyTicket(t: Ticket) { "use training"; ... }
```

What the developer provides is **intent + contract + rubric** (the semantic grounding that makes code rewritable). What HoBo does — capture OTel/[OpenInference](https://github.com/Arize-ai/openinference) trajectories, score them with **live-evals**, run an optimizer, and promote a candidate only through the conformance + eval + policy gate — is the **training pipeline in [Plan 23](./23-stubbable-ai-implementations.md)**. The optimizer is an **engine behind a WIT port** (built-in default; Microsoft Agent Lightning / Trace as optional *internal* providers) and is **never part of this SDK surface** ([ADR-0025](./adr/ADR-0025-use-training-directive-and-training-engine.md)): swapping it is a config change, not an app-code change.

### Error handling & retries
```ts
import { FatalError, RetryableError } from "@hobo/runtime";
export const charge = step(async (o: Order) => {
  if (o.total <= 0) throw new FatalError("invalid total");          // no retry
  const res = await fetch(...);
  if (res.status >= 500) throw new RetryableError("upstream", { retries: 3 });
  return res.json();
});
```
- Default: steps retry 3× with capped exponential backoff + jitter. `FatalError` stops immediately; `RetryableError` overrides the budget. Exhausted retries surface as `run.StepFailed` and (in workflows) propagate as a catchable error so the workflow can compensate.
- Idempotency keys are auto-derived per step call site + args, overridable, and passed to providers that support them ([Plan 5](./05-reliability-ha.md)).

### The provider-specific options pattern (the core promise)
- `.with(provider.option({...}))` on any resource — **fully typed by the provider package**, additive, inert for other providers.
- Stack multiple providers on one resource so a single Bindle targets many clouds with no edits:
```ts
database("db", { engine: "postgres" })
  .with(aws.rds({ multiAz: true }),
        azure.flexibleServer({ haMode: "zoneRedundant" }),
        neon.serverless({ autoscale: true }));   // only the resolved provider's block applies
```
- **`prefer` / `require` qualifiers:** `database("db", { engine: "postgres", require: "managed" })` fails planning if no resolved provider offers managed Postgres; `prefer` degrades gracefully (e.g. to a container Postgres) with a warning event.

### Type ergonomics
- Bindings flow end-to-end: `service({ bind: { db } })` types `ctx.bindings.db` as that resource's client type.
- `start(checkout, order)` is checked against the workflow signature; hooks/streams are generic (`createHook<T>()`, `getWritable<UIMessageChunk>()`).
- Provider option types are exported by each provider package, so autocomplete on `.with(aws.…)` shows only valid knobs for that provider/resource pairing (conditional types keyed on the port).

---

## Local development & testing
- **`hobo dev`** runs the Bindle against a **local Camp** (`@hobo/runtime-local`) with an in-process Provider mock layer: resources resolve to local equivalents (Postgres in a container, a local object store, an in-memory queue) so the agnostic path runs with zero cloud. Replay/inspection work offline (mirrors Lakebed's instant-onboarding strength, full CLI in [Plan 15](./15-cli-dx.md)).
- **Test runtime:** `@hobo/runtime-local` exposes a deterministic test mode — drive time (`clock.advance`), assert emitted events, and **replay a run to assert identical final state** (the determinism test). Providers have fakes from `@hobo/conformance` so unit tests never hit a cloud.
```ts
import { testRuntime } from "@hobo/runtime-local/testing";
test("checkout is durable", async () => {
  const w = testRuntime();
  const run = await w.start(checkout, sampleOrder);
  await w.resumeHook(run, { ok: true });
  await w.clock.advance("10s");
  expect(await w.replay(run)).toEqual(await w.state(run)); // replay == live
});
```

## Versioning (Bindles & workflows)
- **Bindle versions** are immutable, content-addressed; deploys reference a version; promote/rollback move a Camp's pointer (events `bindle.VersionPublished`, `deployment.Promoted`).
- **Workflow versioning** follows the Vercel model: in-flight runs complete on the deployment they started on; `start(wf, args, { deploymentId: "latest" })` opts new runs onto the newest code. Determinism across versions is preserved by pinning a run to its code version; breaking changes use explicit upgrade boundaries.

## Iteration hooks
- Directive vs wrapper as the *documented* default (compiler transform vs pure runtime).
- Whether `actor` (app-level) and the control-plane "grain" share one runtime or two.
- Saga DSL shape (builder vs decorators vs plain handlers).
- Exact `ctx` surface (`ctx.bindings`, `ctx.identity`, `ctx.token`, `ctx.log`, `ctx.emit`).
- Whether `handler()` (request entrypoints) and `workflow()` unify.
