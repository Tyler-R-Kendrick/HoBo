# HoBo — Requirements Suite

> The **requirements layer** over the [HoBo Design Plan Suite](../design/README.md). Where the design docs (`docs/design/0–36`) explain *how* HoBo works, these three documents state *why* (business), *what* (product), and *how — in requirements terms* (technical) — with stable IDs and end-to-end traceability so business intent, product scope, and engineering work cannot silently drift apart.
>
> **Status:** Draft for review · **Date:** 2026-06-20 · Phase: design.

## Documents

| Doc | Audience | Owns | IDs |
|---|---|---|---|
| [**BRD** — Business Requirements](./BRD.md) | Founders, business, GTM | Problem, market, objectives, business model, KPIs, risks | `BR-NNN` |
| [**PRD** — Product Requirements](./PRD.md) | Product, design, eng leads | Personas, journeys, functional + non-functional requirements, release criteria | `FR-NNN`, `NFR-NNN` |
| [**TRD** — Technical Requirements](./TRD.md) | Engineering, platform, SRE | Architecture, subsystem technical requirements, interfaces, the traceability matrix | `TR-NNN` |

## How they relate (traceability model)
Decided in [ADR-0018](../design/adr/08-scope-and-requirements.md#adr-0018):

```
Business need ──BR──▶ Product capability ──FR / NFR──▶ Technical requirement ──TR──▶ design doc + conformance/verification
```

- Every **BR** maps to ≥1 **FR**/**NFR**; every **FR**/**NFR** maps to ≥1 **TR**; every **TR** cites the governing `docs/design/*` doc and how it's verified ([09](../design/verification.md#plan-09)).
- The authoritative **BR→FR/NFR→TR matrix** lives in [TRD §Traceability](./TRD.md#traceability-matrix).
- Everything is **v1** ([ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063)); **MoSCoW** now expresses **build priority/order within v1** (mapped to the build stages in the [per-stage build detail](../design/roadmap.md#per-stage-build-detail-stages-06)), not a release boundary.
- These docs **cite** the design suite; they do not restate it. The design docs remain the source of design truth.

## Decision log for this suite
Authored alongside the docs (one ADR per load-bearing decision) — see the [ADR index](../design/adr/README.md):
- [ADR-0018](../design/adr/08-scope-and-requirements.md#adr-0018) — requirements structure & traceability
- [ADR-0019](../design/adr/08-scope-and-requirements.md#adr-0019) — persona prioritization / primary ICP
- [ADR-0021](../design/adr/08-scope-and-requirements.md#adr-0021) — NFR baselines / SLOs (Proposed)
- [ADR-0063](../design/adr/08-scope-and-requirements.md#adr-0063) — single v1 scope (whole designed surface ships as one v1; P0–P6 become build stages; supersedes the removed ADR-0022 MVP-scope/MoSCoW line)
- [ADR-0064](../design/adr/08-scope-and-requirements.md#adr-0064) — scope: AI-native meta-cloud (removes business + app-build-out)
- [ADR-0023](../design/adr/02-identity-security.md#adr-0023) — security posture commitments *(from the review/hardening pass)*
- [ADR-0024](../design/adr/07-portability-extensibility.md#adr-0024) — portability conformance guarantee *(from the review/hardening pass)*

## Reading order
New reader: [BRD](./BRD.md) → [PRD](./PRD.md) → [TRD](./TRD.md). For design depth behind any requirement, follow its citation into [`docs/design`](../design/README.md) (start with [10 Architecture](../design/architecture.md#plan-10) and [19 Worked example](../design/worked-example.md#plan-19)).

## Glossary
These docs reuse the canonical vocabulary verbatim — the three nested scopes **`Yard ⊃ Camp ⊃ Bindle`** (Yard = cross-provider policy + control plane; Camp = provider-specific target that provides the durable **runtime ports**; Bindle = app config), Port, Provider, Forge, Grain, Planner, ResourceActor, Executor, SVID, Capability Manifest/Signs, IfC, `.allow()`, `.with(...)`, Manifest IR, Stub, Resource Definition/Matching, Deployment Set/Delta, Gatekeeper, the four-lens taxonomy. *(The vendor-branded "World" was removed; the durable runtime is now a property of a Camp — [ADR-0026](../design/adr/01-architecture-core.md#adr-0026).)* Definitions: [design suite glossary](../design/README.md#glossary--naming-thematic-all-tunable).
