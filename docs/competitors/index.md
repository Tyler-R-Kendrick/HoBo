# HoBo — Competitor references

> Source-backed captures of competing and adjacent products, each with a HoBo parity/mapping section. These ground the design suite ([`../design/`](../design/index.md)) in what already exists.

This page is **navigation**. The corpus has three layers, and each fact lives in exactly one of them:

| Layer | Where | What it holds |
| ----- | ----- | ------------- |
| Canonical capture | `docs/competitors/<slug>.md` | All research on one product. One file per product, no matter how many categories it belongs to. |
| Category index | [`categories/`](categories/index.md) | Category boundary, why HoBo competes there, and one standardized comparison row per member. No research. |
| Derived views | [`matrix.md`](matrix.md) · [`gap-analysis.md`](gap-analysis.md) | Generated cross-category matrix and freshness ledger; cross-competitor synthesis. |

Membership, aliases, posture and freshness are declared once, in each capture's `competitor:` front matter, and validated by `pnpm run docs:competitors`. The schema and canonical path rules are normative in [`metadata-contract.md`](metadata-contract.md).

<!-- BEGIN GENERATED: competitor-index -->

## Categories (13)

| Category | Competitors |
| -------- | ----------- |
| [Comprehensive Platform Orchestrators](categories/platform-orchestrators.md) | [Crossplane](crossplane.md) · [Humanitec](humanitec.md) · [Mia-Platform](mia-platform.md) · [Nomad](nomad.md) · [Qovery](qovery.md) · [Radius](radius.md) |
| [Portable Application Models & Control Planes](categories/portable-application-models.md) | [.NET Aspire](aspire.md) · [Alchemy](alchemy.md) · [Crossplane](crossplane.md) · [Dapr](dapr.md) · [Humanitec](humanitec.md) · [Nitric](nitric.md) · [Radius](radius.md) · [SST](sst.md) |
| [Cloud Application Platforms](categories/cloud-application-platforms.md) | [Anonymous container hosts](anon-container-hosts.md) · [AWS Amplify](aws-amplify.md) · [Encore](encore.md) · [Flux Network](flux-network.md) · [Fly.io](flyio.md) · [Heroku](heroku.md) · [Lakebed](lakebed.md) · [Modal](modal.md) · [Netlify](netlify.md) · [Northflank](northflank.md) · [Qovery](qovery.md) · [Railway](railway.md) · [Render](render.md) · [Vercel](vercel.md) |
| [Developer Portals & IDPs](categories/developer-portals-idps.md) | [Backstage](backstage.md) · [Mia-Platform](mia-platform.md) |
| [Infrastructure-from-Code & Authoring](categories/infrastructure-from-code.md) | [.NET Aspire](aspire.md) · [Alchemy](alchemy.md) · [AWS Amplify](aws-amplify.md) · [Encore](encore.md) · [Nitric](nitric.md) · [SST](sst.md) · [Wasp](wasp.md) · [Winglang](winglang.md) |
| [Runtime & Distributed Application Substrates](categories/runtime-substrates.md) | [.NET Aspire](aspire.md) · [celld](celld.md) · [Dapr](dapr.md) · [Flux Network](flux-network.md) · [Modal](modal.md) · [Nomad](nomad.md) · [Rivet](rivet.md) · [Spin / Fermyon](spin-fermyon.md) · [Wasm host landscape](wasm-hosts.md) · [wasmCloud](wasmcloud.md) |
| [Hybrid & Multicloud Enterprise Orchestration](categories/hybrid-multicloud-enterprise.md) | [Crossplane](crossplane.md) · [Mia-Platform](mia-platform.md) |
| [Self-Hosted PaaS & Server Deployment](categories/self-hosted-paas.md) | [Anonymous container hosts](anon-container-hosts.md) · [Northflank](northflank.md) · [ServerKit](serverkit.md) |
| [Agentic Infrastructure & Operations](categories/agentic-infrastructure.md) | [Antimetal](antimetal.md) · [InsForge](insforge.md) · [Lakebed](lakebed.md) · [Vercel](vercel.md) |
| [Backend & Data Application Platforms](categories/backend-data-platforms.md) | [AWS Amplify](aws-amplify.md) · [Convex](convex.md) · [InsForge](insforge.md) · [Supabase](supabase.md) · [Wasp](wasp.md) |
| [Delivery, Release & GitOps](categories/delivery-release-gitops.md) | [Octopus Deploy](octopus-deploy.md) |
| [FinOps, Governance & Placement](categories/finops-governance-placement.md) | [Antimetal](antimetal.md) · [FinOps tooling cohort](finops-tooling.md) |
| [Identity, Networking & Application Delivery](categories/identity-networking-delivery.md) | [NetScaler](netscaler.md) · [ServerKit](serverkit.md) · [shoo.dev](shoo.md) |

Categories are many-to-many: several products appear in more than one row above, with a single canonical capture behind each link.

## Canonical captures (41)

| Competitor | Capture | Primary category | Directness | Role relative to HoBo |
| ---------- | ------- | ---------------- | ---------- | --------------------- |
| **.NET Aspire** | [`aspire.md`](aspire.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | direct | code-first app composition, local orchestration and deploy — closest authoring analog outside TypeScript |
| **Alchemy** | [`alchemy.md`](alchemy.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | direct | TypeScript-native engine-less IaC — competes on the authoring/provisioning core and is a candidate iac-alchemy adapter |
| **Anonymous container hosts** | [`anon-container-hosts.md`](anon-container-hosts.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | adjacent | cohort capture of zero-key temporary container hosts used as the Examples Temporary host matrix |
| **Antimetal** | [`antimetal.md`](antimetal.md) | [`agentic-infrastructure`](categories/agentic-infrastructure.md) | adjacent | AI-native production-operations layer (world model, RCA, agent handoff) — SRE/operator benchmark |
| **AWS Amplify** | [`aws-amplify.md`](aws-amplify.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | overlapping | Gen-2 code-first TypeScript fullstack backend on AWS CDK — IfC-in-TS analog, AWS-only |
| **Backstage** | [`backstage.md`](backstage.md) | [`developer-portals-idps`](categories/developer-portals-idps.md) | complementary | CNCF developer portal framework — complementary front-end to a HoBo control plane |
| **celld** | [`celld.md`](celld.md) | [`runtime-substrates`](categories/runtime-substrates.md) | adjacent | self-hosted Cloudflare Workers/Durable Objects daemon — experimental DO dialect and candidate ActorHost |
| **Convex** | [`convex.md`](convex.md) | [`backend-data-platforms`](categories/backend-data-platforms.md) | adjacent | reactive TypeScript backend-as-a-service — source of the live-query gap and a possible provider target |
| **Crossplane** | [`crossplane.md`](crossplane.md) | [`portable-application-models`](categories/portable-application-models.md) | overlapping | CNCF Kubernetes control plane for infrastructure — borrow-source and pluggable IaC adapter |
| **Dapr** | [`dapr.md`](dapr.md) | [`runtime-substrates`](categories/runtime-substrates.md) | overlapping | distributed-application runtime with portable building-block APIs — closest architectural analog to Bindle kinds |
| **Encore** | [`encore.md`](encore.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | direct | infrastructure-from-code for TS/Go that provisions into your cloud — closest product analog |
| **FinOps tooling cohort** | [`finops-tooling.md`](finops-tooling.md) | [`finops-governance-placement`](categories/finops-governance-placement.md) | adjacent | cohort capture of cost allocation/estimation/optimization tooling; superseded per product as individual captures land |
| **Flux Network** | [`flux-network.md`](flux-network.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | adjacent | decentralized container host with a Git-to-Flux deploy UX (Orbit) — compute provider target, not an actor runtime |
| **Fly.io** | [`flyio.md`](flyio.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | global app platform on Firecracker microVMs — edge PaaS competitor and provider target |
| **Heroku** | [`heroku.md`](heroku.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | the original app-centric PaaS (dynos, buildpacks, add-ons) — the mainstream 'just deploy my app' benchmark |
| **Humanitec** | [`humanitec.md`](humanitec.md) | [`platform-orchestrators`](categories/platform-orchestrators.md) | direct | Platform Orchestrator for IDPs with dynamic configuration management — head-on orchestrator competitor |
| **InsForge** | [`insforge.md`](insforge.md) | [`backend-data-platforms`](categories/backend-data-platforms.md) | adjacent | agent-native backend-as-a-service — agent-ops benchmark and possible provider target |
| **Lakebed** | [`lakebed.md`](lakebed.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | direct | agent-native closed PaaS (Capsules, sync RPC, llms.txt) — named head-on competitor |
| **Mia-Platform** | [`mia-platform.md`](mia-platform.md) | [`platform-orchestrators`](categories/platform-orchestrators.md) | direct | enterprise platform orchestrator plus developer portal — owns the same application-to-environment span HoBo does, in one commercial suite |
| **Modal** | [`modal.md`](modal.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | adjacent | Python-first serverless compute for AI/ML with agent Sandboxes — AI-native compute competitor |
| **Netlify** | [`netlify.md`](netlify.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | composable-web platform (Functions/Edge, Blobs, Netlify DB) — frontend PaaS benchmark |
| **NetScaler** | [`netscaler.md`](netscaler.md) | [`identity-networking-delivery`](categories/identity-networking-delivery.md) | complementary | application delivery controller plus its IaC surface — candidate gateway provider and hobo-import analog |
| **Nitric** | [`nitric.md`](nitric.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | overlapping | cloud-agnostic infrastructure-from-code framework — authoring analog for typed resource declaration |
| **Nomad** | [`nomad.md`](nomad.md) | [`runtime-substrates`](categories/runtime-substrates.md) | overlapping | workload scheduler/orchestrator plus jobspec packaging — direct scheduler/control-plane competitor and provider target |
| **Northflank** | [`northflank.md`](northflank.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | full-stack PaaS with BYOC and GPU support — mature container PaaS benchmark |
| **Octopus Deploy** | [`octopus-deploy.md`](octopus-deploy.md) | [`delivery-release-gitops`](categories/delivery-release-gitops.md) | overlapping | release orchestration and deployment automation — lesson source for promotion, stage gates and runbooks |
| **Qovery** | [`qovery.md`](qovery.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | direct | BYOC internal developer platform deploying into your own cloud — PaaS/IDP competitor |
| **Radius** | [`radius.md`](radius.md) | [`portable-application-models`](categories/portable-application-models.md) | overlapping | CNCF cloud-native application platform (app graph, Recipes, connections) — borrow-source for recipes and app model |
| **Railway** | [`railway.md`](railway.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | instant-deploy PaaS with a visual canvas and Railway Metal — mainstream PaaS benchmark |
| **Render** | [`render.md`](render.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | unified managed cloud with render.yaml Blueprints — Heroku-successor PaaS benchmark |
| **Rivet** | [`rivet.md`](rivet.md) | [`runtime-substrates`](categories/runtime-substrates.md) | adjacent | open-source Durable Objects / actor runtime — preferred compatible ActorHost resolver |
| **ServerKit** | [`serverkit.md`](serverkit.md) | [`self-hosted-paas`](categories/self-hosted-paas.md) | adjacent | self-hosted open-source server control panel with a Go agent fleet — node-attach/Relay reference |
| **shoo.dev** | [`shoo.md`](shoo.md) | [`identity-networking-delivery`](categories/identity-networking-delivery.md) | complementary | zero-config Google sign-in auth broker (PKCE + ES256/JWKS) — identity integration target |
| **Spin / Fermyon** | [`spin-fermyon.md`](spin-fermyon.md) | [`runtime-substrates`](categories/runtime-substrates.md) | adjacent | wasm serverless framework and hosts — SpinKube is a HoBo component-host adapter |
| **SST** | [`sst.md`](sst.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | direct | infrastructure-from-code full-stack framework on Pulumi/Terraform with typed Linking — close product analog |
| **Supabase** | [`supabase.md`](supabase.md) | [`backend-data-platforms`](categories/backend-data-platforms.md) | adjacent | open-source Postgres BaaS — adjacent platform and possible provider target |
| **Vercel** | [`vercel.md`](vercel.md) | [`cloud-application-platforms`](categories/cloud-application-platforms.md) | overlapping | frontend cloud plus durable Workflow SDK and AI stack — borrow-source promoted to full parity capture |
| **Wasm host landscape** | [`wasm-hosts.md`](wasm-hosts.md) | [`runtime-substrates`](categories/runtime-substrates.md) | adjacent | cohort capture of the wasm component-hosting landscape grounding ADR-0031 component-host adapters |
| **wasmCloud** | [`wasmcloud.md`](wasmcloud.md) | [`runtime-substrates`](categories/runtime-substrates.md) | adjacent | CNCF wasm component runtime (lattice, wRPC, capability providers) — adopted substrate, HoBo's default host |
| **Wasp** | [`wasp.md`](wasp.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | adjacent | Rails-like full-stack framework driven by a declarative .wasp spec — App-Kit inspiration and packaging path |
| **Winglang** | [`winglang.md`](winglang.md) | [`infrastructure-from-code`](categories/infrastructure-from-code.md) | adjacent | cloud-oriented language compiling to Terraform — authoring analog and cautionary tale (Wing Cloud shut down 2025) |

## Alias index

Renamed, acquired, and commonly-abbreviated products resolve to one canonical capture. There are no stub files for old names — look them up here.

| Alias / former name | Canonical capture |
| ------------------- | ----------------- |
| `amplify gen 2` | [AWS Amplify](aws-amplify.md) |
| `citrix adc` | [NetScaler](netscaler.md) |
| `clawdship` | [Anonymous container hosts](anon-container-hosts.md) |
| `dockup` | [Anonymous container hosts](anon-container-hosts.md) |
| `dotnet aspire` | [.NET Aspire](aspire.md) |
| `fermyon` | [Spin / Fermyon](spin-fermyon.md) |
| `flux` | [Flux Network](flux-network.md) |
| `fly` | [Fly.io](flyio.md) |
| `hashicorp nomad` | [Nomad](nomad.md) |
| `kubecost cohort` | [FinOps tooling cohort](finops-tooling.md) |
| `mia platform` | [Mia-Platform](mia-platform.md) |
| `miaplatform` | [Mia-Platform](mia-platform.md) |
| `netscaler adc` | [NetScaler](netscaler.md) |
| `nitrictech` | [Nitric](nitric.md) |
| `nomad pack` | [Nomad](nomad.md) |
| `octopus` | [Octopus Deploy](octopus-deploy.md) |
| `open saas` | [Wasp](wasp.md) |
| `openpouch` | [Anonymous container hosts](anon-container-hosts.md) |
| `opensaas` | [Wasp](wasp.md) |
| `orbit` | [Flux Network](flux-network.md) |
| `radapp` | [Radius](radius.md) |
| `rivetkit` | [Rivet](rivet.md) |
| `runonflux` | [Flux Network](flux-network.md) |
| `spin` | [Spin / Fermyon](spin-fermyon.md) |
| `spinkube` | [Spin / Fermyon](spin-fermyon.md) |
| `spotify backstage` | [Backstage](backstage.md) |
| `sst ion` | [SST](sst.md) |
| `ttl.sh` | [Anonymous container hosts](anon-container-hosts.md) |
| `wasmtime cohort` | [Wasm host landscape](wasm-hosts.md) |
| `wing` | [Winglang](winglang.md) |
| `zerodeploy` | [Anonymous container hosts](anon-container-hosts.md) |

<!-- END GENERATED: competitor-index -->

> `flux` historically pointed at Flux Network (the decentralized container host). It is now an alias, because Flux CD is a different product in a different category. Always link the canonical slug.

## What a capture contains

Each capture follows the **HoBo Competitive Research Contract**: what it is · core primitives · feature surface · architecture · how it competes with HoBo · primitive mapping · where the competitor is stronger · where HoBo is stronger or intentionally different · adversarial critique · better-together posture · threats and lessons · sources. Captures rewritten to that shape are marked `v1` in the [matrix](matrix.md); earlier captures are real, source-backed research queued for rewrite by their own research issue.

Some entries are **cohort** captures (`anon-container-hosts`, `wasm-hosts`, `finops-tooling`) covering a landscape rather than one product; they are superseded section by section as per-product captures land.

HoBo mappings distinguish **implemented** behaviour in `packages/` from **proof/draft** and **design-only** intent. A category row may never imply parity the repository does not have.

➡️ **Cross-competitor [gap analysis](./gap-analysis.md)** — synthesis of where HoBo's design leads, matches, or falls short, with prioritized gaps and recommended design moves.

## Sources & fair use

These are **third-party reference captures for competitive analysis**. Each file links its upstream source (official docs/repos). Excerpts of **factual interface surface** — API signatures, CLI flags, config/schema shapes, short illustrative snippets, and clearly-attributed status quotes — are reproduced under **fair use for commentary, comparison, and interoperability analysis**, deliberately limited to what's needed to map each product to HoBo. All product names, trademarks, documentation, and code remain the property of their respective owners and are governed by their own licenses; nothing here grants rights to that material. If you own one of these works and want an excerpt adjusted or removed, open an issue. These captures are _not_ part of the HoBo product and carry no HoBo license.
