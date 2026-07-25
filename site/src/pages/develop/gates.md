---
layout: ../../layouts/Docs.astro
title: Checks & CI gates
description: "Every gate that protects the HoBo repo — what it checks, when it runs, and the CI lanes that mirror the local commands."
---

# Checks & CI gates

Core checks are intentionally **ordinary Node scripts**, so the same command runs locally, in CI, and inside agent sessions. The impact-scoped entry point is `pnpm agent:check` — it routes a diff to the smallest relevant set of lanes.

## The local gates

| Command | Protects |
|---|---|
| `pnpm run architecture:guard` | PACT / protobuf / CUE / parse-don't-validate / event-architecture evidence in changed implementation packages. |
| `pnpm run standards:check` | TypeScript-first policy, canonical Protobuf/CUE/PACT guidance, no new vanilla JS implementation files. |
| `pnpm run konsistent` | Structural package layout: every package pairs `src/`, `test/`, `contracts/`, `data-models/`. |
| `pnpm run codegen:check` | Generated protobuf types match their `.proto` sources (drift gate). |
| `pnpm run docs:cli-lint` | Markdown `hobo` examples use only canonical CLI verbs. |
| `pnpm run docs:design-lint` | Glossary duplicates, broken links/anchors, unindexed ADR references, event families outside the catalog. |
| `pnpm run docs:coverage` | Required docs (community-health + maintenance set) exist. |
| `pnpm run docs:freshness` | Implementation-facing changes carry a documentation update. |
| `pnpm run docs:okf` | Open Knowledge Format frontmatter on concept docs and skill reference bundles. |
| `pnpm run draft:artifacts` / `draft:cascade` | Proof packages carry their required executed artifacts; proof changes cascade to referencing rollups. |
| `pnpm run promotions:check` | Frozen (promoted) proofs are not edited after promotion. |
| `validate-traceability` / `validate-sdk-contracts` / `validate-deployment-set-delta` | ADR/plan → backlog coverage; canonical SDK signatures; deployment-set delta contract. |
| `pnpm run actions:lint` | Workflow hygiene: checkout-before-setup-node, pnpm-only installs, Node 24 pinned. |

## Pre-commit

`pnpm run prepare-hooks` wires `.githooks/pre-commit`, which runs `check:relevant:staged`: the staged architecture guard first (cheap, catches missing contract evidence early), then the narrowest relevant test/docs/traceability lanes. The hook auto-installs on `pnpm install`; skipped in CI or with `HOBO_SKIP_HOOKS`.

## CI lanes

| Workflow | What it does |
|---|---|
| **HoBo CI Fabric** (`hobo-ci.yml`) | The PR impact gate (`pnpm agent:check` against the base branch + affected package lanes), the full main gate, contract guard, and secret scan. |
| **Fixture lanes** (`fixtures.yml`) | Label/schedule/manual **cost-gated** cloud fixture jobs (hello-bindle, multi-cloud-shop, S4 drill) — label adds don't re-run the whole PR gate. |
| **Examples E2E** (`examples-e2e.yml`) | Simulate-mode hello-bindle fixture lanes, also label/schedule/manual gated. |
| **Stage gates** (`stage-gate-s0.yml`, `s1-` … `s3-stage-gate.yml`) | Keep each accepted build stage's acceptance record executable. |
| **Pages deploy** (`deploy-pages.yml`) | Builds `site/` and publishes this website to GitHub Pages on pushes to `main`. |

## Philosophy

Prefer **compile-time, codegen, CUE, conformance, and contract-test feedback before runtime error discovery**. Treat typecheck, generated-contract, CUE, conformance, and PACT failures as design feedback, not cleanup. And validation failure is never an acceptable completion state — fix it or report blocked.
