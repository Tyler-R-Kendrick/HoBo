---
layout: ../../layouts/Docs.astro
title: Repository map
description: Where everything lives in the HoBo repo — design suite, proofs, packages, plans, competitor research, and agent tooling.
---

# Repository map

| Path | What it is |
|---|---|
| [`docs/design/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/index.md) | The current design suite: capability docs, ADRs, CLI spec, traceability, glossary, event-family catalog. **Canonical.** |
| [`docs/design/adr/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/adr/index.md) | Decisions as four thematic ADR volumes; each decision is a stable `#adr-NNNN` anchor. |
| [`docs/design/proofs/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/docs/design/proofs) | Human-readable proof records linked to executable draft packages. |
| [`src/draft/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/src/draft) | Executable draft taxonomy: `technical-proofs/`, `exp-proofs/`, `epic-proofs/`, `projects/`. Design proof material — not production code. |
| [`packages/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/packages) | The production `@hobo/*` workspace scaffold: core, wit, bindles, runtime, componentize, conformance, cli, and category containers (`runtimes/`, `providers/`, `iac/`). |
| [`examples/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/examples) | Runnable examples — `hello-bindle` is the reference consumer for the protobuf/CUE/PACT pattern. |
| [`docs/implementation-plan.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/implementation-plan.md) | Durable mirror of the Linear backlog structure (Linear is the live source). |
| [`docs/competitors/`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/competitors/index.md) | 30+ competitor captures, each ending in a `#hobo-mapping` parity section, plus a cross-competitor gap analysis. |
| [`docs/plans/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/docs/plans) | Audit/review logs and improvement plans from the `/improve` tooling. |
| [`docs/standards/`, `docs/technologies/`, `docs/patterns/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/docs) | Reference material used by design decisions. |
| [`docs/archive/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/docs/archive) | Deferred or superseded planning artifacts (roadmap, BRD/PRD/TRD requirements suite). |
| [`GAPS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/GAPS.md) | Long-running intent-alignment gap register (Nomad × Aspire × Nitric × FinOps × agent-native). |
| [`AGENTS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/AGENTS.md), [`docs/agent-tooling.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/agent-tooling.md) | Agent instructions and the agent-tooling reference. |
| [`scripts/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/scripts) | The validation gates — ordinary Node/TypeScript scripts that run locally, in CI, and in agent sessions. |
| [`site/`](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/site) | This website (Astro, static, self-contained pnpm project). |
| `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` | Community-health docs. |

## Reading paths

**New to the project:** [vision](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/vision.md) → [architecture](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/architecture.md) → [worked example](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/worked-example.md) → [walkthrough](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/walkthrough.md) (or the condensed [Guide](/HoBo/guide/) on this site).

**Implementing a slice:** the Linear issue / implementation plan → the matching design doc → the proof note → the [architecture rules](/HoBo/agents/rules/) → update the proof package and docs in the same change.

**Reviewing architecture:** [ADR index](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/adr/index.md) → [traceability](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/traceability.md) → [CLI spec](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/cli-spec.md) → [SDK contracts](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/sdk-contracts.md).
