---
type: Reference
title: "Yard bindings, phases & the developer loop"
description: "How the Yard becomes the capability→product binding authority (ADR-0157), how one program runs in plan/init/handle phases (ADR-0158), and how the OOB test harness, CI preview lanes, and default engines (ADR-0159/0160/0161) close the developer-loop bar set by the Alchemy capture."
tags: [hobo, design, yards, bindings, phases, testing]
---

# Yard bindings, phases & the developer loop

How the Yard becomes the capability→product binding authority ([ADR-0157](./adr/07-portability-extensibility.md#adr-0157)), how one program runs in plan/init/handle phases ([ADR-0158](./adr/01-architecture-core.md#adr-0158)), and how the OOB test harness, CI preview lanes, and default engines ([ADR-0159](./adr/07-portability-extensibility.md#adr-0159)/[ADR-0160](./adr/03-data-plane.md#adr-0160)/[ADR-0161](./adr/02-identity-security.md#adr-0161)) close the developer-loop bar set by the [Alchemy capture](../competitors/alchemy.md).

This doc is the narrative home for a coordinated design tranche: the [Alchemy competitor capture](../competitors/alchemy.md) surfaced a shipped articulation of ideas HoBo had distributed across several planes without a single authoring surface. The response is **integration, not imitation** — each borrowed idea lands on existing HoBo machinery (ADR-0151 profiles/bindings, yard-first-placement, ADR-0141 membrane, ADR-0042 fidelity, ADR-0032 migrations, ADR-0038 auth) and keeps HoBo's governance where Alchemy has none.

## 1. The problem, precisely

The [yard-first-placement ADR](./adr/yard-first-placement.md) makes the Yard the provider-selection point, and [Plan 4](./control-plane.md#plan-04) resolves providers by context-matching *under the selected Yard* — the Yard is, by design, **responsible for mapping capabilities to cloud provider offerings**. But that responsibility had no authoring surface: `yard()` carried `provider`, regions, residency, and resolver-slot defaults, while the actual mapping lived in provider default Resource Definitions, Camp `resourceMappings`, platform overrides, and the [ADR-0151](./adr/07-portability-extensibility.md#adr-0151) selection pipeline. Connectivity implementations were documented as Yard-scoped ("only applies inside its own Yard") without the Yard type saying so.

Alchemy's Binding model named the seam: a binding declaration is a **capability contract** ("it names the capability and says nothing about how it's satisfied"); a host-specific implementation decides **how** it's satisfied; deploy-time wiring records permissions + configuration + the typed client; an unsatisfiable binding is an authoring-time error.

## 2. Three bindings, one system

HoBo now has three binding-adjacent nouns, deliberately distinct and now jointly coherent:

| Noun | What it is | Owner |
|---|---|---|
| **Yard binding** | A row in the Yard's **allocatable catalog** — the fact that this Yard *can* satisfy a capability with this offering, **configured this way**: `{profile → product and/or connectivity, + provider-native realization parameters}`. A capability commonly has several rows; declaring one allocates nothing | [ADR-0157](./adr/07-portability-extensibility.md#adr-0157), `yard()` / `defineYard()` authoring |
| **Capability binding** | The portable connection record a *product* emits for consumers (endpoints as non-secret refs, credential `secretRef`s) | [ADR-0151](./adr/07-portability-extensibility.md#adr-0151), `@hobo/bindings` |
| **Binding membrane** | The only delivery path: WIT import → link → provider export → generated `ctx.bindings.*` | [ADR-0141](./adr/02-identity-security.md#adr-0141) |

The pipeline: a Bindle's `.allow()` names the **contract** (what, least-privilege) → the **Yard binding** rows constrain which product/connectivity may satisfy it (how, per Yard) → ADR-0151 selection runs its hard gates + lexicographic ranking under those constraints (`binding.Resolved`) → the product's **Capability binding** is projected through the chosen connectivity implementation into the workload (`binding.Projected`, deploy-time wiring only) → the **membrane** delivers the derived typed client at `ctx.bindings.<alias>` at `init`. Failure anywhere is fail-closed at plan phase (`binding.Unavailable`, composing with the existing `NO_COMPATIBLE_BINDING`/`BINDING_UNAVAILABLE` codes) — HoBo's polyglot answer to Alchemy's "this Layer only works on Workers" type error.

**A Yard is a catalog, not an inventory.** Rows say what this Yard *is able to* allocate — they are not a selection, a mapping, a pool, or a record of anything running. So several rows per capability is the normal case, not an ambiguity to resolve at authoring time: on Azure, `web` legitimately lists Static Web Apps, App Service, Container Apps and AKS, and selection picks among them per resource. Adding a fifth option is a catalog edit, not a deployment change.

Three further rules keep the rows honest, each a correction applied during design review:

- **Rows are a set, not a preference order.** An ordered list would smuggle preference into ranking, which ADR-0151 decision 11 forbids; rows are canonicalized by sort, and duplicate `(profile, productId, connectivityId)` triples are rejected.
- **Provider coherence is resolution-time, not parse-time.** Inferring a product's provider from its id prefix would make a naming convention load-bearing — precisely the external-spec dependency ADR-0144 forbids. Parse checks grammar, shape, credential-shaped properties, and pin/row conflicts; the catalog check happens where the catalog exists.
- **Unmatched rows fail closed with distinguishable reasons** — `YARD_BINDING_PRODUCT_UNKNOWN`, `YARD_BINDING_PROVIDER_MISMATCH`, `YARD_BINDING_EXCLUDED_ALL`. A silently-ignored row would be a portability lie.

Relationship to the pre-existing `resolverDefaults.pins`: pins stay the **resolver-slot** degenerate case (the `event-store` slot); rows are the **capability-profile** plane. The same subject bound by both is a parse-time conflict — a named boundary, not an unnamed mechanism #10.

## 3. The two authoring flows

**Ops manager, day one (`hobo station init`).** Creating a Station seeds a **localhost Yard** (`yard:local`) generated from the host substrate that [ADR-0155](./adr/01-architecture-core.md#adr-0155) capability discovery already inspects: provider `local`, runtime-local component host, and default-provenance Yard binding rows mapping the whole Bindle catalog to local implementations — each row carrying its [ADR-0042](./adr/07-portability-extensibility.md#adr-0042) fidelity label. This promotes the `@hobo/code` `yard:local` precedent into the platform. The seeded Yard is real (`yard.Registered`, PortabilityReport-scored) and dev-grade *by policy*, not special-casing.

**Ops manager, deliberately (SDK).** Authoring a Yard manually is the same act the seed performs: declare a provider and map capabilities to that provider's products —

```ts
yard("prod-east", {
  provider: "aws",
  regions: ["us-east-1"],
  bindings: [
    // Selection: which offering realizes the profile here.
    { profile: "data.postgres/v1", productId: "aws.rds-postgres/v1",
      // Configuration: how it is realized here (provider-native, scored as
      // non-portable surface — never passed through silently).
      properties: { instanceClass: "db.r6g.large", multiAz: true } },
    { profile: "web.hosted/v1", productId: "aws.eks-deployment/v1",
      properties: { replicas: 2, serviceType: "LoadBalancer",
        resources: { limits: { cpu: "250m", memory: "128Mi" } } } },
    { profile: "binding.postgresql/v1", connectivityId: "oci.service-binding-files/v1" },
  ],
})
```

One surface, two provenances (`default` vs `declared`) — first-run and production authoring are the same language.

**Both halves matter, and the split is deliberate.** Alchemy's EKS example maps a workload onto a `Kubernetes.Deployment` *with* its image, replicas, ports and resource limits; a row that could only name the product would push that configuration somewhere else and leave the Yard's stated responsibility half-discharged. So a row carries selection **and** parameters — but the realization *shape* (which provider resources exist, the compiler and executor) stays in the versioned, catalog-hashed **Resource Definition**, and only its *parameters* live on the row. A Yard therefore parameterizes a definition instead of forking a second configuration system (ADR-0145's "no unnamed mechanism #10"), and because those parameters are provider-native by construction they are scored into the **PortabilityReport** with the specific responsible rows named — which is what keeps "unedited Bindle on N clouds" honest. Rows are a set, so two rows disagreeing on one parameter is refused at plan time (`YARD_BINDING_PARAMETER_CONFLICT`) rather than settled by iteration order.

## 4. Phases

[ADR-0158](./adr/01-architecture-core.md#adr-0158) names the axis run-to-collect already implied: **`plan`** (collect + resolve, no unoffered effects) / **`init`** (per **activation**: `ctx.bindings` clients built exactly once, deterministic given projections) / **`handle`** (per request/event, request-scoped context). `hobo dev` is a plan+init loop with a separate dev flag — dev is a mode, not a phase. Phase safety is the split WIT init/handler interfaces: compile-time in typed guests, conformance-time everywhere.

## 5. The developer loop bars

[ADR-0159](./adr/07-portability-extensibility.md#adr-0159) closes the reserved GAP-026 hook with the `@hobo/testing` harness — one call, three lanes (in-process whole-graph on runtime-local; ephemeral-Camp deploy→assert→destroy where stages are Camps `test`/`pr-<n>`; provider scratch harness shared with the generation pipeline's validate step) — plus credentials-as-code CI preview lanes (broker-minted scoped tokens/OIDC, PR-open→deploy/PR-close→destroy, policy-plane prod guard).

The harness's honesty rule is load-bearing: `runtime-local` does not execute real `.wasm` bytes today, so the in-process lane boots the collected graph with local binding resolution and simulated resources, and **every handle carries an ADR-0042 fidelity attestation** (`real | simulated | mocked | camp-only`). A suite resting on `mocked` handles reports a coverage split, never a bare green tick — anything else would re-commit the overclaim GAP-026 exists to prevent. The ephemeral-Camp lane requires an explicit Yard plus credentials and **fails closed** rather than degrading into the in-process lane. Local-dev inner-loop latency and dashboard depth stay owned by [Plan 7](./developer-experience.md#plan-07)/ADR-0109; estate state stays the event-sourced control plane (ADR-0135) — Alchemy's remote state store (DO+SQLite, encrypted, CI-friendly) is noted in the capture as the bar for a hosted state backend, already satisfied structurally by pluggable `EventStore` adapters gated by conformance.

## 6. OOB defaults

[ADR-0160](./adr/03-data-plane.md#adr-0160): `drizzle-kit` becomes the default relational schema-diff engine behind the migration port — deploy-owned generation at plan phase (reviewable `migration.Planned` + content-addressed SQL), apply unchanged (ADR-0032 expand→backfill→contract, forward-only), Drizzle schema modules accepted as authoring input via a thin parse-don't-validate adapter. [ADR-0161](./adr/02-identity-security.md#adr-0161): Better Auth becomes the default *self-hosted full-featured* `hobo:auth` adapter, packaged as an auth bundle over existing ports — relational store via `hobo:data/relational` + gated migrations, signing secret brokered (never state-persisted), routes mounted on `api()`/`web()`, host-portable through the membrane rather than per-platform layers.

## 7. What this deliberately does not change

Selection algebra (ADR-0151 hard gates + lexicographic, no weighted scores); Bindle provider-agnosticism (`bindle-provider-selection-forbidden`); the ADR-0131 two-axis Station/topology model (the Station *seeds* `yard:local`, it does not contain it); the no-Effect-TS public surface (ADR-0136); the fidelity-honesty rules (ADR-0042); forward-only migrations (ADR-0032); the federate+verify auth model (ADR-0038).
