# HoBo

**HoBo is a design-first meta-cloud project for deploying one application shape onto many real infrastructure shapes.**

A developer or agent should be able to describe an app once, then let HoBo place it on a provider, mix of providers, or self-hosted yard without rewriting app code. The design uses **WIT/WASM Component Model interfaces** as the portable membrane, provider adapters as the integration boundary, and an event-sourced control plane as the operating model.

> **Current state:** active design + executable contract/proof repository. This is not a shipped HoBo product yet. The repo contains design docs, ADRs, backlog mirrors, validation scripts, and `src/draft/*` proof/contract packages that pin behavior before production implementation.

## Why HoBo exists

Modern app teams still choose between two bad defaults:

1. **Closed PaaS:** easy deploys, but lock-in and limited escape hatches.
2. **Raw cloud/IaC:** full control, but every app team becomes a platform team.

HoBo's goal is a third path: **cloud portability without hiding the cloud**.

- Start with provider-agnostic application intent.
- Let HoBo choose or reconcile infrastructure from policy, cost, compliance, and reliability goals.
- Drop down to typed provider-specific options when optimization matters.
- Keep humans and AI agents on the same authenticated, auditable control surface.

## Core ideas

| Idea | Meaning |
|---|---|
| **Bindle** | Application package/topology: services, resources, wiring, policies, and deployment intent. |
| **Camp** | Provider-specific runtime target that hosts workloads and provides durable runtime ports. |
| **Yard** | Provider-specific control scope spanning Camps, policy, identity, and reconciliation. |
| **Junction** | Cross-Yard federation layer for hybrid or multi-cloud operation. |
| **WIT/WASM membrane** | Portable contract between app code, runtime ports, and provider adapters. TypeScript is first, not exclusive. |
| **Ports and adapters** | Cloud providers, IaC engines, build tools, identity systems, and AI optimizers sit behind replaceable ports. |
| **Replayable event log** | Control-plane state, projections, SRE workflows, and audit trails derive from events. |
| **Agent-native auth** | AI agents are first-class principals with scoped credentials, policy checks, and traceable actions. |

Canonical terminology lives in [`docs/design/glossary.md`](./docs/design/glossary.md). The high-level design starts in [`docs/design/vision.md`](./docs/design/vision.md).

## Repository map

| Path | What it is |
|---|---|
| [`docs/`](./docs/index.md) | OKF bundle root for HoBo docs; `index.md` files provide directory listings and concept docs carry OKF frontmatter. |
| [`docs/design/`](./docs/design/index.md) | Current design suite: capability docs, ADRs, CLI spec, traceability, glossary, event-family catalog. |
| [`src/draft/`](./src/draft/) | Executable proof/contract packages for individual backlog slices and design claims. These are draft fixtures, not a production product. |
| [`docs/design/proofs/`](./docs/design/proofs/) | Human-readable proof records linked to `src/draft/*` packages. |
| [`docs/implementation-plan.md`](./docs/implementation-plan.md) | Durable mirror of the Linear backlog structure. Linear remains live status source. |
| [`docs/competitors/`](./docs/competitors/index.md) | Competitive analysis and positioning notes. |
| [`docs/standards/`](./docs/standards/index.md), [`docs/technologies/`](./docs/technologies/index.md), [`docs/patterns/`](./docs/patterns/index.md) | Reference material used by design decisions. |
| [`docs/archive/`](./docs/archive/) | Deferred or superseded planning artifacts. |
| [`AGENTS.md`](./AGENTS.md), [`docs/agent-tooling.md`](./docs/agent-tooling.md) | Repo-level agent instructions and local agent-tooling reference. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`SECURITY.md`](./SECURITY.md), [`SUPPORT.md`](./SUPPORT.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) | GitHub community-health docs for contributions, vulnerability reporting, support, and conduct. |

## Suggested reading paths

### If you are new

1. [`docs/design/vision.md`](./docs/design/vision.md) — product intent, boundaries, and positioning.
2. [`docs/design/architecture.md`](./docs/design/architecture.md) — reference architecture and package layout.
3. [`docs/design/worked-example.md`](./docs/design/worked-example.md) — one app moving through the system.
4. [`docs/design/walkthrough.md`](./docs/design/walkthrough.md) — role-based flows for app dev, platform, GitOps, SecOps, DevOps, and SRE.

### If you are implementing a slice

1. Start from the relevant Linear issue or [`docs/implementation-plan.md`](./docs/implementation-plan.md).
2. Read the matching design doc in [`docs/design/`](./docs/design/index.md).
3. Check the corresponding proof note under [`docs/design/proofs/`](./docs/design/proofs/).
4. Update or add the `src/draft/*` contract package that proves the slice.
5. Update docs in the same change so the repo continues to describe reality.

### If you are reviewing architecture

- ADR index: [`docs/design/adr/index.md`](./docs/design/adr/index.md)
- Traceability gate: [`docs/design/traceability.md`](./docs/design/traceability.md)
- CLI surface: [`docs/design/cli-spec.md`](./docs/design/cli-spec.md)
- SDK contracts: [`docs/design/sdk-contracts.md`](./docs/design/sdk-contracts.md)
- Package namespaces: [`docs/design/package-namespaces.md`](./docs/design/package-namespaces.md)

## How to work in this repo

### Requirements

- Node.js 24, matching CI.
- npm, using the checked-in `package-lock.json`.

Install dependencies:

```sh
npm ci
```

Run the core local gate:

```sh
npm test
npm run docs:cli-lint
npm run docs:design-lint
npm run docs:coverage
npm run docs:okf
npm run docs:freshness
node scripts/validate-traceability.mjs
node scripts/validate-sdk-contracts.mjs
node scripts/validate-deployment-set-delta.mjs
```

Optional: enable the repo pre-commit hook:

```sh
npm run prepare-hooks
```

After that, `.githooks/pre-commit` runs tests, docs linters, traceability, SDK/deployment validators, and staged docs freshness before each commit.

## Documentation maintenance policy

Docs are part of the product surface for this repository. Whenever code, automation, CI, package metadata, draft contracts, or agent tooling changes, the matching documentation must change too.

The `docs:freshness` gate enforces the minimum rule: changes under `src/`, `scripts/`, `test/`, package metadata, workflows, or agent config must include a docs update such as `README.md`, `AGENTS.md`, `docs/`, or a relevant proof/contract README. This follows GitHub maintenance best practice: keep the README accurate, make contribution expectations explicit, and use CI to protect project documentation from drifting behind code.

## CI and gates

GitHub Actions run two lanes:

- [`Docs`](./.github/workflows/docs.yml): tests plus docs/traceability linting on pushes and pull requests.
- [`HoBo CI Fabric`](./.github/workflows/hobo-ci.yml): full PR gate, contract checks, docs freshness, and optional labeled E2E lanes.

Core checks are intentionally ordinary Node scripts so they run locally, in CI, and inside agent sessions. `docs:coverage` also checks that required GitHub community-health and maintenance docs stay present.

## AI agent workflow

This repo is configured for agent/harness-agnostic helper tooling first, with supported shims for Claude Code, Cursor, Codex, and GitHub Copilot CLI where those clients need their own files. Start with [`AGENTS.md`](./AGENTS.md) before editing. Full setup details, devcontainer bootstrap behavior, progressive per-agent setup, cross-agent sync rules, install commands, and data-egress risks are in [`docs/agent-tooling.md`](./docs/agent-tooling.md).

Important rules for agents and humans:

- Do not treat `src/draft/*` as production HoBo code; it is executable design proof material.
- Keep docs, ADRs, proof notes, and README claims aligned with code changes.
- Prefer small, reviewable changes tied to a design claim or backlog slice.
- Run the local gates before opening a PR.

## Status summary

- **Product implementation:** not shipped.
- **Design suite:** active and canonical under [`docs/design/`](./docs/design/index.md).
- **Backlog mirror:** [`docs/implementation-plan.md`](./docs/implementation-plan.md); Linear is live operational source.
- **Executable proof material:** `src/draft/*` packages and repo validation scripts.
- **Primary command surface under design:** `hobo` CLI, specified in [`docs/design/cli-spec.md`](./docs/design/cli-spec.md).

## License

See [`LICENSE`](./LICENSE).
