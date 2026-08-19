---
type: Competitive Reference
title: "Cross-category competitor matrix"
description: "Generated cross-category matrix and freshness ledger for the HoBo competitor corpus."
tags: [hobo, competitors, matrix]
---

# Cross-category competitor matrix

> **Generated.** The table below is derived from the `competitor:` front matter of every canonical
> capture under [`docs/competitors/`](index.md). Do not hand-edit between the generated markers —
> change the capture's front matter and run `pnpm run docs:competitors:fix`.
> The schema is defined in [`metadata-contract.md`](metadata-contract.md); category views live in
> [`categories/`](categories/index.md).

## How to read it

- **Directness** — `direct` (substitutes HoBo), `overlapping` (contests some surfaces),
  `adjacent` (informs HoBo, may compose), `complementary` (fronts or plugs into HoBo).
- **Posture** — what HoBo should *do* about it, not what it is.
- **HoBo evidence** — HoBo's own state on the contested surfaces: `implemented`, `proof`,
  `design-only`, `not-present`, or `mixed`. This column is the honesty control: a row may never
  imply parity that `packages/` does not have.
- **Contract** — `v1` once the capture has been rewritten to the twelve-section research contract.
  `pre-v1` captures are real, source-backed research that predate the contract and are queued for
  rewrite by their own research issue; their `mixed` evidence marker is deliberately coarse until then.

<!-- BEGIN GENERATED: competitor-matrix -->

| Competitor | Canonical doc | Aliases | Primary category | All categories | Directness | Contested HoBo surfaces | Posture | HoBo evidence | Product status | Researched | Contract |
| ---------- | ------------- | ------- | ---------------- | -------------- | ---------- | ----------------------- | ------- | ------------- | -------------- | ---------- | -------- |
| **Alchemy** | [`alchemy.md`](alchemy.md) | — | `infrastructure-from-code` | `infrastructure-from-code` · `portable-application-models` | direct | authoring, typed-contracts, reconciliation, extensibility | borrow, benchmark | mixed | active | 2026-08-19 | pre-v1 |
| **Anonymous container hosts** | [`anon-container-hosts.md`](anon-container-hosts.md) | openpouch, clawdship, ttl.sh, zerodeploy, dockup | `cloud-application-platforms` | `cloud-application-platforms` · `self-hosted-paas` | adjacent | provider-matching, delivery | benchmark, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **Antimetal** | [`antimetal.md`](antimetal.md) | — | `agentic-infrastructure` | `agentic-infrastructure` · `finops-governance-placement` | adjacent | observability, agent-surface, finops | benchmark, integrate | mixed | active | 2026-08-12 | pre-v1 |
| **.NET Aspire** | [`aspire.md`](aspire.md) | dotnet aspire | `infrastructure-from-code` | `infrastructure-from-code` · `portable-application-models` · `runtime-substrates` | direct | authoring, app-graph, wiring, environments | borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **AWS Amplify** | [`aws-amplify.md`](aws-amplify.md) | amplify gen 2 | `infrastructure-from-code` | `infrastructure-from-code` · `backend-data-platforms` · `cloud-application-platforms` | overlapping | authoring, typed-contracts, wiring | benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Backstage** | [`backstage.md`](backstage.md) | spotify backstage | `developer-portals-idps` | `developer-portals-idps` | complementary | governance, ecosystem, extensibility | integrate, borrow | mixed | active | 2026-08-12 | pre-v1 |
| **celld** | [`celld.md`](celld.md) | — | `runtime-substrates` | `runtime-substrates` | adjacent | runtime-portability, reconciliation | adopt, provider-target | mixed | active | 2026-08-15 | pre-v1 |
| **Convex** | [`convex.md`](convex.md) | — | `backend-data-platforms` | `backend-data-platforms` | adjacent | typed-contracts, wiring, runtime-portability | borrow, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **Crossplane** | [`crossplane.md`](crossplane.md) | — | `portable-application-models` | `portable-application-models` · `platform-orchestrators` · `hybrid-multicloud-enterprise` | overlapping | typed-contracts, provider-matching, reconciliation, extensibility | borrow, integrate | mixed | active | 2026-08-12 | pre-v1 |
| **Dapr** | [`dapr.md`](dapr.md) | — | `runtime-substrates` | `runtime-substrates` · `portable-application-models` | overlapping | typed-contracts, runtime-portability, wiring, identity-secrets | borrow, standard, integrate | mixed | active | 2026-08-12 | pre-v1 |
| **Encore** | [`encore.md`](encore.md) | — | `infrastructure-from-code` | `infrastructure-from-code` · `cloud-application-platforms` | direct | authoring, app-graph, wiring, environments, delivery | displace, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Facets.cloud** | [`facets.md`](facets.md) | facets cloud | `platform-orchestrators` | `platform-orchestrators` · `portable-application-models` · `hybrid-multicloud-enterprise` | direct | app-graph, environments, provider-matching, governance, extensibility | displace, benchmark, borrow | mixed | active | 2026-08-19 | v1 |
| **FinOps tooling cohort** | [`finops-tooling.md`](finops-tooling.md) | kubecost cohort | `finops-governance-placement` | `finops-governance-placement` | adjacent | finops, governance, provider-matching | benchmark, integrate | mixed | active | 2026-08-12 | pre-v1 |
| **Flux Network** | [`flux-network.md`](flux-network.md) | flux, orbit, runonflux | `cloud-application-platforms` | `cloud-application-platforms` · `runtime-substrates` | adjacent | provider-matching, runtime-portability | provider-target | mixed | active | 2026-08-15 | pre-v1 |
| **Fly.io** | [`flyio.md`](flyio.md) | fly | `cloud-application-platforms` | `cloud-application-platforms` | overlapping | environments, runtime-portability, delivery | provider-target, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Harness Platform** | [`harness.md`](harness.md) | harness.io, harness delegate | `platform-orchestrators` | `platform-orchestrators` · `delivery-release-gitops` · `developer-portals-idps` · `finops-governance-placement` | overlapping | delivery, governance, environments, finops, extensibility, observability | benchmark, borrow, integrate | mixed | active | 2026-08-19 | v1 |
| **Heroku** | [`heroku.md`](heroku.md) | — | `cloud-application-platforms` | `cloud-application-platforms` | overlapping | authoring, environments, delivery, ecosystem | benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Humanitec** | [`humanitec.md`](humanitec.md) | — | `platform-orchestrators` | `platform-orchestrators` · `portable-application-models` | direct | app-graph, environments, provider-matching, governance | displace, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **InsForge** | [`insforge.md`](insforge.md) | — | `backend-data-platforms` | `backend-data-platforms` · `agentic-infrastructure` | adjacent | agent-surface, typed-contracts | benchmark, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **Lakebed** | [`lakebed.md`](lakebed.md) | — | `cloud-application-platforms` | `cloud-application-platforms` · `agentic-infrastructure` | direct | agent-surface, authoring, delivery | displace | mixed | active | 2026-08-12 | pre-v1 |
| **Mia-Platform** | [`mia-platform.md`](mia-platform.md) | mia platform, miaplatform | `platform-orchestrators` | `platform-orchestrators` · `developer-portals-idps` · `hybrid-multicloud-enterprise` | direct | app-graph, environments, governance, agent-surface, extensibility, delivery | displace, benchmark, borrow | mixed | active | 2026-08-19 | v1 |
| **Modal** | [`modal.md`](modal.md) | — | `cloud-application-platforms` | `cloud-application-platforms` · `runtime-substrates` | adjacent | runtime-portability, provider-matching | provider-target, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Netlify** | [`netlify.md`](netlify.md) | — | `cloud-application-platforms` | `cloud-application-platforms` | overlapping | delivery, environments | benchmark, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **NetScaler** | [`netscaler.md`](netscaler.md) | citrix adc, netscaler adc | `identity-networking-delivery` | `identity-networking-delivery` | complementary | governance, identity-secrets | provider-target, borrow | mixed | active | 2026-08-12 | pre-v1 |
| **Nitric** | [`nitric.md`](nitric.md) | nitrictech | `infrastructure-from-code` | `infrastructure-from-code` · `portable-application-models` | overlapping | authoring, typed-contracts, provider-matching, runtime-portability | borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Nomad** | [`nomad.md`](nomad.md) | nomad pack, hashicorp nomad | `runtime-substrates` | `runtime-substrates` · `platform-orchestrators` | overlapping | provider-matching, runtime-portability, reconciliation | borrow, provider-target, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Northflank** | [`northflank.md`](northflank.md) | — | `cloud-application-platforms` | `cloud-application-platforms` · `self-hosted-paas` | overlapping | environments, delivery, governance | benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Octopus Deploy** | [`octopus-deploy.md`](octopus-deploy.md) | octopus | `delivery-release-gitops` | `delivery-release-gitops` | overlapping | delivery, governance, environments | borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Qovery** | [`qovery.md`](qovery.md) | — | `cloud-application-platforms` | `cloud-application-platforms` · `platform-orchestrators` | direct | environments, delivery, provider-matching | displace, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Radius** | [`radius.md`](radius.md) | radapp | `portable-application-models` | `portable-application-models` · `platform-orchestrators` | overlapping | app-graph, typed-contracts, environments | borrow | mixed | active | 2026-08-12 | pre-v1 |
| **Railway** | [`railway.md`](railway.md) | — | `cloud-application-platforms` | `cloud-application-platforms` | overlapping | authoring, environments, delivery | benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Render** | [`render.md`](render.md) | — | `cloud-application-platforms` | `cloud-application-platforms` | overlapping | authoring, environments, delivery | benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Rivet** | [`rivet.md`](rivet.md) | rivetkit | `runtime-substrates` | `runtime-substrates` | adjacent | runtime-portability, replay-migration | adopt, provider-target | mixed | active | 2026-08-15 | pre-v1 |
| **ServerKit** | [`serverkit.md`](serverkit.md) | — | `self-hosted-paas` | `self-hosted-paas` · `identity-networking-delivery` | adjacent | delivery, observability, identity-secrets | benchmark, borrow | mixed | active | 2026-08-12 | pre-v1 |
| **shoo.dev** | [`shoo.md`](shoo.md) | — | `identity-networking-delivery` | `identity-networking-delivery` | complementary | identity-secrets | integrate, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **Spin / Fermyon** | [`spin-fermyon.md`](spin-fermyon.md) | spin, spinkube, fermyon | `runtime-substrates` | `runtime-substrates` | adjacent | runtime-portability, extensibility | adopt, render-target | mixed | active | 2026-08-12 | pre-v1 |
| **SST** | [`sst.md`](sst.md) | sst ion | `infrastructure-from-code` | `infrastructure-from-code` · `portable-application-models` | direct | authoring, typed-contracts, wiring, environments | displace, borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Supabase** | [`supabase.md`](supabase.md) | — | `backend-data-platforms` | `backend-data-platforms` | adjacent | typed-contracts, identity-secrets | provider-target, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Vercel** | [`vercel.md`](vercel.md) | — | `cloud-application-platforms` | `cloud-application-platforms` · `agentic-infrastructure` | overlapping | delivery, environments, agent-surface | benchmark, borrow, provider-target | mixed | active | 2026-08-12 | pre-v1 |
| **Wasm host landscape** | [`wasm-hosts.md`](wasm-hosts.md) | wasmtime cohort | `runtime-substrates` | `runtime-substrates` | adjacent | runtime-portability, extensibility | adopt, render-target | mixed | active | 2026-08-12 | pre-v1 |
| **wasmCloud** | [`wasmcloud.md`](wasmcloud.md) | — | `runtime-substrates` | `runtime-substrates` | adjacent | runtime-portability, extensibility, typed-contracts | adopt, standard | mixed | active | 2026-08-12 | pre-v1 |
| **Wasp** | [`wasp.md`](wasp.md) | open saas, opensaas | `infrastructure-from-code` | `infrastructure-from-code` · `backend-data-platforms` | adjacent | authoring, app-graph | borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |
| **Winglang** | [`winglang.md`](winglang.md) | wing | `infrastructure-from-code` | `infrastructure-from-code` | adjacent | authoring, typed-contracts | borrow, benchmark | mixed | active | 2026-08-12 | pre-v1 |

### Freshness ledger

Captures are considered stale after 180 days. Staleness never fails the build — it schedules refresh work.

| Competitor | Researched | Age (days) | State |
| ---------- | ---------- | ---------- | ----- |
| [Anonymous container hosts](anon-container-hosts.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Antimetal](antimetal.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [.NET Aspire](aspire.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [AWS Amplify](aws-amplify.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Backstage](backstage.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Convex](convex.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Crossplane](crossplane.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Dapr](dapr.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Encore](encore.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [FinOps tooling cohort](finops-tooling.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Fly.io](flyio.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Heroku](heroku.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Humanitec](humanitec.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [InsForge](insforge.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Lakebed](lakebed.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Modal](modal.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Netlify](netlify.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [NetScaler](netscaler.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Nitric](nitric.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Nomad](nomad.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Northflank](northflank.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Octopus Deploy](octopus-deploy.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Qovery](qovery.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Radius](radius.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Railway](railway.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Render](render.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [ServerKit](serverkit.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [shoo.dev](shoo.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Spin / Fermyon](spin-fermyon.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [SST](sst.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Supabase](supabase.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Vercel](vercel.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Wasm host landscape](wasm-hosts.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [wasmCloud](wasmcloud.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Wasp](wasp.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [Winglang](winglang.md) | 2026-08-12 | 7 | pre-v1 — rewrite to contract |
| [celld](celld.md) | 2026-08-15 | 4 | pre-v1 — rewrite to contract |
| [Flux Network](flux-network.md) | 2026-08-15 | 4 | pre-v1 — rewrite to contract |
| [Rivet](rivet.md) | 2026-08-15 | 4 | pre-v1 — rewrite to contract |
| [Alchemy](alchemy.md) | 2026-08-19 | 0 | pre-v1 — rewrite to contract |
| [Facets.cloud](facets.md) | 2026-08-19 | 0 | fresh |
| [Harness Platform](harness.md) | 2026-08-19 | 0 | fresh |
| [Mia-Platform](mia-platform.md) | 2026-08-19 | 0 | fresh |

_43 canonical captures across 13 categories; 3 at contract v1._

<!-- END GENERATED: competitor-matrix -->
