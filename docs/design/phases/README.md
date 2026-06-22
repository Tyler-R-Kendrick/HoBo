# HoBo — Phased build plan (every phase, every step)

> Part of the [HoBo Design Plan Suite](../README.md). This expands the [roadmap](../08-roadmap.md) into a stepwise, executable breakdown. Each phase doc lists objective, dependencies, **numbered workstreams + steps**, deliverables, exit criteria (acceptance tests), and risks. Docs only — these describe *what to build*, not code.

## Phases
| Phase | Theme | Doc |
|---|---|---|
| **P0** | Foundations (monorepo, core contracts, WIT, local runtime, conformance) | [`P0-foundations.md`](./P0-foundations.md) |
| **P1** | SDK on the local runtime (IfC authoring + runtime + components) | [`P1-sdk-local.md`](./P1-sdk-local.md) |
| **P2** | First real deploy (one provider, Yard MVP) | [`P2-first-deploy.md`](./P2-first-deploy.md) |
| **P3** | AI-native core (identity, registry, Capability Manifest, agents, MCP) | [`P3-ai-native.md`](./P3-ai-native.md) |
| **P4** | Multi-provider + wiring depth | [`P4-multi-provider.md`](./P4-multi-provider.md) |
| **P5** | Forge (AI-generated providers + implementations) | [`P5-forge.md`](./P5-forge.md) |
| **P6** | HA, FinOps & UX | [`P6-ha-finops-ux.md`](./P6-ha-finops-ux.md) |

## Dependency flow
```mermaid
flowchart LR
  P0[P0 Foundations] --> P1[P1 SDK local]
  P1 --> P2[P2 First deploy]
  P2 --> P3[P3 AI-native]
  P2 --> P4[P4 Multi-provider]
  P3 --> P5[P5 Forge]
  P4 --> P5
  P5 --> P6[P6 HA / FinOps / UX]
  P4 --> P6
```

## How to read a phase doc
- **Objective / Depends on** — the one-line goal and prerequisites.
- **Workstreams** — numbered; each contains ordered **steps** with the packages ([Plan 1](../01-monorepo.md)) and design docs they realize.
- **Deliverables** — the concrete artifacts the phase produces.
- **Exit criteria** — acceptance tests that must pass to call the phase done ([Plan 9](../09-verification-open-questions.md)).
- **Risks / iteration hooks** — what could go wrong and what's deferred.

## Conventions used across phases
- **port = WIT interface** ([Plan 20](../20-wasm-wasi-runtime.md), reference: [Plan 24](../24-wit-interfaces-reference.md)) · **provider = capability provider** · **bind = link** · **service = wasm component (default), OCI-container fallback**.
- Every adapter ships against `@hobo/conformance`; examples double as E2E fixtures.
- Each phase is independently demoable and commits behind it must keep prior exit criteria green (no regressions).
