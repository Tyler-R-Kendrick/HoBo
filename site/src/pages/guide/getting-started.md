---
layout: ../../layouts/Docs.astro
title: Getting started
description: Clone the HoBo repo, install the toolchain, run the validation gates, and find your way around the design suite and executable proofs.
---

# Getting started

HoBo is in its design phase, so "getting started" means getting productive **in the repository**: reading the design, running the gates, and exploring the executable proofs. There is no hosted service to sign up for yet.

## Prerequisites

- **Node.js** ≥ 20.20 locally (CI runs Node 24 — match it for exact parity).
- **pnpm** via Corepack (the repo pins the version in `package.json`).
- Git, and optionally a coding agent — the repo is [wired for them](/HoBo/agents/).

## Clone and install

```sh
git clone https://github.com/Tyler-R-Kendrick/HoBo.git
cd HoBo
corepack enable pnpm
pnpm run install:check     # frozen-lockfile install
pnpm run ci:preflight      # verifies the toolchain wiring
pnpm run doctor            # environment diagnostics
```

## Run the core gate

These are the same ordinary Node scripts CI runs, so they work locally, in CI, and inside agent sessions:

```sh
pnpm run architecture:guard   # PACT/protobuf/CUE/event-architecture evidence
pnpm test                     # unit suite
pnpm run standards:check      # TypeScript-first + contract-first standards
pnpm run docs:cli-lint        # CLI examples use only canonical hobo verbs
pnpm run docs:design-lint     # glossary/anchor/link integrity in the design suite
pnpm run docs:coverage        # required docs exist
pnpm run docs:okf             # Open Knowledge Format metadata
pnpm run docs:freshness       # code changes carry doc changes
```

Optional but recommended — the pre-commit hook that runs the staged variants automatically:

```sh
pnpm run prepare-hooks
```

## Explore the design

The suggested reading order for newcomers:

1. [Vision](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/vision.md) — product intent, positioning, principles.
2. [Architecture](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/architecture.md) — reference architecture and package layout.
3. [Worked example](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/worked-example.md) — one app moving through the system.
4. [Walkthrough](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/docs/design/walkthrough.md) — role-based flows for app dev, platform, GitOps, SecOps, DevOps, and SRE.

Or stay on this site for the condensed versions: [Core concepts](/HoBo/guide/concepts/) and [Architecture](/HoBo/guide/architecture/).

## Run something real

The `examples/hello-bindle` workspace is a minimal, fully-gated example: a Hono API and web app wired through a provider-agnostic Bindle, with protobuf-generated types, CUE constraints, PACT contracts, and tests.

```sh
pnpm exec turbo run test --filter ./examples/hello-bindle
```

Draft proof packages under `src/draft/<kind>/<slug>` are executable design claims — each has a README explaining what it proves and how to run it. Start from the [draft taxonomy README](https://github.com/Tyler-R-Kendrick/HoBo/tree/main/src/draft).

## Working with an AI agent?

Point it at [`AGENTS.md`](https://github.com/Tyler-R-Kendrick/HoBo/blob/main/AGENTS.md) first — it's the repo's contract for agents — then see the [agent docs](/HoBo/agents/) on this site for the tooling, skills, and guardrails.
