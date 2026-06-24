# Authoring: Resources, Wiring, Config & DSL

This capability doc covers the authoring surface end to end: the resource catalog and the `.allow()` model, wiring and the manifest IR, configuration and secretless secrets, and the Hobo Code DSL — one model from declaration to deployable artifact.

## Plan 21

> **Contracts & policy (gates):** an `.allow()` declaration is also a **capability contract** ([Plan 29](./contracts-policy-flags.md#plan-29)) — the **required** scope must be ⊆ the **granted** scope on the resolved provider; a mismatch is a contract failure caught by `can-deploy`, not a runtime surprise.

### The `.allow()` model — one declaration, three effects
Declaring a permission on a resource drives **three** things at once:
1. **Least-privilege IAM** — the IaC adapter generates the minimal cloud policy ([Plan 4](./control-plane.md#plan-04)).
2. **WASM capability grant (link)** — the component is linked to *only* the provider interfaces its permissions require; everything else is denied by the wasm host ([Plan 20](./wasm-runtime-wit.md#plan-20)).
3. **Agent token scope** — the broker issues scoped tokens bounded to exactly these `(resource, verbs)` ([Plan 6](./ai-native-agent-auth.md#plan-06)).

```ts
// IfC-default authoring: resources declared inline, permissions co-located
import { bucket, kv, topic } from "@hobo/sdk";

const profiles = bucket("profiles").allow("read", "write");   // → blobstore RW IAM + wasi:blobstore link + token scope
const sessions = kv("sessions").allow("get", "set");          // → wasi:keyvalue (get/set only)
const events   = topic("user-created").allow("publish");      // → wasi:messaging (publish only)
```
Permissions are **deny-by-default**: omit a verb and neither IAM, link, nor token grants it. This unifies least-privilege IAM with wasm capability security and HoBo's agent auth.

### Catalog — resource → WIT port → permission verbs
| Resource | `@hobo/sdk` | WIT port | `.allow()` verbs | Equivalence (AWS/Azure/GCP/CF) |
|---|---|---|---|---|
| **API / HTTP** | `api(name)` | `wasi:http` (+ `hobo:http`) | route-level security | API GW+Lambda / Container Apps / Cloud Run / Workers |
| **KV** | `kv(name)` | `wasi:keyvalue` | `get`,`set`,`delete` | DynamoDB / Cosmos / Firestore / KV |
| **Bucket** | `bucket(name)` | `wasi:blobstore` (+ `hobo:blob-events`) | `read`,`write`,`delete` | S3 / Blob / GCS / R2 |
| **Queue** (pull) | `queue(name)` | `hobo:queue` | `enqueue`,`dequeue` | SQS / Service Bus / Tasks / Queues |
| **Topic** (push) | `topic(name)` | `wasi:messaging` | `publish`,`subscribe` | SNS / Event Grid / Pub/Sub / — |
| **Secret** | `secret(name)` | `wasi:config`/`hobo:secrets` | `put`,`access` | Secrets Mgr / Key Vault / Secret Mgr |
| **Data** | `data(name)` | `hobo:data` (paradigm sub-ports) | `read`,`write`,`query`,`admin` | one abstract dep, paradigm-specific providers: relational/SQL · document/NoSQL · graph · vector · key/value ([ADR-0052](./adr/03-data-plane.md#adr-0052)) |
| **Schedule** | `schedule(name)` | `hobo:scheduler` | n/a | EventBridge / Timer / Cloud Scheduler |
| **WebSocket** | `websocket(name)` | `wasi:websocket` **(preview)** + `hobo:websocket` ext | `accept`,`connect`,`send`,`broadcast`,`subscribe` | API GW WS / Web PubSub / — — preview interface tracking the likely standard; principal-bound, rooms/broadcast, lifecycle as `ws.*`, migrates via upcaster ([ADR-0075](./adr/07-portability-extensibility.md#adr-0075)) |
| **Batch job** | `job(name)` | `hobo:job` (+ `vm`/`microVm`) | `submit` | AWS Batch / Azure Batch / Cloud Batch |
| **Website** | `web(name)` | static + `wasi:http` | n/a | CloudFront+S3 / Front Door+Blob / CDN+GCS |
| **Compute/service** | `service(name)` | component (exports `wasi:http`) | (binds below) | Fargate / Container Apps / Cloud Run / Workers |
| **Search** | `search(name)` | `hobo:search` | `index`,`query`,`admin` | full-text in core; vector/graph as optional extensions; `embed` is a vector-extension capability ([ADR-0034](./adr/03-data-plane.md#adr-0034)/[Plan 32](./data-plane.md#plan-32)) |
| **Feature flag** | `flag(name)` | `hobo:feature-flag` | `eval`,`change` | built-in store / OpenFeature providers (flagd/LaunchDarkly) ([Plan 29](./contracts-policy-flags.md#plan-29)) |
| **Auth** (end-user) | `auth(name)` | `hobo:auth` | (verify/session) | federate+verify any IdP — **swappable adapters: WorkOS · Auth0 · Supabase Auth · Microsoft Entra ID** (+ Google/GitHub/Clerk/customJwt) + thin dev built-in; only registered ones considered, auto-generatable ([Plan 6](./ai-native-agent-auth.md#plan-06)/[ADR-0073](./adr/07-portability-extensibility.md#adr-0073)) |
| **Crypto** | `crypto(name)` | `hobo:crypto` | `encrypt`,`decrypt`,`sign`,`verify` | KMS / Key Vault / Cloud KMS / in-boundary HSM — **keys the app never holds**, brokered like secrets (see *Configuration & secretless secrets* below) |
| **Notify** | `notify(name)` | `hobo:notify` | `send` | one capability; **channels are types** (`email`/`sms`/`push`/`webhook`) — SES/SendGrid · Twilio/SNS · FCM/APNs · signed HTTP — a thin **cloud-messaging port** (typed templates, PrincipalRef recipients, policy-gated), shares the ops receiver port ([ADR-0059](./adr/03-data-plane.md#adr-0059)) |
| **Guardrail** | `guardrail(name)` | `hobo:guardrail` | `check` | built-in rules / Llama Guard / hosted moderation / local — **AI output safety** (moderation/PII/jailbreak/grounding) as a policy-gated step ([Plan 46](./governance-planes.md#plan-46)/[ADR-0061](./adr/02-identity-security.md#adr-0061)) |
| **UI render** | `ui(name)` | `hobo:ui-render` | `render`,`drive` | pluggable engines: OpenUI (UI from intent) · json-render (declarative render IR) · mcp-apps (MCP-driven app surfaces) — **app/UI generation** typed from the domain schema, design.md-gated, reactive to materializations ([ADR-0056](./adr/03-data-plane.md#adr-0056)) |
| **Golden suite** | `golden(name)` | `hobo:golden` | `run`,`bless` | a custom/extension **Golden Suite** + `golden.sample` golden-master cases over the default-on auto-derived suite — pins conformance/contracts/evals/benchmarks/chaos/SLO + reference outputs as a reproducible `can-deploy` gate; failure → Incident → Crew → A2H ([ADR-0082](./adr/02-identity-security.md#adr-0082)) |
| **Experiment** | `experiment(name)` | `hobo:experiment` | `assign`,`expose`,`analyze` | the **Harness** experiment leg ("OpenExperiment") — A/B / multivariate: assignment + exposure + metrics + statistical analysis over OTEL + the event log; built-in default, adapters Statsig/GrowthBook/Optimizely/Eppo/Amplitude ([ADR-0083](./adr/02-identity-security.md#adr-0083)). *(Flags = `flag()`; canary/rollout is deploy-time delivery config, not an app resource.)* |

The catalog reaches **capability parity with Nitric and Vercel** ([ADR-0002](./adr/01-architecture-core.md#adr-0002)): APIs, schedules, AI (`search` + its vector/graph extensions, `guardrail`), websites, storage, secrets/config, data/caching (`data`/`kv`), messaging (`topic`/`queue`/`notify`), feature flags, and functions/workflows (`service`/`job` + the durable runtime) — every capability expressed as a resource behind a port. Cross-cloud equivalence classes are owned by [Plan 4](./control-plane.md#plan-04); this table is the resource→port view.

**Full Nitric building-block parity (one resource per block, each a WIT interface).** Every Nitric building block has a catalog row above, each backed by a WIT port ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). **Queue and topic/pub-sub are the runtime's messaging building blocks**, backed by WIT interfaces and named to match them ([Plan 20](./wasm-runtime-wit.md#plan-20)):

| Nitric building block | HoBo resource | WIT interface | `.allow()` verbs |
|---|---|---|---|
| APIs / HTTP routing | `api(name)` | `wasi:http` (+ `hobo:http`) | route-level security |
| Schedules (cron) | `schedule(name)` | `hobo:scheduler` | n/a (cron trigger) |
| Topics & subscriptions (pub/sub) | `topic(name)` | `wasi:messaging` | `publish`,`subscribe` |
| Queues | `queue(name)` | `hobo:queue` | `enqueue`,`dequeue` |
| Key/value store | `kv(name)` | `wasi:keyvalue` | `get`,`set`,`delete` |
| Storage / blob (buckets) | `bucket(name)` | `wasi:blobstore` (+ `hobo:blob-events`) | `read`,`write`,`delete` |
| Secrets | `secret(name)` | `wasi:config`/`hobo:secrets` | `put`,`access` |
| Data (relational/document/graph/vector/kv) | `data(name)` | `hobo:data` (paradigm sub-ports) | `read`,`write`,`query`,`admin` |
| Websockets | `websocket(name)` | `wasi:websocket` (preview) + `hobo:websocket` ext | `accept`,`connect`,`send`,`broadcast`,`subscribe` |

HoBo's runtime provides **everything Nitric's runtime does** — the full building-block set above — but realized as **WIT interfaces**, with providers implementing the WIT world (not Go plugins) and invoked over the **wRPC membrane** ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). A building block is just a port; HoBo's own durable workflow/actors, materializations, auth, and AI ports (the rest of the catalog) sit alongside the Nitric set on the same membrane.

> **Data resources vs the data plane.** For an app's **domain data**, the default path is **not** raw `ctx.bindings.db` access — it's the event-sourced **command → aggregate → projection** model ([Plan 32](./data-plane.md#plan-32)/[ADR-0050](./adr/03-data-plane.md#adr-0050)). The `data`/`kv`/`bucket`/`search` resources here are then **how a projection *sink* is realized** (a data architect maps a read model onto one via Matching — for `data`, the paradigm + backend is a provider/Matching choice, [ADR-0052](./adr/03-data-plane.md#adr-0052)), plus the **escape hatch** for direct access and the home of **adopted authoritative-external** stores ([ADR-0041](./adr/07-portability-extensibility.md#adr-0041)). They remain first-class resources; domain reads/writes go through `command`/`repo`/`view`, not hand-written queries by default.
>
> **Opt-in paradigm packages (Encore-style ergonomics, [ADR-0081](./adr/03-data-plane.md#adr-0081)).** `data(name)` is the **portable default** (paradigm chosen by Matching). A developer who wants a paradigm-idiomatic typed abstraction instead opts into **`@hobo/sql`** / **`@hobo/vector`** / **`@hobo/graph`** / **`@hobo/document`** — idiom layers over the same `hobo:data`/`hobo:search` ports that map to cloud natives by Matching and stay overridable (`.with()` native pin · Resource Definition · `.raw()` dialect). A deliberate, surfaced specialization (equivalence-class-bounded), not the default.

### IfC-default authoring (resources emerge from code)
The **default** authoring mode is Nitric-style: declare resources inline and `.allow()` what you use; HoBo's deploy pipeline runs each component in **resource-collection mode** to capture declarations into the **manifest IR** (below). Handlers attach to resources directly:
```ts
import { api, kv } from "@hobo/sdk";
const todos = kv("todos").allow("get", "set");
const app = api("main");
app.get("/todos/:id", async (ctx) => ctx.json(await todos.get(ctx.params.id)));
app.post("/todos",    async (ctx) => { await todos.set(crypto.randomUUID(), await ctx.json()); });
```
The explicit `bindle()` topology ([Plan 2](./sdk-api.md#plan-02)) remains available as the **advanced/escape-hatch** mode when you want to declare the graph by hand or do things collection can't infer.

### Handlers, events & triggers (parity with Nitric "services")
Each entry point compiles to a component exporting the right WIT interface:
- HTTP routes → `wasi:http/incoming-handler`.
- `topic.subscribe`, `bucket.on('write', …)`, `schedule.cron(…)`, `queue` workers, `websocket.on(…)`, `job.handler(…)` → host triggers that invoke the component. These also flow through HoBo's durable runtime ([Plan 2](./sdk-api.md#plan-02)) so a subscriber can be a workflow/saga with replay + compensation — a capability Nitric lacks.

### Declarations follow varlock's declarative schema
Resource declarations, config items, and the DSL surface all use **varlock's declarative schema pattern** ([ADR-0027](./adr/02-identity-security.md#adr-0027)): each item is a **typed, annotation-driven declaration** carrying its **type, required, sensitivity, and source**. The annotations are provider-neutral; Matching and the Camp's adapters consume them.

### DNS is a Yard-level resource, not app/Bindle-level
DNS and custom domains are **not** in the app-level catalog ([ADR-0035](./adr/07-portability-extensibility.md#adr-0035)). DNS is a **Yard-level** resource — provider-global, with **per-Camp overrides** — so a Bindle never declares it. Custom-domain binding (ACME DNS-01 certs; failover/weighted/latency across Camps) is resolved at the Yard layer and applied per Camp; the app references endpoints, not zones.

### Notes
- `hobo:blob-events` is a HoBo WIT shape where no standard `wasi:*` exists; `hobo:websocket` is a **thin extension over the preview `wasi:websocket`** ([ADR-0075](./adr/07-portability-extensibility.md#adr-0075)), not a standalone shape.
- A relational `data` provider's schema migrations are specified in [Plan 32](./data-plane.md#plan-32) ([ADR-0032](./adr/03-data-plane.md#adr-0032)): declarative desired-schema + auto-diff (raw `.up.sql`-style steps as an escape hatch), gated **expand/backfill/contract** apply + snapshot rollback, and cross-cloud move within an equivalence class.
- `.allow()` verbs are per-resource-type typed enums; each provider's IAM adapter maps them to that provider's actions.
- The programmable surface is **WIT/WASM**: collection runs each component to capture declarations, and any Component-Model language authors Bindles. TypeScript is the **first reference implementation**, not a requirement ([ADR-0069](./adr/01-architecture-core.md#adr-0069)) — non-TS languages are collected the same way (run-to-collect), with static analysis as a supplement.

### Wiring & the manifest IR (Aspire model)

> **Deltas & Sets (Humanitec parity).** The manifest IR is the immutable **Deployment Set**; a **Delta** is a mutable diff against it (draft→review→promote), both event-sourced ([Plan 25](./platform-engineering.md#plan-25)). Placeholders/output-refs align to Humanitec syntax (`${resources.<type>.<class>#<id>.outputs.<name>}`, `${context.*}`) — see [Plan 25](./platform-engineering.md#plan-25). Besides direct apply, a **GitOps publisher** can write the Set to Git for Argo/Flux ([Plan 25](./platform-engineering.md#plan-25)).

`bind` is a **reference**: lazy, convention-based, adopting Aspire `.WithReference()` semantics.
- Declaring `bind: { db }` (or referencing a resource inside a handler) records a **dependency edge** (drives the DAG + link), and **injects connection info/endpoints** into the consumer.
- **Lazy resolution** (Aspire's `ReferenceExpression`): references resolve at deploy/runtime, so the *same component* runs locally and on any provider with no code change.
- **Convention:** endpoints/connection info are injected with predictable keys (Aspire uses `services__<name>__<endpoint>__<i>` and `ConnectionStrings__<name>`); HoBo exposes them as a typed `ctx.bindings.<name>` client generated from the resource's WIT port, with the raw env convention available underneath for non-wasm/container fallback.

```ts
const db  = data("db");                          // abstract data dep; paradigm + backend resolved by Matching
const api = service("api", { bind: { db } });    // api gets a typed db client; edge + link recorded
// container/component fallback receives ConnectionStrings__db / services__db__... env vars
```

**Config for any component *or* container is uniform.** Adopt Aspire's `addContainer(...)` surface, applied identically to wasm components and OCI containers (wasm-on-OCI is just another image). **`addContainer(...)` both wires *and* builds** ([ADR-0005](./adr/01-architecture-core.md#adr-0005)): it records the dependency edge/link *and* drives the build of the workload through the dagger-adjacent programmable **BuildProvider**, which **defaults to wasm-on-OCI** (and is swappable to plain OCI). One call covers wiring and the build step:
- **Endpoints:** `withHttpEndpoint(port, targetPort, name)`, `withEndpoint({ scheme, port, targetPort, external, protocol })`.
- **Env / args:** `withEnvironment(k, v)`, `withArgs(...)` (values may be lazy references).
- **Storage:** `withBindMount(src, dst, readOnly?)`, `withVolume(name, dst)`.
- **Lifecycle:** `withLifetime("persistent")`, `withExplicitStartup()`, `waitFor(dep)`, `waitForCompletion(job)`.
- **Health:** `withHttpHealthCheck(path)` / `withHealthCheck()` — feeds rollout gates ([Plan 5](./reliability-observability-cost.md#plan-05)).
```ts
addContainer("cuda-job", "ghcr.io/acme/cuda-job:1.2")    // wires + builds via BuildProvider (wasm-on-OCI default)
  .withEndpoint({ port: 8080, scheme: "http" })
  .withEnvironment("MODEL", "yolo")
  .withVolume("models", "/models")
  .withHttpHealthCheck("/healthz");
```
The BuildProvider is the programmable build seam: a prebuilt image short-circuits the build; a source dir is compiled (wasm-on-OCI by default) before the edge/link is finalized.

**Annotations are typed extensibility (`.with(...)`).** Aspire attaches behavior via resource **annotations** consumed by deploy tools. HoBo's existing provider-specific options pattern **is** this: `.with(provider.options())` adds typed annotations that the resolved Provider/IaC adapter consumes; non-resolved providers' annotations are inert ([Plan 2](./sdk-api.md#plan-02)). First-party annotations (health, lifetime, replicas, scaling, residency) are typed and provider-neutral.

**The manifest IR (deployment intermediate representation).** Resource-collection emits a **HoBo manifest** — the union of Nitric's resource spec and Aspire's `aspire-manifest.json`. It is the single artifact the Planner/Orchestrator consume and that publishers/IaC adapters render to real infra. Sketch:
```jsonc
{
  "schema": "hobo.manifest/v1",
  "resources": {
    "db":  { "type": "data.v1", "port": "hobo:data", "paradigm": "relational", "allow": ["query"],
             "connectionString": "{db.connectionString}" },
    "api": { "type": "component.v1", "image": "oci://.../api@sha256:…", "runtime": "wasm",
             "exports": ["wasi:http/incoming-handler"],
             "links": [ { "import": "hobo:data", "to": "db" } ],
             "endpoints": { "http": { "scheme": "http", "targetPort": 8080, "external": true } },
             "env": { "ConnectionStrings__db": "{db.connectionString}" },
             "annotations": { "scaling": { "min": 1, "max": 10 }, "with": { "aws.fargate": { "cpu": 512 } } } },
    "site":{ "type": "website.v1", "bind": ["api"] }
  }
}
```
- **Tokens** like `{db.connectionString}` are lazy references resolved at deploy (Aspire pattern).
- **`links`** are the wasm capability bindings ([Plan 20](./wasm-runtime-wit.md#plan-20)); **`allow`** mirrors the permission model above.
- The manifest is **content-addressed and event-sourced** (`deployment.Planned` carries it), so it's auditable/replayable ([Plan 11](./data-plane.md#plan-11)).

**Publishers (deploy targets).** Like Aspire publishers / `azd`, the manifest is rendered by pluggable backends: the default **Pulumi Automation API** adapter ([Plan 4](./control-plane.md#plan-04)), plus Crossplane (k8s), and container/wasm-host targets (SpinKube/containerd-wasm, wasmCloud lattice). The manifest decouples *what to deploy* from *how*.

**PortabilityReport ([ADR-0024](./adr/07-portability-extensibility.md#adr-0024)).** A **plan-time, event-sourced scorecard** computed from the manifest IR + the Matching result, emitted alongside `deployment.Planned` (event **`deployment.PortabilityReported`**) so "how locked-in is this Bindle?" is an auditable, replayable fact — not a manual audit. It complements `hobo doctor` (interactive warnings) with a structured per-deploy record:
- **Portability %** — the fraction of resources backed by a provider **equivalence class** with **≥2-cloud capability** (a single-provider-only resource lowers the score).
- **Lock-in sources, with severity** — provider `.with()` blocks, raw escape hatches (`.raw(driver => …)` dialect leaks, [Plan 32](./data-plane.md#plan-32)), **host-`.with()`** options ([ADR-0031](./adr/01-architecture-core.md#adr-0031)), and **paradigm mismatches** (cross-paradigm-only data features, paradigm-class-scoped per [ADR-0024 §Detect lock-in](./adr/07-portability-extensibility.md#adr-0024)/[ADR-0052](./adr/03-data-plane.md#adr-0052)).
- **Per-resource provider-equivalence-class** — the class chosen + **why other members were rejected** (reuses the rejected-candidate reasons in `match.Decided`, [ADR-0033](./adr/01-architecture-core.md#adr-0033)).
- **Upgrade readiness** — the pinned **`component-host` + `wasi:*` versions** ([ADR-0031](./adr/01-architecture-core.md#adr-0031)) and whether a host upgrade path/upcaster is available, so portability and upgradability read off one report.

Manifest interop notes: the schema (`hobo.manifest/v1`) stays interop-close to Aspire's `aspire-manifest.json`, and HoBo imports an Aspire manifest as one input format; the container/wasm-host fallback injects endpoints/connection info on the Aspire `services__<name>__<endpoint>__<i>` / `ConnectionStrings__<name>` convention.

### Configuration & secretless secrets

Apps need configuration (URLs, flags, tuning) and credentials (DB access, third-party API keys). The antipattern everyone falls into is static secrets baked into env files, images, IaC, or — worst — the event log. HoBo issues **keyless workload identities** and brokers short-lived provider tokens ([Plan 6](./ai-native-agent-auth.md#plan-06)); config and secrets ride that same path by default, and the SDK surface for loading them is built around it.

**Principles.**
1. **Secretless-first.** The best secret is no secret: a bound resource is reached via the app's **SVID → brokered short-lived token**, so there is nothing to store or leak ([ADR-0008](./adr/README.md)).
2. **References, not values.** Config/secret declarations resolve to **refs** (a pointer to a provider secret store path, a binding, or a federation trust), resolved **at use-time, per Camp**. A value never lives in the `Bindle`, the Camp config, or the event log.
3. **Secretless is the default; provider specifics are a pluggable `secrets` port adapter.** The default identity path — SVID → SVID-brokered short-lived tokens, OIDC federation — stays the default. Cloud-specific IAM, keys, and certs plug in through a **`secrets` port adapter / extension per provider** ([ADR-0027](./adr/02-identity-security.md#adr-0027)). Because a Camp is the provider-specific layer, *where* a secret/config actually comes from (Key Vault vs Secrets Manager vs Vault; which region) and *which* adapter resolves it is a Camp concern; the Bindle only declares *what it needs*. Overriding the default identity path with a cloud-native one is a Camp + extension change, not an app edit.
4. **Every access is audited; values are never telemetry.** Secret reads are `token.Used` / `secret.Accessed` events; OTel/OpenInference spans and `ctx.log` redact values ([Plan 5](./reliability-observability-cost.md#plan-05)).

**SDK surface.** Declared inline (IfC) alongside resources; read via `ctx.config`. Each item is a **varlock-style declarative schema** entry ([ADR-0027](./adr/02-identity-security.md#adr-0027)) — typed and annotation-driven, carrying its **type, required, sensitivity, and source** — so `can-deploy` can validate the config surface without ever touching values:
```ts
import { config, secretRef, env, fromBinding } from "@hobo/sdk";

export const cfg = config({
  DB:        fromBinding("db"),            // secretless: brokered client/token via the bind (Plan 13)
  STRIPE:    secretRef("stripe/api-key"),  // a real secret → resolved from the Camp's secret store at use-time
  LOG_LEVEL: env("info"),                  // non-secret typed config (per-Camp overridable)
});

export const charge = step(async (o: Order) => {
  const stripe = await ctx.config.STRIPE();   // fetched now via a brokered token; in-memory only
  // ...
});
```
- `fromBinding(name)` — **preferred**: no secret at all; the bound resource is reached with the app's SVID-brokered token (the `bind` edge already wires identity-aware connectivity, [Plan 12](./security-networking.md#plan-12)).
- `secretRef(ref)` — a genuine third-party secret; `ref` is a logical name resolved per-Camp to the provider's `secrets` port path; the value is fetched at use-time and held in memory, never persisted. *(Named `secretRef`, **not** `secret`, to avoid colliding with the catalog's `secret()` resource, which **declares a managed secret store**; `secretRef` only **reads** a value from one.)*
- `env(default)` — non-secret configuration; lives in the Camp's Deployment Set ([Plan 25](./platform-engineering.md#plan-25)) and is overridable per Camp/Delta.

**The resolution ladder (secretless-first).**
```mermaid
flowchart TD
  NEED["app needs config/secret X"] --> KIND{declared as}
  KIND -->|fromBinding| BIND["SVID -> brokered short-lived token<br/>(no secret stored)"]
  KIND -->|secretRef| FED{provider federation<br/>available?}
  KIND -->|env| CFG["non-secret value from the Camp's Deployment Set"]
  FED -->|yes| STS["broker token -> read from provider secret store at use-time<br/>(Key Vault / Secrets Manager / Vault)"]
  FED -->|no| ESCAPE["bounded static-secret escape hatch<br/>(TTL + rotation + audited + opt-in, ADR-0023)"]
  BIND --> AUDIT["token.Used / secret.Accessed event; value never logged"]
  STS --> AUDIT
  ESCAPE --> AUDIT
```
1. **Bound resource** → SVID-brokered token (zero stored secret). Default for `data`/`queue`/`bucket`/etc.
2. **Secret with provider federation** → broker a scoped token, read the value from the provider's secret store at use-time.
3. **Non-secret config** → typed value from the Camp's Deployment Set (no broker needed).
4. **Static-secret escape hatch** → only when a provider offers no federation/secret-store path. **Bounded, concretely:** max TTL **≤ 7 days** (default; per-Camp tunable down), **rotation enforced** (a key past TTL fails closed with a typed `SecretExpiredError`, it does not hang), **every fetch audited** (not just grant/revoke), and **in-process cache bounded** (short TTL; each cache miss re-audits) — explicit opt-in ([ADR-0023](./adr/02-identity-security.md#adr-0023)). `hobo doctor` warns when this path is used where federation exists ([Plan 7](./developer-experience.md#plan-07), FR-014).

**Per-Camp binding (where values actually come from).** The Bindle declares *needs*; each Camp supplies the *source* (provider-specific), e.g.:
```ts
// camp("prod-aws") — provider mapping (no separate config file)
camp("prod-aws").config({
  STRIPE: fromSecretStore("aws:secretsmanager", "prod/stripe"),   // resolved via brokered token
  LOG_LEVEL: "warn",
});
```
The same Bindle on `prod-azure` resolves `STRIPE` from Key Vault — **no app-code change** (the portability promise, [ADR-0024](./adr/07-portability-extensibility.md#adr-0024)). Resolution decisions are recorded as `config.Resolved` (ref → source **+ Camp**, never the value).

**Multi-Camp drift.** Because each Camp sources secrets independently, the *same logical secret* can diverge across Camps (rotated in AWS, stale in Azure). HoBo does **not** sync secret values (it never holds them), but `hobo doctor` / `hobo verify` compare resolved **refs across an environment group** and warn on a key that is missing or maps inconsistently; `config.Resolved` (ref + Camp) makes drift inspectable in the audit log. Value correctness remains the secret-store owner's responsibility.

**Events & audit.**
- `config.Resolved` — a declared key bound to a source (binding / secret-store path / federation trust); carries the *ref* + Camp, never the value.
- `secret.Accessed` — a use-time fetch, joined to the run/agent + the brokered `token.Used` (the [CredentialAudit](./data-plane.md#plan-11) projection answers "who read which secret, when, with which token"). `secret.Unavailable` — a failed fetch (store down / denied).
- **Redaction is at capture time, not export.** Values are scrubbed **before** a span/event is stored — so a secret never lands in the event log, OTel/OpenInference spans, error messages, or **training trajectories** ([Plan 23](./generated-stack.md#plan-23): a `"use training"` method that calls `ctx.config.STRIPE()` must not leak the value into its trajectory). Values that must transit a step's I/O are per-run encrypted.

**Local development (`hobo dev`).** The local Camp (`runtime-local`) has no cloud secret store, so `secretRef` resolves against a **dev-only** source, in order: (1) a gitignored **`.env.local`**, (2) the OS keychain, (3) an interactive prompt (skipped in CI; CI uses `.env.local` or stubbed providers). Dev secrets are **clearly marked non-production**, audited as `secret.Accessed { camp: "local", source: "dev" }`, and never satisfy a production `can-deploy`. Tests prefer `stub()`ed providers ([Plan 23](./generated-stack.md#plan-23)) so unit runs need no real secret at all.

**Availability & failure modes.** If a Camp's secret store is unreachable, `secretRef` resolution **fails fast after a bounded retry** (a small capped-backoff budget), emits `secret.Unavailable`, and surfaces a typed error the step can handle — it does **not** silently fall back to a static value. A short, bounded in-process cache (above) may serve a recently-fetched value within its TTL; beyond that, the call fails rather than serve stale/unknown credentials. Treat secret-store availability as a dependency in the SLO budget ([Plan 5](./reliability-observability-cost.md#plan-05)).

**App-facing crypto (keys the app never holds).** The secretless model extends to **cryptography**: a `crypto(name)` resource (`hobo:crypto` port, above / [Plan 20](./wasm-runtime-wit.md#plan-20)) offers `encrypt`/`decrypt` (envelope) + `sign`/`verify` where the **key material never enters app code** — the app holds a brokered key *handle* (via Identity, [Plan 6](./ai-native-agent-auth.md#plan-06)), and the operation runs against a per-Camp **KMS / Key Vault / Cloud KMS / in-boundary HSM** behind the port (air-gap: in-boundary KMS, [ADR-0027](./adr/02-identity-security.md#adr-0027)/[ADR-0036](./adr/07-portability-extensibility.md#adr-0036)). Same secretless guarantee as tokens: nothing key-shaped at rest in the app. (Closes the Dapr-crypto parity item, [gap-analysis G9](../../competitors/gap-analysis.md).)

**Why this is safe.**
- **Nothing to steal by default** — the common case (bound resources) uses brokered tokens, so there is no secret at rest ([ADR-0008](./adr/README.md)).
- **Blast radius is bounded** — tokens are short-lived + resource-scoped; the static fallback is TTL'd, rotated, and audited ([ADR-0023](./adr/02-identity-security.md#adr-0023)).
- **Portable** — the Bindle declares needs, the Camp supplies sources; swapping clouds is a Camp change, never an app edit.

Config notes: fetched secrets are held in a short, bounded in-process cache (TTL above) and each cache miss re-audits; non-secret config supports live reload, pushed from the Camp's Deployment Set; each provider's `secrets` port adapter resolves per-Camp sourcing, and providers without a native secrets port use a shim adapter behind the same port.

### The Hobo Code DSL (configuration + code, one surface)

> **One surface for config *and* code, with two entry levels.** Hobo Code is HoBo's human-readable DSL that declares **Yards, Camps, Bindles** and their resources/wiring **and** the workflow/step/agent behavior that runs in them — built to be **optimal for AI generation, training, and optimization** as well as human authoring. The programmable surface is **WIT/WASM**; any Component-Model language can author Bindles and providers, and TypeScript is just the **first reference implementation** ([ADR-0069](./adr/01-architecture-core.md#adr-0069)). Hobo Code is a *sibling* authoring front-end alongside that TypeScript reference: both lower to the same **Manifest IR** (above) + runtime constructs ([ADR-0049](./adr/01-architecture-core.md#adr-0049)).

**Two-level authoring model.** Authors enter at whichever level fits; both compile to the same artifacts ([ADR-0049](./adr/01-architecture-core.md#adr-0049)).
- **Level 1 — declarative DSL/config, no code.** A first-class no-code entry point: the small, regular declarative surface declares **scope/topology** (`Yard`/`Camp`/`Bindle` + resources + `.allow()` + `bind` wiring) and **behavior shape** (`workflow`/`step`/`actor`/`saga`/`agent`, `"use query"`/`"use training"` methods) **without writing code**. The same declarative path drives **init, spec, and code-generation** — declarations alone produce a deployable Bindle.
- **Level 2 — generated SDK code stubs (intermediary artifacts).** The DSL **generates typed `service`/`workflow`/`step`/`actor` stubs** with `.allow()` pre-wired and the `bind` graph stitched. Stubs are the seam where hand-written code lands: the author fills the bodies while the declarative source stays authoritative for topology.

**Flow: declarative DSL/config → generated SDK stubs → code.** The no-code declarative path is the front door; it emits SDK stubs, and developers extend the stubs with behavior. A pure no-code stack is valid end-to-end; a code-heavy stack starts from the same declarations and grows.

Ties to the rest of the model:
- **Stubs via codegen** ([ADR-0037](./adr/01-architecture-core.md#adr-0037)) — the same deterministic, checked-in `_generated/` discipline and `--check` drift gate, so DSL → stub output is reviewable and reproducible.
- **Placement via deterministic Matching** ([ADR-0033](./adr/01-architecture-core.md#adr-0033)) — the DSL declares the resource graph; Matching resolves it to Camps.
- **Both levels lower to the one Manifest IR** (above) — no new runtime semantics; the scope model is `Yard ⊃ Camp ⊃ Bindle` ([ADR-0026](./adr/01-architecture-core.md#adr-0026)).

**Why a DSL.** HoBo is **AI-native** ([Plan 6](./ai-native-agent-auth.md#plan-06)): agents and the generation pipeline generate, repair, and optimize HoBo artifacts (the generation pipeline, [Plan 23](./generated-stack.md#plan-23); `"use training"`, [Plan 23](./generated-stack.md#plan-23)). TypeScript + IfC ([Plan 2](./sdk-api.md#plan-02)) is ideal for humans with an editor and a type-checker but a noisy generation/training target: large grammar, host imports, collection-time side-effects, an AST that is hard to diff/score. Hobo Code is **small, regular, declarative-first, and low-ambiguity** — exactly what makes a surface cheap to generate correctly, cheap to *train on*, and cheap to *optimize* against a reward signal. It also forces no author through code when a declaration would do (Level 1).

**Design properties.**
- **Small, regular grammar** with a **stable, canonical AST** — one obvious way to express a thing, so generated programs are diffable and scoreable.
- **Declarative-first + deterministic** — no host imports or collection-time side-effects; the same source always lowers to the same IR (replay-safe, [Plan 11](./data-plane.md#plan-11)).
- **Schema-aware & self-describing** — the grammar carries enough structure that a model (and a linter) can complete/repair it locally; errors are machine-actionable (like `deployment.PlanRejected`).
- **Token-efficient** — terse but readable, so generation/training context stays small.
- **Round-trippable with TypeScript** — TS↔Hobo Code is mechanically convertible (both are views over the same IR/AST), so teams mix surfaces and the generation pipeline emits either.

**Where it sits (front-end over the shared IR).**
```mermaid
flowchart LR
  subgraph FE["Authoring front-ends"]
    TS["TypeScript SDK + IfC<br/>(Plan 2 / Plan 21)"]
    HC["Hobo Code DSL<br/>(L1 declarative + L2 stubs)"]
  end
  HC --> STUB["generated SDK stubs<br/>(codegen, ADR-0037)"]
  STUB --> AST["canonical AST"]
  TS --> AST
  AST --> IR["Manifest IR<br/>(Plan 21)"]
  IR --> PLAN["Planner / Matching<br/>(Plan 25 / ADR-0033)"]
  PLAN --> DEPLOY["Deploy to Yards / Camps"]
  FORGE["generation pipeline + training-engine<br/>(Plan 33 / Plan 23)"] -.generate / optimize.-> HC
  IR -.codegen types.-> TS
```

Relationship to existing concepts:
- **TypeScript SDK ([Plan 2](./sdk-api.md#plan-02))** — the **first reference implementation** of the WIT/WASM authoring surface, not a required language ([ADR-0069](./adr/01-architecture-core.md#adr-0069)); a peer front-end with identical semantics, different ergonomics, and any Component-Model language can stand beside it. Codegen ([ADR-0037](./adr/01-architecture-core.md#adr-0037)) and conformance ([Plan 9](./generated-stack.md#plan-09)) apply to both.
- **The generation pipeline, the Crew & `"use training"` ([Plan 23](./generated-stack.md#plan-23)/[Plan 40](./operators-sre.md#plan-40)/[Plan 23](./generated-stack.md#plan-23))** — the primary *consumers/producers* of Hobo Code: it is the **token-efficient IR for codegen + platform config** that the generated stack ([Plan 23](./generated-stack.md#plan-23)) emits and the **Platform Engineer operator** ([Plan 40](./operators-sre.md#plan-40)) authors. A compact, regular, low-ambiguity target is what makes generation/repair/optimization tractable and cheap in tokens.
- **Capability Manifest ([Plan 6](./ai-native-agent-auth.md#plan-06))** — a distinct artifact, not to be confused with this DSL: it is the machine-readable auth+capability standard (`/.well-known/capability-manifest/`, WIT `hobo:capability-manifest`).
- **Data plane / projections ([Plan 32](./data-plane.md#plan-32))** — a target for Hobo Code's config half: declaring **projections + schema mappings** (and the WIT-record domain schema, [ADR-0051](./adr/03-data-plane.md#adr-0051)) is exactly the kind of regular, declarative surface the DSL is for.

DSL notes: the config half (Yards/Camps/Bindles + resources + `.allow()` + wiring) and the embedded-code half (workflow/step bodies, compiled to wasm components, [Plan 20](./wasm-runtime-wit.md#plan-20)) are both first-class; the toolchain is a parser, canonicalizing formatter, LSP, and the TS↔Hobo Code transpiler, with the AST as the canonical artifact surfaced as text; the training/optimization interface scores and mutates a generated program's AST via the `training-engine` ([ADR-0025](./adr/03-data-plane.md#adr-0025)); grammar evolution is versioned and existing Bindles migrate via the shared IR + transpiler.
