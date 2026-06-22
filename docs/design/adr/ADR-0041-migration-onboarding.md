# ADR-0041 — Migration & onboarding (adopt-in-place)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 3 — Providers/IaC](../03-providers-iac.md) (Pulumi Automation API, CDKTF import-only) · [Plan 15 — CLI/DX](../15-cli-dx.md) · [Plan 8 — Roadmap](../08-roadmap.md) · [Plan 17 — Positioning](../17-positioning-competitive.md) (vs Lakebed) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md) (Forge-generated importers) · [Plan 9 — Verification](../09-verification-open-questions.md) · [ADR-0006](../18-adr-log.md) (Pulumi Automation API) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (#19)
- **Origin:** open question #19 — bridges from Lakebed (Capsule→Bindle), Terraform/Pulumi (import), and FaaS so HoBo isn't greenfield-only. Designed via brainstorming + grill-with-docs.

## Context
HoBo already has the *primitives* for adoption — the **Pulumi Automation API** as primary IaC ([ADR-0006](../18-adr-log.md)), **CDKTF import-only** ("read existing stacks, don't author new", [Plan 3](../03-providers-iac.md) §IaC adapters), and OpenTofu state backends — but no **onboarding journey**: how an existing app/infra estate moves onto HoBo *incrementally*, without a greenfield rewrite. This is adoption-critical: teams have Terraform/Pulumi estates, Lakebed Capsules, and FaaS deployments; HoBo must meet them where they are.

## Decision
1. **`hobo import` adopts existing infra/code in place.** A command family reads an existing estate into HoBo's resource graph: `hobo import terraform|pulumi|opentofu <state>` (via the existing CDKTF import-only + Pulumi Automation API), `hobo import lakebed` (Capsule→Bindle mapping), `hobo import faas` (wrap existing functions). Imported resources become **`adopted` existing nodes** in the Planner DAG — managed by id/state, **never destroyed/recreated on import** (drift-detect only, [Plan 5](../05-reliability-ha.md)).
2. **Brownfield coexistence (strangler-fig).** HoBo can **reference un-managed external resources** via an **`external` resource kind**, so a half-migrated app works (a HoBo-managed `api` binds to a `db` still living in Terraform). Teams migrate incrementally and strangle the old stack over time; nothing is big-bang.
3. **Importer breadth via the Forge.** Ship **reference importers** (Terraform/Pulumi/OpenTofu state, Lakebed Capsule, generic FaaS) with documented mappings; an importer is a transform the **Forge can generate** ([Plan 33](../33-forge-generation-pipeline.md)) for a new source, gated by a **round-trip/idempotence conformance test** (import → plan → no-op diff) — so onboarding breadth isn't human-bottlenecked, exactly like provider generation.
4. **Event:** `resource.Adopted` (an existing resource brought under management + its source/provenance), distinct from `resource.Provisioned`.

## Alternatives considered
- **Source codemod / transpile to the HoBo SDK.** Rejected as the strategy: brittle across languages/frameworks, hard to keep correct, and forces a big-bang rewrite before any value. (HoBo may still *suggest* SDK code, but adoption doesn't depend on it.)
- **Greenfield only (docs/patterns, no tooling).** Rejected: leaves HoBo greenfield-only — the exact adoption gap #19 names.
- **All-or-nothing import.** Rejected: high friction; a large estate becomes a stalled all-or-nothing project. Incremental adopt + coexist is the lower-risk path.
- **Hand-written importers only.** Rejected as the ceiling (kept as the reference set): caps breadth at team capacity; Forge-generated importers cover the long tail under the same conformance trust boundary.

## Consequences
- **(+)** Closes #19: existing TF/Pulumi/Lakebed/FaaS estates move onto HoBo **incrementally**, adopting in place and coexisting with un-migrated infra — a real migration story, not greenfield-only.
- **(+)** Reuses the Pulumi Automation API + CDKTF import-only ([Plan 3](../03-providers-iac.md)), drift detection ([Plan 5](../05-reliability-ha.md)), and the Forge + conformance boundary ([Plan 33](../33-forge-generation-pipeline.md)/[Plan 9](../09-verification-open-questions.md)) — the new surface is the `import` command family, an `external`/`adopted` resource kind, and one event.
- **(+)** Strengthens positioning vs Lakebed (no incremental migration) and raw IaC ([Plan 17](../17-positioning-competitive.md)).
- **(−)** Adopting heterogeneous estates means importer mapping fidelity is ongoing work; a Forge-generated importer is only as trusted as its round-trip conformance test.
- **(−)** `external` references span a trust/lifecycle boundary HoBo doesn't fully control (the un-managed resource can drift outside HoBo); `hobo doctor` should flag long-lived `external` deps as migration debt.
