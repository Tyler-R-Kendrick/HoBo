# Plan 21 — Resource catalog & the `.allow()` model (Nitric parity)

> Part of the [HoBo Design Plan Suite](./README.md). Brings full **Nitric resource parity** into HoBo, each resource mapped to a **WIT port** ([Plan 20](./20-wasm-wasi-runtime.md)) with the inline `.allow()` capability-permission model. See the competitor capture in [`competitors/nitric/resources.md`](../../competitors/nitric/resources.md).

> **Contracts & policy (gates):** an `.allow()` declaration is also a **capability contract** ([Plan 29](./29-contracts-compatibility.md)) — the **required** scope must be ⊆ the **granted** scope on the resolved provider; a mismatch is a contract failure caught by `can-deploy`, not a runtime surprise.

## The `.allow()` model — one declaration, three effects
HoBo adopts Nitric's inline permission model and extends it. Declaring a permission on a resource drives **three** things at once:
1. **Least-privilege IAM** — the IaC adapter generates the minimal cloud policy ([Plan 3](./03-providers-iac.md)).
2. **WASM capability grant (link)** — the component is linked to *only* the provider interfaces its permissions require; everything else is denied by the wasm host ([Plan 20](./20-wasm-wasi-runtime.md)).
3. **Agent token scope** — the broker issues scoped tokens bounded to exactly these `(resource, verbs)` ([Plan 6](./06-ai-native-agent-auth.md)).

```ts
// IfC-default authoring: resources declared inline, permissions co-located
import { bucket, kv, topic } from "@hobo/sdk";

const profiles = bucket("profiles").allow("read", "write");   // → S3 RW IAM + wasi:blobstore link + token scope
const sessions = kv("sessions").allow("get", "set");          // → wasi:keyvalue (get/set only)
const events   = topic("user-created").allow("publish");      // → wasi:messaging (publish only)
```
Permissions are **deny-by-default**: omit a verb and neither IAM, link, nor token grants it. This unifies Nitric's IAM story with wasm capability security and HoBo's agent auth.

## Catalog (full parity) — resource → WIT port → permission verbs
| Resource | `@hobo/sdk` | WIT port | `.allow()` verbs | Equivalence (AWS/Azure/GCP/CF) |
|---|---|---|---|---|
| **API / HTTP** | `api(name)` | `wasi:http` (+ `hobo:http`) | route-level security | API GW+Lambda / Container Apps / Cloud Run / Workers |
| **KV** | `kv(name)` | `wasi:keyvalue` | `get`,`set`,`delete` | DynamoDB / Cosmos / Firestore / KV |
| **Bucket** | `bucket(name)` | `wasi:blobstore` (+ `hobo:blob-events`) | `read`,`write`,`delete` | S3 / Blob / GCS / R2 |
| **Queue** (pull) | `queue(name)` | `hobo:queue` | `enqueue`,`dequeue` | SQS / Service Bus / Tasks / Queues |
| **Topic** (push) | `topic(name)` | `wasi:messaging` | `publish`,`subscribe` | SNS / Event Grid / Pub/Sub / — |
| **Secret** | `secret(name)` | `wasi:config`/`hobo:secrets` | `put`,`access` | Secrets Mgr / Key Vault / Secret Mgr |
| **SQL** | `sql(name)` | `wasi:sql`/`hobo:sql` | (conn string) | RDS / Azure DB / Cloud SQL / Neon |
| **Schedule** | `schedule(name)` | `hobo:scheduler` | n/a | EventBridge / Timer / Cloud Scheduler |
| **WebSocket** | `websocket(name)` | `hobo:websocket` | n/a | API GW WS / Web PubSub / — |
| **Batch job** | `job(name)` | `hobo:job` (+ `vm`/`microVm`) | `submit` | AWS Batch / Azure Batch / Cloud Batch |
| **Website** | `web(name)` | static + `wasi:http` | n/a | CloudFront+S3 / Front Door+Blob / CDN+GCS |
| **Compute/service** | `service(name)` | component (exports `wasi:http`) | (binds below) | Fargate / Container Apps / Cloud Run / Workers |
| **Search** | `search(name)` | `hobo:search` | `index`,`query`,`admin` | pgvector+PG-FTS / OpenSearch / Azure AI Search / Pinecone ([Plan 35](./35-search-vector-surface.md)) |
| **Embed** | `embed(name)` | `hobo:embed` | `embed` | local model / hosted embedding API (used via `search`; [Plan 35](./35-search-vector-surface.md)) |
| **Domain** | `domain(name)` | `hobo:dns` (+ `gateway`) | `bind`,`route` | Yard-level; ACME DNS-01 certs; failover/weighted/latency across Camps ([ADR-0035](./adr/ADR-0035-custom-domains-and-multi-cloud-ingress.md)) |
| **DNS** | (capability) | `hobo:dns` | `read`,`write` | Route53 / Azure DNS / Cloud DNS / Cloudflare ([Plan 13](./13-networking-connectivity.md)) |
| **Feature flag** | `flag(name)` | `hobo:feature-flag` | `eval`,`change` | built-in store / OpenFeature providers (flagd/LaunchDarkly) ([Plan 37](./37-feature-flags-progressive-delivery.md)) |
| **Auth** (end-user) | `auth(name)` | `hobo:auth` | (verify/session) | federate+verify any IdP (Google/GitHub/Clerk/Auth0/customJwt) + thin dev built-in ([Plan 36](./36-end-user-auth.md)) |
| **Crypto** | `crypto(name)` | `hobo:crypto` | `encrypt`,`decrypt`,`sign`,`verify` | KMS / Key Vault / Cloud KMS / in-boundary HSM — **keys the app never holds**, brokered like secrets ([Plan 31](./31-config-secretless-secrets.md)) |
| **Email / SMS / Push / Webhook-out** | `email`/`sms`/`push`/`webhookOut(name)` | `hobo:notify` | `send` | SES/SendGrid · Twilio/SNS · FCM/APNs · signed HTTP — a thin **cloud-messaging port** (typed templates, PrincipalRef recipients, policy-gated), shares the ops receiver port ([ADR-0059](./adr/ADR-0059-app-communications-notify.md)) |
| **Guardrail** | `guardrail(name)` | `hobo:guardrail` | `check` | built-in rules / Llama Guard / hosted moderation / local — **AI output safety** (moderation/PII/jailbreak/grounding) as a policy-gated step ([Plan 47](./47-ai-safety-model-governance.md)/[ADR-0061](./adr/ADR-0061-ai-safety-model-governance.md)) |

Cross-cloud equivalence classes are owned by [Plan 3](./03-providers-iac.md); this table is the resource→port view.

> **Data resources vs the data plane.** For an app's **domain data**, the default path is **not** raw `ctx.bindings.db` access — it's the event-sourced **command → aggregate → projection** model ([Plan 39](./39-data-plane-projections.md)/[ADR-0050](./adr/ADR-0050-event-sourced-domain-data-projection-sinks.md)). The `sql`/`kv`/`bucket`/`search` resources here are then **how a projection *sink* is realized** (a data architect maps a read model onto one via Matching), plus the **escape hatch** for direct access and the home of **adopted authoritative-external** stores ([ADR-0041](./adr/ADR-0041-migration-onboarding.md)). They remain first-class resources; what changed is that domain reads/writes go through `command`/`repo`/`view`, not hand-written queries by default.

## IfC-default authoring (resources emerge from code)
The **default** authoring mode is Nitric-style: declare resources inline and `.allow()` what you use; HoBo's deploy pipeline runs each component in **resource-collection mode** to capture declarations into the **manifest IR** ([Plan 22](./22-wiring-manifest.md)). Handlers attach to resources directly:
```ts
import { api, kv } from "@hobo/sdk";
const todos = kv("todos").allow("get", "set");
const app = api("main");
app.get("/todos/:id", async (ctx) => ctx.json(await todos.get(ctx.params.id)));
app.post("/todos",    async (ctx) => { await todos.set(crypto.randomUUID(), await ctx.json()); });
```
The explicit `bindle()` topology ([Plan 2](./02-sdk-api.md)) remains available as the **advanced/escape-hatch** mode when you want to declare the graph by hand or do things collection can't infer.

## Handlers, events & triggers (parity with Nitric "services")
Each entry point compiles to a component exporting the right WIT interface:
- HTTP routes → `wasi:http/incoming-handler`.
- `topic.subscribe`, `bucket.on('write', …)`, `schedule.cron(…)`, `queue` workers, `websocket.on(…)`, `job.handler(…)` → host triggers that invoke the component. These also flow through HoBo's durable runtime ([Plan 2](./02-sdk-api.md)) so a subscriber can be a workflow/saga with replay + compensation — a capability Nitric lacks.

## Iteration hooks
- `hobo:blob-events` / `hobo:websocket` WIT shapes (no standard `wasi:*` yet).
- ~~SQL migrations workflow~~ — **specified in [Plan 34](./34-app-data-migrations.md)** ([ADR-0032](./adr/ADR-0032-data-portability-schema-versioning.md)): declarative desired-schema + auto-diff (raw `.up.sql`-style steps as an escape hatch), gated **expand/backfill/contract** apply + snapshot rollback, and cross-cloud move within an equivalence class.
- Whether `.allow()` verbs are per-resource-type enums (typed) and how they map to each provider's IAM actions.
- Collection fidelity for non-TS languages (run-to-collect vs static analysis).
