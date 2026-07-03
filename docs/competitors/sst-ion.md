---
type: Competitive Reference
title: "SST / Ion — competitor reference"
description: "SST is an **open-source (MIT) framework for building full-stack apps on your own infrastructure** — your whole app is *\"defined in code — in a single `sst.config.ts`\"* (components like `Function`/`Nextjs`/`Bucket`/`Api`, resource `link`ing, Live Lambda dev). Since **v3** its engine is **Ion**: Pulumi's engine +"
tags: [hobo, competitors]
---

# SST / Ion — competitor reference

> A faithful capture of **SST** (and its **Ion** engine) for HoBo competitive analysis. SST is *"a framework that makes it easy to build modern full-stack applications on your own infrastructure"* — your entire app is *"defined in code — in a single `sst.config.ts` file."* Alongside **Encore**, **Amplify**, and **Nitric** it's a **close *authoring* analog** to HoBo (declare cloud resources in code, `link` them together, deploy), but distinctly **IaC-flavored**: since **v3**, SST's engine is **Ion**, which deploys its components with **Pulumi's engine + Terraform providers** — replacing the old **AWS CDK / CloudFormation** engine — and that is what unlocks its **150+ providers** and its multi-cloud (AWS + Cloudflare + Stripe + …) reach. Sources: [sst.dev](https://sst.dev/) · [sst.dev/docs](https://sst.dev/docs) · [sst.dev/docs/components](https://sst.dev/docs/components/) · [sst.dev/docs/linking](https://sst.dev/docs/linking/) · [sst.dev/docs/providers](https://sst.dev/docs/providers/) · [sst.dev/docs/live](https://sst.dev/docs/live/) · [sst.dev/docs/state](https://sst.dev/docs/state/) · [sst.dev/docs/console](https://sst.dev/docs/console/) · [sst.dev/blog/sst-v3](https://sst.dev/blog/sst-v3/) · [github.com/sst/sst](https://github.com/sst/sst). License **MIT** (framework + CLI + Console are OSS; the hosted **SST Console** is the paid product, priced per active resource). Researched July 2026; API/CLI/pricing shapes quoted for analysis under fair use (see [`index.md`](index.md#sources--fair-use)).

## What it is

SST is an **open-source (MIT) full-stack framework** whose defining move is that your *"entire app is defined in code — in a single `sst.config.ts` file,"* *"including databases, buckets, queues, Stripe webhooks, or any one of 150+ providers."* You author a `$config({ app(), run() })` block, describe **components** (`new sst.aws.Nextjs(...)`, `new sst.aws.Function(...)`, `new sst.aws.Bucket(...)`, `new sst.aws.ApiGatewayV2(...)`), **`link`** resources into your functions/frontends so they're accessed **type-safely via an SDK** (`import { Resource } from "sst"` → `Resource.MyBucket.name`), run everything locally with **`sst dev`** (Live Lambda: your real cloud resources, your function code running on your machine), then ship with **`sst deploy --stage <name>`** into **your own cloud account**. It's mature and popular — the `sst/sst` repo carries an **MIT** license and ~26k+ GitHub stars, and its **Next.js-on-AWS** path (via OpenNext) is one of the most battle-tested full-stack deployment stories in the ecosystem.

The mental model is **infrastructure-from-code (IfC)** — the same authoring thesis HoBo adopts ([Plan 21](../design/authoring-resources-wiring.md#plan-21)) — but **with a real IaC engine deliberately kept underneath**. This is the crucial architectural distinction from Encore (which positions as *"IfC, not IaC"* and owns provisioning with no separate config engine): **SST embraces IaC as the substrate**. Since **v3**, SST's engine is **Ion**, described in the SST v3 announcement as being built on *"Pulumi and Terraform, as opposed to CDK and CloudFormation"* — specifically *"an AWS provider from Pulumi that's built on Terraform."* Components compile to low-level provider resources, Pulumi's engine diffs and applies them, and **SST keeps its own state** (not Pulumi Cloud) in your **`home`** provider (on AWS: an `sst-state-<hash>` S3 bucket + an SSM passphrase parameter). **This "IfC on top, pluggable IaC beneath" shape is exactly HoBo's control-plane thesis** ([Plan 4](../design/control-plane.md#plan-04) / [ADR-0006](../design/adr/01-architecture-core.md#adr-0006)) — SST shipping a popular framework on Pulumi+Terraform is a **strong real-world validation of HoBo's IaC-under-IfC layer**.

**Origin story (Ion).** SST began *built on AWS CDK and CloudFormation*, but the team *"hit some of its underlying design flaws"* — CloudFormation's *slow deploys, opaque error messages, hard 500-resource-per-stack limit, and long rollback windows* — and, as they *"expand[ed] past AWS and support[ed] the broader ecosystem,"* found CDK/CloudFormation *too AWS-centric*. Ion (codename, now shipped **as SST v3**) rebuilds the engine on Pulumi + Terraform providers so there's *"no CloudFormation… no stacks and no resource limits,"* with the deployment *"happen[ing] right from your local machine."*

Two honesty flags for the comparison. **(1) AWS-first components.** The 150+ providers claim is real, but it's mostly *reach via raw Pulumi/Terraform providers*, not first-class SST components: the polished, high-level `sst.*` component catalog is **AWS-first** (`sst.aws.*` is by far the deepest), with a smaller **`sst.cloudflare.*`** set and everything else reached through low-level provider resources. **(2) A deploy framework, not a runtime.** SST provisions and links infrastructure and gives a superb local loop, but it does **not** run a durable/event-sourced application runtime of its own — your code runs as ordinary AWS Lambda / containers. Both are precisely the seams HoBo is designed around.

| Dimension | SST (Ion) |
|---|---|
| Authoring | **Infrastructure-from-code in TypeScript** — one `sst.config.ts` with `$config({ app(), run() })`; resources are **components** (`new sst.aws.Function(...)`, `new sst.aws.Nextjs(...)`, …) |
| Engine (**Ion**) | **Pulumi engine + Terraform providers** (v3, replacing v2's **AWS CDK + CloudFormation**); *"no stacks and no resource limits,"* parallel deploys, deploys from your machine |
| Components | `sst.aws.*` (deepest): `Function`, `Nextjs`/`Remix`/`Astro`/`SvelteKit`/`StaticSite`, `Bucket`, `ApiGatewayV2`, `Cron`, `Queue`, `Postgres`/`Dynamo`, `Service`/`Cluster`, `Vpc`, `Router`, `Realtime` · `sst.cloudflare.*`: `Worker`, `Bucket`, … · anything else via raw Pulumi/Terraform provider resources |
| Resource linking | **`link: [resource]`** on a function/frontend/service → typed SDK access (`import { Resource } from "sst"` → `Resource.MyBucket.name`) **+ auto least-privilege IAM + env injection + generated `sst-env.d.ts`**; `sst.Linkable` / `Linkable.wrap` / `Linkable.env` to make any resource linkable |
| Runtime | **AWS Lambda / containers** — no SST-owned runtime. Function runtimes: **Node.js** (official), **Go** (official), **Python**/**Rust** (community), **container image**; SDK for JS/TS/Python/Go/Rust |
| Local dev | **`sst dev`** — **Live Lambda**: deploys a *stub* Lambda, proxies real invocations to your machine (over AppSync Events), runs functions as Node Workers with **<10ms reload** + **IDE breakpoints**; `SST_DEV=true`; also tunnels your VPC + starts frontends |
| Providers / clouds | **150+ providers** (AWS, Cloudflare, GCP, Azure, Stripe, Vercel, Auth0, GitHub, …) via Pulumi/Terraform; add with `sst add <provider>`; **components are AWS-first**, other clouds are provider-level |
| State | **SST-managed state** in your **`home`** (`aws`/`cloudflare`/`local`) — on AWS: `sst-state-<hash>` S3 bucket + SSM passphrase; `sst refresh` reconciles drift |
| Deploy | `sst deploy --stage <name>` into **your own account**; **stages** namespace envs (`dev`, `production`, `pr-123`) |
| Control plane / AI | **SST Console** (paid, hosted): Autodeploy (git-push → build in *your* AWS via CodeBuild), Issues (error tracking), Resources + logs. *No agent/AI-native surface, no MCP, no AI-generated providers* |
| License / price | **MIT** OSS (framework + CLI + Console source); **Console** billed **per active resource/mo** — first 2,000 @ **$0.086** each, then **$0.032**; **free ≤ 350 active resources**; cloud usage billed by your provider |

## Feature surface

### `sst.config.ts` — the `$config` / `app()` / `run()` loop

The whole app is one TypeScript file. `app()` returns configuration (name, `home`/state provider, `providers`, `removal`, `protect`, `version`); **resources are defined only inside `run()`** (*"You can add Pulumi code in the run function not the app function"*); returned values become CLI outputs written to `.sst/outputs.json`.

```ts
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "my-app",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",                                   // where SST state lives
      providers: { aws: "6.27.0", cloudflare: "5.37.1" },
    };
  },
  async run() {
    const bucket = new sst.aws.Bucket("MyBucket");
    const web = new sst.aws.Nextjs("MyWeb", { link: [bucket], domain: "my-app.com" });
    return { url: web.url };
  },
});
```

Environment variables from `.env` / `.env.<stage>` are available via `process.env` in both functions. The **stage** (`--stage`, or a default per-user stage) namespaces every environment — `dev`, `production`, per-PR `pr-123` — so the same config yields isolated deployments.

### Components — the resource catalog

*"Components are the building blocks of your app"* — high-level abstractions over low-level provider resources (*"it takes around 70 low level AWS resources to create a Next.js app on AWS"*). The catalog is **AWS-first** (`sst.aws.*`), with a smaller `sst.cloudflare.*` set; anything else is a raw Pulumi/Terraform resource.

```ts
// Frontend (uses OpenNext to deploy Next.js to Lambda/CloudFront)
new sst.aws.Nextjs("MyWeb", { domain: "my-app.com" });

// Function — handler + link + Lambda URL + env, in one declaration
const bucket = new sst.aws.Bucket("MyBucket");
new sst.aws.Function("MyFunction", {
  handler: "src/lambda.handler",
  link: [bucket],
  url: true,
  environment: { DEBUG: "true" },
});

// HTTP API (API Gateway v2) with routes
const api = new sst.aws.ApiGatewayV2("MyApi");
api.route("GET /", "src/get.handler");
api.route("POST /notes", { handler: "src/create.handler", link: [bucket] });

// Queue + subscriber, Cron, Postgres (in a VPC), a long-running container Service
const queue = new sst.aws.Queue("MyQueue");
queue.subscribe("src/subscriber.handler");
new sst.aws.Cron("MyCron", { schedule: "rate(1 day)", function: "src/cron.handler" });
const vpc = new sst.aws.Vpc("MyVpc");
const db = new sst.aws.Postgres("MyDatabase", { vpc });
const cluster = new sst.aws.Cluster("MyCluster", { vpc });
new sst.aws.Service("MyService", { cluster, link: [bucket, db] });

// Multi-cloud: a Cloudflare Worker in the same config
new sst.cloudflare.Worker("MyWorker", { handler: "src/worker.ts", url: true });
```

**Escape hatch.** Every component takes a **`transform`** prop — *"an escape hatch"* to *"completely configure a component"* by modifying its underlying infra (a Function's Lambda, LogGroup, IAM role, …); the global **`$transform`** sets default props across *all* components. Beneath the components, you can drop to raw provider resources (`new aws.s3.BucketV2(...)`) and provider **functions** (`aws.getCallerIdentityOutput()`), and instantiate multi-region providers (`new aws.Provider("useast1", { region: "us-east-1" })`).

### Resource linking (`link`) + the `Resource` SDK + `Linkable`

Linking is SST's headline ergonomic and the **direct analog to HoBo's `.allow()`/`bind`**. You attach a resource with **`link: [resource]`**; SST then *"1. Grant[s] the permissions needed to access the resources. 2. Allow[s] you to access it in your function using the SDK."* — i.e. **one declaration → least-privilege IAM + typed runtime access + generated types**:

```ts
// infra
const bucket = new sst.aws.Bucket("MyBucket");
new sst.aws.Function("MyFn", { handler: "src/fn.handler", link: [bucket] });

// runtime — typesafe, nothing hardcoded
import { Resource } from "sst";
console.log(Resource.MyBucket.name);   // linked value, IAM already granted
```

Behind the scenes, for **functions** links are *"injected into `globalThis`… encrypted and added to the function bundle"*; for **frontends** they're *"injected into `process.env`… using the prefix `SST_RESOURCE_`"* (server-side only). Linking *"automatically grants IAM permissions and generates `sst-env.d.ts` type definitions."* The **`Linkable`** API extends this to anything: `new sst.Linkable("MyLinkable", { properties: { foo: "bar" } })` links arbitrary values; **`Linkable.wrap(aws.dynamodb.Table, (t) => ({ properties: { tableName: t.name } }))`** makes an external/raw provider resource linkable; **`Linkable.env([bucket])`** exposes links as env vars for non-SST compute. Because a link can point at a resource in a *different* provider, this is also SST's **cross-cloud wiring** primitive (link an AWS `Bucket` into a `sst.cloudflare.Worker`).

### Live — `sst dev` (Live Lambda Development)

`sst dev` is SST's signature local loop. It *"deploys your app and replaces the Lambda functions with a stub version"*; when a deployed function is invoked, the stub *"publishes an event"* (over AWS AppSync Events as of recent versions) whose payload is the request, a **local WebSocket client** receives it, *"runs the local version of the function,"* and publishes the response back — so **your real cloud resources invoke your local code**. Changes reload in *"under 10ms"*, functions run as **Node Workers**, you can *"set breakpoints to debug… in your favorite IDE,"* and code can branch on **`SST_DEV=true`**. The same command tunnels your VPC and starts frontend/container services, so the whole app runs together locally against real infra.

### Ion — the Pulumi + Terraform engine, providers & state

The engine (**Ion**, = **SST v3**) is the substrate. Components are compiled to low-level resources defined by **Terraform providers** and applied by **Pulumi's engine** (*"no CloudFormation… no stacks and no resource limits"*, parallel + no-op-skipping deploys). Providers are added with **`sst add <provider>`** — which *"adds the provider to your config, installs the packages, and adds the namespace… to your globals"* — and pinned in the `providers` block:

```ts
providers: { aws: "6.27.0", cloudflare: "5.37.1" }   // sst install to apply changes
```

This is the source of the **150+ providers** / multi-cloud claim: *"deploy AWS + Cloudflare + GitHub resources from a single config,"* with **linking across providers** to wire multi-cloud infra. **State** is SST's own (not Pulumi Cloud): stored in the **`home`** provider — on AWS an `sst-state-<hash>` S3 bucket plus an `/sst/passphrase/<app>/<stage>` SSM parameter — and reconciled with **`sst refresh`** (which walks every resource in state and drops ones that no longer exist).

### CLI

```bash
npx sst dev                      # local: Live Lambda + tunnel + frontends/containers
npx sst deploy --stage prod      # deploy a stage into your own account
npx sst add cloudflare           # add a provider (installs + namespaces it)
npx sst install                  # apply provider/version changes from config
npx sst refresh                  # reconcile state with the real cloud (drift)
npx sst remove --stage pr-123    # tear a stage down
npx sst secret set MyKey value   # per-stage secrets (linkable)
npx sst console                  # open the Console
```

### Console (commercial) + pricing

The **SST Console** (`console.sst.dev`) is the hosted control surface and the paid product: **Autodeploy** (git-push → SST builds/deploys in *your* AWS via CodeBuild, with branch/PR workflows configured in `sst.config.ts`), **Issues** (real-time error tracking for Node Lambda/containers from plain `console.error(new Error())`, with Slack/email alerts, *"nothing to setup"*), and **Resources + logs** (full app state, relationships, outputs, log search/jump). Pricing is **per active resource/workspace/month**: first 2,000 @ **$0.086**, then **$0.032**; **free for ≤ 350 active resources** (from stages ≥ 2 weeks old, updated that month) — e.g. 351 active resources ≈ **$30.20/mo**. The Console is itself open-source and built with SST; **cloud usage is billed by your own provider**, not SST.

## Differentiators

### Strengths (what SST does well)

- **A mature, popular full-stack framework that ships today** — MIT, ~26k+ stars, and a **best-in-class Next.js-on-AWS** path (via OpenNext) plus Remix/Astro/SvelteKit/Solid, containers, and Lambda. HoBo is design-phase; SST is real, proven tooling.
- **IfC ergonomics *with a real IaC engine underneath*** — the cleanest public proof of the **IaC-under-IfC** architecture: a friendly declare-and-link surface on top, **Pulumi + Terraform providers** doing the provisioning beneath. This is HoBo's control-plane thesis, validated in production.
- **150+ providers + genuine multi-cloud from one config** — AWS + Cloudflare + Stripe + GitHub + … in a single `sst.config.ts`, with cross-provider **linking** to wire them.
- **Resource linking (`link`)** — one declaration yields **typed SDK access + auto least-privilege IAM + env injection + generated `sst-env.d.ts`**; `Linkable`/`Linkable.wrap` extends it to any resource. A strong, low-ceremony "no hardcoding" story.
- **Live Lambda dev** — real cloud resources invoking **your local function code**, <10ms reload, real IDE breakpoints. A genuinely high-fidelity loop (different tradeoff from Encore's "real infra locally": SST uses *real cloud* infra + local code).
- **Deploys into your own account, no vendor runtime** — SST-managed state lives in *your* bucket; you own the resources. MIT throughout; the Console is the only paid piece.

### Gaps (SST's limits — HoBo's opening)

- **Components are AWS-first; other clouds are provider-level, not first-class.** The 150+ providers give reach, but the polished `sst.*` component catalog is deepest on **`sst.aws.*`**, with a thin `sst.cloudflare.*` set and everything else as raw Pulumi/Terraform resources. There's no "same component, any cloud, equivalent semantics" contract. HoBo's resources are **cloud-agnostic WIT ports with equivalence classes** across **many** clouds, and IaC engines (Pulumi/Crossplane/Terraform/OpenTofu) are **pluggable adapters** — SST is one specific IaC-flavored tool HoBo's model generalizes ([Plan 4](../design/control-plane.md#plan-04) / [ADR-0006](../design/adr/01-architecture-core.md#adr-0006)).
- **Config is TypeScript/JS-only; no wasm runtime.** `sst.config.ts` is TS/JS; function *code* can be Node (official), Go (official), Python/Rust (community) or a container — but there's **no WASM/WASI component runtime** and **no language-neutral runtime contract**. HoBo's runtime contract is **language-neutral WIT** (any wasm-compiling language) with capability security by construction ([Plan 20](../design/wasm-runtime-wit.md#plan-20) / [ADR-0031](../design/adr/01-architecture-core.md#adr-0031)).
- **A deploy framework, not a runtime — no durable/event-sourced core.** SST provisions and links infra, then your code runs as ordinary Lambda/containers; there's no SST-owned **actors / durable workflows / choreography sagas / replayable event store**. HoBo ships a **durable, event-sourced runtime** as a first-class plane ([Plan 11](../design/data-plane.md#plan-11) / [ADR-0003](../design/adr/01-architecture-core.md#adr-0003) / [ADR-0004](../design/adr/01-architecture-core.md#adr-0004) / [ADR-0050](../design/adr/03-data-plane.md#adr-0050)).
- **No auditable Matching / platform-rules layer.** A component's resource mapping is fixed in the component's code (you fork behavior via `transform`/raw resources or per-stage `if`s). There's no *"same app → different infra per environment, as a recorded decision."* HoBo adds **Resource Definitions + Matching** so a cheap preview vs a managed-HA prod realization is an auditable `match.Decided` ([Plan 25](../design/platform-engineering.md#plan-25) / [ADR-0033](../design/adr/01-architecture-core.md#adr-0033)), plus a cost-aware **Dispatcher** ([ADR-0071](../design/adr/01-architecture-core.md#adr-0071)).
- **No AI-native surface.** No agents-as-principals, no MCP control surface, no AI-generated providers/implementations; the Console's intelligence is error grouping, not generation or agent identity. HoBo treats **agents as first-class principals + MCP** ([Plan 6](../design/ai-native-agent-auth.md#plan-06)) and **generates providers/impls** ([Plan 23](../design/generated-stack.md#plan-23) / [ADR-0010](../design/adr/03-data-plane.md#adr-0010)).
- **No self-hostable control plane / governance planes.** Value in the framework is honestly OSS and deploys to your own account, but the **operational control surface is the hosted, paid Console** (or nothing). There's no self-hostable equivalent, and no contracts/`can-deploy`/policy/cost/RBAC planes over the platform itself. HoBo's **Yard is itself a Bindle** — self-host = hosted parity — is OSS, and commercialization/billing is **out of design scope** ([Plan 4](../design/control-plane.md#plan-04) / [ADR-0064](../design/adr/07-portability-extensibility.md#adr-0064)).
- **Greenfield-leaning.** Adoption means writing to SST components; there's no first-class *import an existing TF/Pulumi/cloud estate in place* story. HoBo specifies `hobo import` for adopt-in-place migration.

### Comparisons

- **vs HoBo:** SST is **IfC-on-IaC → AWS-first (via Pulumi/Terraform), TS config, deploy-time**; HoBo is **IfC-on-*pluggable*-IaC → any cloud, any wasm language, with a durable event-sourced runtime + auditable Matching + AI-native depth**. SST is the clearest public evidence that HoBo's **IaC-under-IfC** layer is the right architecture — and the sharpest reminder that HoBo's edge is the *runtime + governance + breadth* wrapped around that layer.
- **vs Encore:** Encore is *"IfC, **not** IaC"* — it owns provisioning, no separate config engine, a Rust request runtime, superb "real infra locally" dev. SST is *"IfC **on** IaC"* — a friendly surface over Pulumi/Terraform, no runtime of its own, "real cloud + local code" dev. HoBo agrees with both on authoring and keeps **IaC tools as pluggable adapters underneath** (Encore's ergonomics **+** SST's engine flexibility).
- **vs Nitric:** both are IfC with a `.allow()`/`link`-style permission-in-code model and Pulumi/Terraform under the hood. Nitric abstracts *behind its own gRPC "membrane"* with **first-class components across AWS/GCP/Azure/K8s** and a language-agnostic proto SDK; SST is **AWS-first components** + broader *provider* reach and a stronger frontend/Next.js story. HoBo generalizes both: **WIT ports** (Nitric-membrane-like portability) over **pluggable IaC** (SST-like engine flexibility).
- **vs Amplify:** the closest structural twin — both are **TypeScript IfC layered on an IaC engine**. Amplify is **AWS-only, CDK/CloudFormation-bound, fixed mapping**; SST is **Pulumi/Terraform + 150 providers**, i.e. the same authoring shape but a *more open engine*. HoBo goes further than both on cloud/engine/language breadth and adds the runtime + governance planes.
- **vs Pulumi / Terraform / OpenTofu:** SST is a **higher-level framework built on** Pulumi + Terraform providers (components, linking, Live dev, stages). HoBo **is not an IaC-tool replacement** — it *orchestrates* Pulumi/Crossplane/Terraform/OpenTofu as adapters, and **SST is precisely the kind of IaC-flavored tool HoBo could sit over** (or interoperate with) rather than compete with head-on.

**Net:** SST is the **IaC-flavored** member of HoBo's authoring-analog set (Encore/Amplify/Nitric) and the **best public proof of the IaC-under-IfC architecture** — a friendly `sst.config.ts` + `link` surface on top, **Pulumi + Terraform providers** doing the work beneath, shipping at real scale on the Next.js-on-AWS path. The gap is **everything HoBo wraps around that layer**: true multi-cloud with **cloud-agnostic WIT resources** (not AWS-first components), a **language-neutral wasm runtime**, a **durable event-sourced runtime**, **Resource Definitions + auditable Matching + a cost-aware Dispatcher**, **agents-as-principals + AI generation**, and a **self-hostable, OSS control plane with governance planes** (no billing). SST validates HoBo's authoring model and its IaC substrate; HoBo's differentiation is the meta-cloud, the runtime, and the AI-native depth.

## HoBo mapping

> HoBo's equivalent for each SST/Ion concept (✅ has · ➕ goes further · 🔜 planned). HoBo is **design-phase**; SST ships real, mature, popular tooling — credited above.

| SST / Ion concept | HoBo equivalent | Notes |
|---|---|---|
| **IfC in one `sst.config.ts`** (`$config`/`app`/`run`) | **IfC authoring** + Bindle + **manifest IR** ([Plan 21](../design/authoring-resources-wiring.md#plan-21)) | ✅ same thesis — declare inline, platform collects → manifest IR; `sst.config.ts` ↔ Bindle + manifest IR |
| **Components** (`sst.aws.Function`/`Nextjs`/`Bucket`/`ApiGatewayV2`/`Queue`/`Cron`/`Postgres`/`Service`) | HoBo resource catalog as **WIT ports** with equivalence classes (`service`/`web`/`bucket`/`api`/`queue`/`schedule`/`sql`/…) ([Plan 21](../design/authoring-resources-wiring.md#plan-21)) | ✅ near 1:1 at the authoring surface |
| **`link: [resource]`** → typed SDK + IAM + env (`Resource.X`) | **`.allow()` / `bind`** — one declaration, **three** effects: least-priv IAM **+ wasm capability link + agent token scope** ([Plan 21](../design/authoring-resources-wiring.md#plan-21)) | ➕ SST's `link` is the direct analog (IAM + typed access); HoBo adds the wasm capability grant and agent-scoped token |
| `sst.Linkable` / `Linkable.wrap` / `Linkable.env` | Linking arbitrary/wrapped resources into the manifest IR + `.allow()` graph ([Plan 21](../design/authoring-resources-wiring.md#plan-21)) | ✅ same "make anything linkable" primitive |
| **Ion engine** = **Pulumi + Terraform providers** (v3) | **Pluggable IaC adapters**: `iac-pulumi` (primary) + Crossplane/Terraform/OpenTofu ([Plan 4](../design/control-plane.md#plan-04) / [ADR-0006](../design/adr/01-architecture-core.md#adr-0006)) | ➕ SST-on-Pulumi **validates HoBo's IaC-under-IfC layer**; HoBo makes the engine *pluggable*, not fixed to one |
| **150+ providers, AWS-first components** | Cloud-agnostic **WIT ports** + provider adapters across many clouds; per-tier/per-boundary mapping ([Plan 4](../design/control-plane.md#plan-04)) | ➕ equivalence-class portability vs AWS-first components + raw-provider reach |
| **`sst dev`** (Live Lambda: real cloud + local code) | `hobo dev` on `runtime-local` + **fidelity matrix** ([Plan 7](../design/developer-experience.md#plan-07) / [ADR-0042](../design/adr/07-portability-extensibility.md#adr-0042)) | ✅/➕ HoBo labels simulate/mock/Camp-only + `hobo verify` splits local vs Camp checks; SST's real-cloud-invokes-local-code is one point on that matrix |
| **Stages** (`--stage`, `pr-123`) + SST state in `home` | **Camps** (per-env) + ephemeral/preview Camps; event-sourced control-plane state ([Plan 25](../design/platform-engineering.md#plan-25)) | ✅/➕ |
| **Fixed component→resource mapping** (fork via `transform`) | **Resource Definitions + Matching** (`match.Decided`) + **Dispatcher** ([Plan 25](../design/platform-engineering.md#plan-25) / [ADR-0033](../design/adr/01-architecture-core.md#adr-0033) / [ADR-0071](../design/adr/01-architecture-core.md#adr-0071)) | ➕ same app → different infra per env, **auditable** + cost-routed |
| Function runtimes (Node/Go/Python/Rust/container); TS-only config | Language-neutral **WIT/WASM** runtime, any wasm language ([Plan 20](../design/wasm-runtime-wit.md#plan-20) / [ADR-0031](../design/adr/01-architecture-core.md#adr-0031)) | ➕ polyglot **by component contract**, capability-secured; not TS-config-bound |
| *(none — deploy framework, no runtime)* | **Durable, event-sourced runtime** — actors/workflows/sagas + replay ([Plan 11](../design/data-plane.md#plan-11) / [ADR-0003](../design/adr/01-architecture-core.md#adr-0003)/[ADR-0004](../design/adr/01-architecture-core.md#adr-0004)/[ADR-0050](../design/adr/03-data-plane.md#adr-0050)) | ➕ |
| **SST Console** (Autodeploy / Issues / logs — hosted, paid) | Self-hostable **Yard-is-a-Bindle** control plane + dashboard/observability ([Plan 4](../design/control-plane.md#plan-04) / [Plan 7](../design/developer-experience.md#plan-07)); billing out of scope ([ADR-0064](../design/adr/07-portability-extensibility.md#adr-0064)) | ➕ self-host = hosted parity, OSS, **no billing/monetization** |
| *(none)* | **Agents as first-class principals + MCP control surface** ([Plan 6](../design/ai-native-agent-auth.md#plan-06)) | ➕ |
| *(none)* | **AI generation pipeline** — generated providers/impls, stub→implement→trace→evolve ([Plan 23](../design/generated-stack.md#plan-23) / [ADR-0010](../design/adr/03-data-plane.md#adr-0010)) | ➕ |
| *(none — greenfield-leaning)* | **`hobo import`** — adopt existing TF/Pulumi/cloud estates in place | ➕ |

### The one-line takeaway

**SST proves HoBo's authoring model *and* its IaC substrate in production** — a friendly IfC surface (`sst.config.ts` + component `link`ing + Live dev) sitting on **Pulumi + Terraform providers**, shipping the popular Next.js-on-AWS story. But SST is **AWS-first, TS-config-bound, a deploy framework with no runtime of its own, no auditable Matching, no AI-native surface, and no self-hostable control plane**. HoBo's differentiation is the whole meta-cloud around that validated core: **cloud-agnostic WIT resources over pluggable IaC, a language-neutral wasm runtime, a durable event-sourced runtime, Resource Definitions/Matching + the Dispatcher, agents-as-principals + AI generation, and an OSS self-host-equals-hosted control plane — SST being exactly the kind of IaC-flavored tool HoBo orchestrates rather than replaces.**
