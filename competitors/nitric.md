# Nitric — Competitor Reference

> Captured for HoBo competitive analysis. Source: nitric.io/docs, github.com/nitrictech (as researched). This folder documents **Nitric's** offering faithfully; the HoBo↔Nitric mapping/parity tracker is in [`hobo-mapping.md`](#hobo-mapping).
>
> Files: [resources.md](#resources) · [providers.md](#providers) · [cli-workflow.md](#cli-workflow) · [security-iam.md](#security-iam) · [differentiators.md](#differentiators) · [hobo-mapping.md](#hobo-mapping)

## Positioning & pitch
- **Tagline:** *"Build cloud backends that run anywhere, fast."*
- **Paradigm:** **Infrastructure from Code (IfC)** — you declare the cloud resources your app needs *inline in application code*; Nitric infers and provisions the infrastructure (and least-privilege IAM) automatically.
- **Mental model:** "Developer In" (start from "what workflow does the developer need?") vs traditional IaC's "System Out" (start from "what can the platform do?").
- **Promise:** one codebase deploys to AWS, GCP, Azure, Kubernetes, or a single server — even multiple clouds at once — with no code changes.
- **Target user:** backend developers building serverless/cloud apps who want multi-cloud portability and dev velocity over cloud-specific control.

## How it works (architecture)
```
App code (with inline resource declarations + .allow())
  → Nitric SDK (Node / Python / Go / Dart)
  → Nitric Runtime ("the Membrane", gRPC)
  → Provider plugin (Pulumi- or Terraform-based; deploy + runtime layers)
  → AWS / GCP / Azure / Kubernetes / server
```
- **Services vs Resources.** *Services* are containerized entry points to your code (API handlers, schedule handlers, subscribers, websocket handlers, batch handlers, websites) — each becomes an independently scaling container. *Resources* are the building blocks services use (apis, kv, buckets, queues, topics, secrets, sql, schedules, websockets, jobs, websites).
- **Resource collection.** On `nitric up`, each service is run in a special **resource-collection mode**: SDK calls that declare resources are *captured but not executed*, producing a resource/dependency graph the provider plugin turns into IaC.
- **The Membrane.** A gRPC runtime that sits between app code and the provider runtime, exposing service contracts (document/kv, storage, queue, topic, secret, sql). SDKs are thin gRPC clients generated from proto contracts (`github.com/nitrictech/contracts`).
- **Permissions.** Declared inline via `.allow(...)`; Nitric generates **least-privilege IAM** per cloud automatically.

## At-a-glance feature list (each detailed in sibling files)
- Full resource catalog (api, kv, bucket, queue, topic, secret, sql, schedule, websocket, job/batch, website) — see [resources.md](#resources).
- Inline `.allow()` capability-permission model → auto least-privilege IAM — see [security-iam.md](#security-iam).
- Multi-cloud providers (AWS/GCP/Azure) over **Pulumi or Terraform**, swappable via stack config; **custom providers** (extend or build new) with deploy + runtime layers — see [providers.md](#providers).
- Multi-language SDKs over gRPC (Node, Python, Go, Dart; experimental .NET/JVM) — see [providers.md](#providers).
- Local dev: `nitric start` (emulation + dashboard) / `nitric run` (containers); rich local dashboard — see [cli-workflow.md](#cli-workflow).
- Stack files for per-target/per-env config; `.env`/secrets integration.
- Escape hatches: direct cloud SDK access; provider extension; custom providers.
- Commercial: **Nitric Deploy** (formerly "Suga") — managed deploys, visual infra, observability.

## Known limitations (as researched)
- SQL databases in **preview** (hourly pricing, not serverless); enable via config.
- Custom domains **AWS-only** currently.
- Security rules (OIDC) **not enforced locally** — only when deployed.
- Bounded to abstracted services; anything else needs the cloud SDK directly (some coupling).
- Custom-provider development requires Go.

## cli-workflow

**Nitric — CLI, Local Dev & Workflow**

> Part of the [Nitric competitor reference](nitric.md).

### Install
```bash
brew install nitrictech/tap/nitric   # macOS; Scoop on Windows; binaries otherwise
```

### Core commands
```bash
nitric new [project]        # scaffold from template
nitric stack new            # create a stack (deploy target) file
nitric start                # local: emulate resources + dashboard (hot reload)
nitric run                  # local: build & run each service in Docker (prod-like)
nitric build                # build containers, no deploy
nitric spec                 # print the collected resource specification
nitric up   [-s stack]      # build → collect resources → deploy
nitric down [-s stack]      # tear down (confirm)
nitric stack list | new
nitric version | help | debug | completion
# --ci flag: no styling, auto-confirm
```

### Local development experience
- **`nitric start`** runs the local Nitric server (membrane), launches each service via its `start` command from `nitric.yaml`, hosts APIs on dynamic ports, hot-reloads on change, and opens the **Local Dashboard** (default `http://localhost:49152`).
- **`nitric run`** containerizes each service (one container per service) for a production-like local run.

### Local Dashboard features
- Architecture visualization (services + resources)
- HTTP client to test APIs
- Batch job observation + manual triggers
- SQL DB viewer + query runner
- Schedule trigger buttons
- Bucket file management
- Topic message publish + inspect
- Secret management
- WebSocket connection debugging
- Website preview

### Typical loop
1. `nitric start` → iterate → test locally (note: **OIDC/security rules are NOT enforced locally**).
2. `nitric stack new` → choose provider/region/credentials.
3. `nitric up -s <stack>` → build, collect, deploy; URLs returned.
4. Iterate; re-run `nitric up`. **5.** `nitric down -s <stack>` to remove.

### Testing strategy (as documented)
- **Unit:** separate resources from handlers; mock resources (`jest.spyOn`); test handlers in isolation.
- **Integration:** `nitric start` + an HTTP client (e.g. supertest) against local APIs; verify side effects.
- **Cloud:** deploy a stack; point the same tests at deployed URLs (`process.env.API_URL`).

## providers

**Nitric — Provider Model, Runtime Contract & SDKs**

> How Nitric maps resources to clouds, the gRPC runtime "membrane", custom providers, and language SDKs. Part of the [Nitric competitor reference](nitric.md).

### Provider architecture (two layers)
A Nitric **provider** is a single compiled binary implementing two layers:

1. **Deployment layer** (Go) — translates the collected resource spec into cloud infra using **Pulumi** or **Terraform (CDKTF)**. Interface (illustrative):
   ```go
   type NitricPulumiProvider interface {
     Init(ctx *pulumi.Context) error
     Pre() error
     Config() map[string]interface{}
     Order() []string
     Api(...) error;  Bucket(...) error;  Service(...) error
     Topic(...) error; Queue(...) error;  /* ... per resource ... */
     Result() error
   }
   ```
2. **Runtime layer** (gRPC) — implements Nitric's proto service contracts; executes at runtime, translating SDK calls into cloud API calls.

### Pre-built providers
- **Pulumi-based** (direct deploy): `aws`, `gcp`, `azure`.
- **Terraform-based** (emit CDKTF to `cdktf.out/` for review): `aws`, `gcp`, `azure`.
- Selected/swapped purely in **stack config** (`provider: aws`), no code change.

### Custom providers (extensibility)
Two paths:
1. **Extend** an existing provider — replace a resource's implementation (e.g. S3 → DigitalOcean Spaces via S3-compatible API), add pre/post hooks, inject config. Reference as `provider: custom/extension@0.0.1`.
2. **Build new** — for other clouds (DigitalOcean, Linode…), on-prem, Kubernetes, or specialized needs.

Project structure & install:
```
provider-repo/
  cmd/deploy/   cmd/runtime/   deploy/   runtime/   Makefile   main.go
# compiled to a single binary placed at:
~/.nitric/providers/custom/<name>@<version>
```

### The runtime contract ("the Membrane", gRPC + protobuf)
SDKs are thin gRPC clients of the runtime. Contracts live in `github.com/nitrictech/contracts`. Representative services/ops:
- **Document/KV:** `Get`, `Set`, `Delete`, `Query`
- **Storage:** `Read`, `Write`, `Delete`, `ListFiles`, `DownloadUrl`, `UploadUrl`
- **Queue:** `Enqueue`, `Dequeue`, `Complete`
- **Topic:** `Publish`, `Subscribe`
- **Secrets:** `Put`, `Access`, `AccessVersion`
- **SQL:** `ConnectionString`
This proto boundary is what makes the SDKs language-agnostic and the providers swappable.

### Deployment flow (`nitric up`)
1. **Build** — each service → container image (autodetected runtime, standard or custom Dockerfile).
2. **Resource collection** — run each service in collection mode; capture (don't execute) all resource/`.allow()` declarations → resource spec/graph.
3. **Provider invocation** — pass spec to the provider plugin; Pulumi deploys directly, Terraform emits CDKTF.
4. **Deploy** — infra created/updated; **5. Output** — URLs/endpoints returned.

### Language SDKs (over gRPC)
| Language | Status | Package |
|---|---|---|
| Node.js | Full | `@nitric/sdk` |
| Python | Full | `nitric` |
| Go | Full | `github.com/nitrictech/go-sdk` |
| Dart | Experimental | `nitric` |
| C#/.NET, JVM | v0 / legacy | `nitrictech/dotnet-sdk`, `nitrictech/jvm-sdk` |

Each SDK = resource constructors + `.allow()` + handler registration + a gRPC client generated from the proto contracts.

### Configuration
- **`nitric.yaml`** (project): `services` (match glob, runtime, start cmd), `batch-services`, `websites`, custom `runtimes` (Dockerfile/context/args).
- **Stack files** `nitric.<stack>.yaml` (per target/env): `provider`, `region`, provider-specific config (profile/project/subscription). One per environment; swappable.
- **`.env`/secrets** included at deploy; in-code via env vars or `secret()`.

## resources

**Nitric — Resource Catalog (complete)**

> Every Nitric resource/primitive, its SDK surface, permission verbs, and cloud mappings. Snippets are Node `@nitric/sdk`. Part of the [Nitric competitor reference](nitric.md).

### Summary table
| Resource | Declaration | `.allow()` verbs | AWS | GCP | Azure |
|---|---|---|---|---|---|
| **API** (HTTP) | `api('name')` | (route-level security) | API Gateway + Lambda | Cloud Run | Container Apps |
| **KV store** | `kv('name')` | `get`,`set`,`delete` | DynamoDB | Firestore | Cosmos DB / Table |
| **Bucket** | `bucket('name')` | `read`,`write`,`delete` | S3 | Cloud Storage | Blob Storage |
| **Queue** (pull) | `queue('name')` | `enqueue`,`dequeue` | SQS | Cloud Tasks | Service Bus Queue |
| **Topic** (push) | `topic('name')` | `publish`,`subscribe` | SNS / EventBridge | Pub/Sub | Event Grid / SB Topic |
| **Secret** | `secret('name')` | `put`,`access` | Secrets Manager | Secret Manager | Key Vault |
| **SQL** (preview) | `sql('name')` | (connection string) | RDS Postgres | Cloud SQL PG | Azure DB for PG |
| **Schedule** | `schedule('name')` | n/a | EventBridge | Cloud Scheduler | Timer Trigger |
| **WebSocket** | `websocket('name')` | n/a | API GW WebSocket | Firestore+PubSub | Web PubSub |
| **Batch job** | `job('name')` | `submit` | AWS Batch | Cloud Batch | Azure Batch |
| **Website** | `websites:` (yaml) | n/a | CloudFront + S3 | Cloud Storage + CDN | Front Door + Blob |

### API
```javascript
import { api } from '@nitric/sdk'
const myApi = api('main')
myApi.get('/users/:id', async (ctx) => { ctx.res.json({ id: ctx.req.params.id }) })
// methods: get/post/put/delete/patch/options/head/all; middleware via myApi.use(fn)
// ctx.req: params, query, headers, json(), text(), body ; ctx.res: status, headers, json(), text(), send()
```
Route security via OIDC rules (see [security-iam.md](#security-iam)).

### Key-Value store
```javascript
import { kv } from '@nitric/sdk'
const countries = kv('countries').allow('get','set','delete')
await countries.set('USA', { population: 330_000_000 })
const c = await countries.get('USA')
await countries.delete('USA')
for await (const key of countries.keys('US')) { /* prefix scan */ }
```

### Bucket (storage)
```javascript
import { bucket } from '@nitric/sdk'
const profiles = bucket('profiles').allow('read','write','delete')
await profiles.file('u/john.png').write(bytes)         // max 4MB direct write
const b = await profiles.file('u/john.png').read()
const url = await profiles.file('u/john.png').getDownloadUrl({ expiry: 3600 })  // presigned
profiles.on('write', '/u', async (ctx) => { /* bucket notification */ })
```

### Queue (pull-based)
```javascript
import { queue } from '@nitric/sdk'
const q = queue('transactions').allow('enqueue','dequeue')
await q.enqueue({ amount: 100 })                  // single or array (batch)
const tasks = await q.dequeue(10)
for (const t of tasks) { /* t.payload */ await t.complete() }
```

### Topic (push-based pub/sub)
```javascript
import { topic } from '@nitric/sdk'
const created = topic('user-created').allow('publish')
await created.publish({ email })
created.subscribe(async (ctx) => { /* ctx.req.json() */ })   // at-least-once, may duplicate
```

### Secret
```javascript
import { secret } from '@nitric/sdk'
const apiKey = secret('api-key').allow('put','access')
const v = await apiKey.put('value')                // versioned
const value = (await apiKey.latest().access()).asString()
```

### SQL (preview)
```javascript
import { sql } from '@nitric/sdk'
const db = sql('app')
const conn = await db.connectionString()           // use with pg/SQLAlchemy/etc.
// migrations/<db>/<version>_<name>.up.sql auto-applied; or dockerfile:// for complex
```

### Schedule
```javascript
import { schedule } from '@nitric/sdk'
schedule('daily').every('24 hours', async () => {})
schedule('cleanup').cron('0 1 1 * *', async () => {})    // 5-field cron; per-stack timezone (AWS/GCP)
```

### WebSocket
```javascript
import { websocket } from '@nitric/sdk'
const chat = websocket('chat')
chat.on('connect', async (ctx) => { /* ctx.req.connectionId */ })
chat.on('message', async (ctx) => { await chat.send(ctx.req.connectionId, { reply: 'hi' }) })
chat.on('disconnect', async (ctx) => {})
// typically paired with a kv() to track connections for broadcast
```

### Batch / Job (AI/ML/HPC)
```javascript
import { job } from '@nitric/sdk'
const analyze = job('analyze')
analyze.handler(async (ctx) => { /* heavy compute */ }, { cpus: 4, memory: 16384, gpus: 1 })
// submit from a service:
const submit = job('analyze').allow('submit'); await submit.submit({ imageUrl })
```

### Website (static)
```yaml
# nitric.yaml
websites:
  - basedir: ./dist
    path: /
    index: index.html
    build: { command: npm run build, dir: dist }
    dev:   { command: npm run dev, url: http://localhost:5173 }
```

## security-iam

**Nitric — Security & IAM**

> Part of the [Nitric competitor reference](nitric.md).

### Inline permissions → least-privilege IAM
Permissions are declared at the point of use via `.allow(...)`:
```javascript
const data   = bucket('data').allow('read','write')
const tasks  = queue('tasks').allow('enqueue')
const apiKey = secret('api-key').allow('access')
```
From these, Nitric generates **least-privilege** policies per cloud automatically:
- **AWS:** IAM roles + policies
- **GCP:** IAM bindings
- **Azure:** role assignments

No manual IAM authoring; access is explicit in code, eliminating overly broad grants. This is one of Nitric's headline differentiators vs raw IaC.

### API authentication (OIDC)
```javascript
const rule = oidcRule({
  name: 'default',
  audiences: ['https://myapp.example.com'],
  issuer: 'https://auth-provider.example.com',
})
const secure = api('main', { security: [rule()] })
secure.get('/protected', securityRule('default'), async (ctx) => { /* authenticated */ })
```
Works with OIDC-compatible providers (Auth0, Cognito, FusionAuth, …).

### Custom auth middleware
```javascript
async function validateApiKey(ctx, next) {
  if (ctx.req.headers['x-api-key'] !== process.env.API_KEY) { ctx.res.status = 401; return ctx }
  return await next(ctx)
}
api('main').use(validateApiKey)
```

### Notable limitation
Security rules are **not enforced in local dev** (`nitric start`) — you must deploy to a cloud to test them.

## differentiators

**Nitric — Differentiators, Comparisons & Gaps**

> Part of the [Nitric competitor reference](nitric.md). What's genuinely novel, how Nitric frames itself vs others, and where it falls short.

### Headline differentiators
1. **Infrastructure from Code (IfC)** — resources declared inline where used; no separate IaC files; resource graph inferred by running code in collection mode.
2. **Automatic least-privilege IAM** from `.allow()` declarations.
3. **True multi-cloud portability** — one codebase → AWS/GCP/Azure/K8s/server, no cloud-specific code paths.
4. **Multi-language via a gRPC membrane** — identical SDK surface across Node/Python/Go/Dart; new languages by compiling proto contracts.
5. **Integrated local dev** — full local emulation + dashboard, no LocalStack.
6. **Resource-collection model** — prevents orphaned infra and code↔IaC drift.
7. **Escape hatches** — direct cloud SDK, provider extension, custom providers.

### How Nitric positions vs others (their framing)
- **vs Terraform:** developer-centric + auto-IAM + multi-cloud without per-provider code (Terraform is IaC-first, explicit, per-provider).
- **vs Pulumi:** higher-level abstractions + built-in local dev + true portability (Pulumi is lower-level infra control).
- **vs AWS SAM:** multi-cloud + multi-language + auto-IAM (SAM is AWS-only, YAML).
- **vs Serverless Framework:** real cloud-agnostic abstraction + integrated local dev (SF is AWS-centric, plugin-driven).
- **vs SST:** cloud-agnostic + provider-agnostic + extensible (SST is AWS + Pulumi, opinionated full-stack AWS).
- **vs Encore:** broader resource set + multiple clouds (Encore is more opinionated full-stack).

### Gaps / limitations (opportunities for HoBo)
- SQL databases in **preview** (hourly pricing, not serverless); enable via config.
- Custom domains **AWS-only**.
- Security rules **not enforced locally**.
- Bounded to abstracted services — anything else needs the cloud SDK (some coupling).
- Custom-provider authoring requires **Go**; "not easy to iterate on" (the user's own words).
- No first-class **actor/durable-workflow/event-sourcing** model.
- No **agent-native** story (agent identity, agent token brokering, MCP control surface).
- No **WASM/WASI** runtime / polyglot-via-components story.
- No **AI-generated providers/implementations**; provider breadth is human-driven.

### Commercial
- **Nitric Deploy** (formerly "Suga") — managed deployments (sub-10s), visual infra, observability; for teams who don't want to self-manage providers.

> See [`hobo-mapping.md`](#hobo-mapping) for how HoBo matches each feature and where it deliberately goes further.

## hobo-mapping

**Nitric → HoBo parity & mapping tracker**

> For every Nitric feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned, see iteration hooks. Part of the [Nitric competitor reference](nitric.md); HoBo design lives in [`../../docs/design/`](../docs/design/README.md).

### Core model
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Infrastructure from Code (run-to-collect) | **IfC-default**: resources declared inline + `.allow()`, collected by running the wasm component in resource-collection mode → manifest IR | ✅ | [02](../docs/design/sdk-api.md#plan-02), [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| Services (containerized entry points) | **Services = wasm/wasi components by default** (OCI container fallback) | ➕ | [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| Resources (building blocks) | HoBo resources = **WIT ports** with equivalence classes | ✅ | [21](../docs/design/authoring-resources-wiring.md#plan-21) |
| The Membrane (**gRPC** runtime contract) | **wRPC membrane** (wasmCloud's WIT-native RPC) over the WIT/wasm host boundary: component imports → host routes to linked provider; wire generated from WIT, no bespoke proto; same contract drives local/cross-process/lattice | ➕ | [20](../docs/design/wasm-runtime-wit.md#plan-20), [ADR-0069](../docs/design/adr/01-architecture-core.md#adr-0069) |
| Resource spec | **Manifest IR** (Nitric spec ∪ Aspire manifest) consumed by the Planner | ➕ | [22](../docs/design/authoring-resources-wiring.md#plan-22) |

### Resource catalog (full parity target)
| Nitric resource | HoBo port (WIT interface) | Status |
|---|---|---|
| `api` | `hobo:http` / `wasi:http` | ✅ |
| `kv` | `wasi:keyvalue` | ✅ |
| `bucket` (+ events, presigned) | `wasi:blobstore` (+ `hobo:blob-events`) | ✅ |
| `queue` (pull) | `hobo:queue` (`wasi:messaging` profile) | ✅ |
| `topic` (push pub/sub) | `wasi:messaging` | ✅ |
| `secret` (versioned) | `wasi:config`/`hobo:secrets` | ✅ |
| `sql` | `wasi:sql` / `hobo:sql` | ✅ |
| `schedule` (cron/interval) | `hobo:schedule` (control-plane `cron`) | ✅ |
| `websocket` | `hobo:websocket` | ✅ |
| `job` (batch, cpu/mem/gpu) | `hobo:job` (+ IaaS `vm`/`microVm`) | ✅ |
| `website` (static/SSR) | `web()` resource | ✅ |

All resources detailed with `.allow()` verbs + cross-cloud equivalence in [21](../docs/design/authoring-resources-wiring.md#plan-21).

### Permissions, security, providers
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `.allow(verbs)` → least-privilege IAM | `.allow(verbs)` drives **IAM + wasm capability grants (links) + agent token scope** (one declaration, three effects) | ➕ | [21](../docs/design/authoring-resources-wiring.md#plan-21), [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| OIDC API auth | OIDC + **first-class agent identity (SVID)** + keyless token broker | ➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| Pulumi/Terraform providers | `iac-pulumi` (primary) + Crossplane/OpenTofu adapters | ✅ | [03](../docs/design/control-plane.md#plan-03) |
| Provider = deploy + runtime layers (**Go plugins**) | **Provider = WIT-component** that *exports* the building-block interfaces (deploy realize() + runtime WIT impl + link); the contract **is** the WIT world, no Go/TS plugin SDK | ➕ | [03](../docs/design/control-plane.md#plan-03), [20](../docs/design/wasm-runtime-wit.md#plan-20), [ADR-0069](../docs/design/adr/01-architecture-core.md#adr-0069) |
| Custom providers (**Go-only** plugins) | Provider authoring in **any wasm language** (code against WIT, not a plugin API) + `@hobo/conformance` gate; **Forge-generatable** | ➕ | [03](../docs/design/control-plane.md#plan-03), [23](../docs/design/forge-generated-stack.md#plan-23) |
| Stack files (per-target) | `hobo.config.ts` + Camps (per-env) | ✅ | [02](../docs/design/sdk-api.md#plan-02) |

### CLI, local dev, deployment
| Nitric | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `nitric start` (emulate + dashboard) | `hobo dev` on `runtime-local` + dashboard | ✅ | [15](../docs/design/developer-experience.md#plan-15), [07](../docs/design/developer-experience.md#plan-07) |
| `nitric run` (containers) | `hobo dev --containers` (wasm host or OCI) | ✅ | [15](../docs/design/developer-experience.md#plan-15) |
| `nitric up/down/spec/build` | `hobo deploy/destroy/plan/build` | ✅ | [15](../docs/design/developer-experience.md#plan-15) |
| Local dashboard (test APIs, view kv/sql, trigger schedules, etc.) | HoBo dashboard + **run inspector / replay / link & trace views** | ➕ | [07](../docs/design/developer-experience.md#plan-07), [14](../docs/design/reliability-observability-cost.md#plan-14) |
| Multi-cloud, deploy to many at once | mapping rules: whole-app / per-tier / per-boundary | ✅ | [02](../docs/design/sdk-api.md#plan-02), [03](../docs/design/control-plane.md#plan-03) |

### Where HoBo deliberately exceeds Nitric (net-new)
| Capability | HoBo doc |
|---|---|
| **WASM/WASI-default polyglot runtime** (any language → component; capability security) | [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| **wRPC membrane + WIT-component providers + thin SDK** (same building-block set as Nitric's gRPC + Go-plugin shape, realized on the Component Model; SDK is typed sugar with no cloud logic; deny-by-default by linking) | [ADR-0069](../docs/design/adr/01-architecture-core.md#adr-0069) |
| **Dev auth bypass via integrated contract testing** (`hobo dev` satisfies the `auth` contract with a fixture principal; same contract gates `can-deploy`, so dev can't drift from prod — vs Nitric's OIDC rules not enforced locally) | [ADR-0070](../docs/design/adr/02-identity-security.md#adr-0070) |
| **Actors + durable workflows + choreography sagas** over a replayable event store | [02](../docs/design/sdk-api.md#plan-02), [11](../docs/design/event-model.md#plan-11) |
| **Agents as first-class principals** + Capability Manifest + MCP control surface | [06](../docs/design/ai-native-agent-auth.md#plan-06) |
| **AI-generated providers AND implementations**; stub → implement → trace → auto-evolve → live-fix (gated) | [23](../docs/design/forge-generated-stack.md#plan-23) |
| **Aspire-style wiring + manifest IR** for any component/container | [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| **Reliability/HA, security/multi-tenancy, networking, cost/FinOps** as designed concerns | [05](../docs/design/reliability-observability-cost.md#plan-05), [12](../docs/design/security-networking.md#plan-12), [13](../docs/design/security-networking.md#plan-13), [16](../docs/design/reliability-observability-cost.md#plan-16) |

### Open parity items (iteration hooks)
- Bucket-event + presigned-URL semantics as a HoBo WIT extension (`hobo:blob-events`).
- WebSocket port WIT shape (no standard `wasi:websocket` yet).
- `sql` migrations workflow parity (Nitric's `migrations/<db>/*.up.sql`).
- Per-language IfC collection fidelity (run-to-collect vs static analysis).
