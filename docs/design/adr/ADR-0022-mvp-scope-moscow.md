# ADR-0022 — MVP scope line / MoSCoW mapped to phases

- **Status:** Superseded by [ADR-0063](./ADR-0063-single-v1-scope.md) — HoBo now ships the **whole designed surface as a single v1** (no MVP-at-P4 line, no phase-gated release, no "Won't (v1)" bucket). The P0–P6 sequence survives only as **build stages** of that one v1 ([phases/](../phases/README.md)). The history below is retained for context.
- **Date:** 2026-06-20 (superseded 2026-06-22)
- **Deciders:** Product, Engineering
- **Related:** [ADR-0063](./ADR-0063-single-v1-scope.md) (supersedes this) · [PRD §Release criteria](../../requirements/PRD.md) · [08 v1 delivery plan](../08-roadmap.md) · [phases/](../phases/README.md) · [ADR-0019](./ADR-0019-persona-prioritization-icp.md)

## Context
The PRD enumerates many functional requirements across SDK, CLI, dashboard, AI/agent, Forge, contracts/policy, and platform-engineering surfaces. Without an explicit scope line, "v1" is ambiguous and every `FR` looks mandatory. The roadmap ([08-roadmap.md](../08-roadmap.md)) already sequences capabilities into P0–P6 with exit criteria; we need to bind requirement **priority** to that sequence.

## Decision
Apply **MoSCoW** to functional requirements and define the **MVP (v1 GA) line at the end of P4**, consistent with the co-primary ICP ([ADR-0019](./ADR-0019-persona-prioritization-icp.md)):

- **Must (P0–P4):** local agnostic authoring (`bindle`, IfC, `.allow()`); the runtime primitives (`workflow`/`step`/`actor`/`saga`/`agent`); `hobo dev/plan/deploy/inspect`; the event-sourced Yard with crash-resume + saga compensation; keyless agent identity + token broker; the MCP control surface; Capability Manifest + Registry; **≥2 cloud providers** with mapping rules + `.with(...)`; cross-provider mTLS; conformance suite as the trust boundary.
- **Should (P5):** the Forge (AI-generated providers + stubbable implementations) certified by conformance; richer contracts/`can-deploy`/policy/eval gates beyond the built-in defaults.
- **Could (P6):** multi-region HA, progressive/canary auto-rollback polish, full FinOps (budgets/chargeback), the complete dashboard, platform-engineer Resource Definitions/Matching/Packs at depth.
- **Won't (v1):** general non-developer PaaS UI; replacing Terraform/Pulumi; every cloud on day one ([00-vision.md](../00-vision.md) non-goals); multi-tenant hosted-operator GA features beyond what P6 delivers.

The MVP line is **end of P4** because that is the first point where both halves of the core thesis are proven: *agnostic deploy* (P0–P2/P4) **and** *AI-native operation* (P3). Forge (P5) is the extensibility moat and ships immediately after, but v1 must be credible without it.

## Alternatives considered
- **MVP = end of P2 (one cloud)** — rejected: proves agnostic-deploy but not multi-provider or agent autonomy; "cloud-agnostic" with one cloud is not a credible v1.
- **MVP = end of P5 (include Forge)** — rejected: ties GA to the riskiest/most-novel bet; delays a shippable product.

## Consequences
- **(+)** Each PRD `FR` carries an unambiguous priority and a phase; release criteria per phase ([08](../08-roadmap.md)) become the definition of done.
- **(+)** Engineering can cut P5/P6 scope without touching the v1 commitment.
- **(−)** "v1 needs two clouds + agents + conformance" is a substantial bar; if a phase slips, the MVP line (not the architecture) is what gets re-negotiated. Mitigation: phases are independently iterable ([phases/](../phases/README.md)).
