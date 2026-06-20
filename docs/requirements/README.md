# HoBo — Requirements Suite

> The **requirements layer** over the [HoBo Design Plan Suite](../design/README.md). Where the design docs (`docs/design/0–30`) explain *how* HoBo works, these three documents state *why* (business), *what* (product), and *how — in requirements terms* (technical) — with stable IDs and end-to-end traceability so business intent, product scope, and engineering work cannot silently drift apart.
>
> **Status:** Draft for review · **Date:** 2026-06-20 · Phase: design.

## Documents

| Doc | Audience | Owns | IDs |
|---|---|---|---|
| [**BRD** — Business Requirements](./BRD.md) | Founders, business, GTM | Problem, market, objectives, business model, KPIs, risks | `BR-NNN` |
| [**PRD** — Product Requirements](./PRD.md) | Product, design, eng leads | Personas, journeys, functional + non-functional requirements, release criteria | `FR-NNN`, `NFR-NNN` |
| [**TRD** — Technical Requirements](./TRD.md) | Engineering, platform, SRE | Architecture, subsystem technical requirements, interfaces, the traceability matrix | `TR-NNN` |

## How they relate (traceability model)
Decided in [ADR-0018](../design/adr/ADR-0018-requirements-structure-and-traceability.md):

```
Business need ──BR──▶ Product capability ──FR / NFR──▶ Technical requirement ──TR──▶ design doc + conformance/verification
```

- Every **BR** maps to ≥1 **FR**/**NFR**; every **FR**/**NFR** maps to ≥1 **TR**; every **TR** cites the governing `docs/design/*` doc and how it's verified ([09](../design/09-verification-open-questions.md)).
- The authoritative **BR→FR/NFR→TR matrix** lives in [TRD §Traceability](./TRD.md#traceability-matrix).
- Priorities use **MoSCoW** bound to roadmap phases P0–P6 ([ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md)).
- These docs **cite** the design suite; they do not restate it. The design docs remain the source of design truth.

## Decision log for this suite
Authored alongside the docs (one ADR per load-bearing decision) — see the [ADR index](../design/adr/README.md):
- [ADR-0018](../design/adr/ADR-0018-requirements-structure-and-traceability.md) — requirements structure & traceability
- [ADR-0019](../design/adr/ADR-0019-persona-prioritization-icp.md) — persona prioritization / primary ICP
- [ADR-0020](../design/adr/ADR-0020-monetization-model.md) — monetization model
- [ADR-0021](../design/adr/ADR-0021-nfr-baselines-slos.md) — NFR baselines / SLOs (Proposed)
- [ADR-0022](../design/adr/ADR-0022-mvp-scope-moscow.md) — MVP scope / MoSCoW
- [ADR-0023](../design/adr/ADR-0023-security-posture-commitments.md) — security posture commitments *(from the review/hardening pass)*
- [ADR-0024](../design/adr/ADR-0024-portability-conformance-guarantee.md) — portability conformance guarantee *(from the review/hardening pass)*

## Reading order
New reader: [BRD](./BRD.md) → [PRD](./PRD.md) → [TRD](./TRD.md). For design depth behind any requirement, follow its citation into [`docs/design`](../design/README.md) (start with [10 Architecture](../design/10-architecture-overview.md) and [19 Worked example](../design/19-worked-example.md)).

## Glossary
These docs reuse the canonical vocabulary verbatim — Bindle, Camp, World, Port, Provider, the Yard, Forge, Grain, Planner, ResourceActor, Executor, SVID, Hobo Code/Signs, IfC, `.allow()`, `.with(...)`, Manifest IR, Stub, Resource Definition/Matching, Deployment Set/Delta, Gatekeeper, the four-lens taxonomy. Definitions: [design suite glossary](../design/README.md#glossary--naming-thematic-all-tunable).
