# HoBo documentation hub

This directory contains the current documentation set for HoBo. The root [`README.md`](../README.md) explains the project at a high level; this hub helps contributors find the right maintenance target.

## Canonical docs

| Area | Start here | Purpose |
|---|---|---|
| Design suite | [`design/README.md`](./design/README.md) | Canonical product/platform design, ADRs, glossary, event families, traceability, CLI and SDK contracts. |
| Implementation backlog | [`implementation-plan.md`](./implementation-plan.md) | Durable mirror of Linear's subsystem decomposition and issue plan. Linear remains live status source. |
| Agent tooling | [`agent-tooling.md`](./agent-tooling.md) | Local agent-tooling setup, trust boundaries, data-egress notes, and maintenance expectations. |
| Automations | [`automations/hobo-issue-worker.md`](./automations/hobo-issue-worker.md) | How issue-worker automation should interpret design docs and report changes. |

## Reference directories outside `docs/`

| Directory | Purpose |
|---|---|
| [`../src/draft/`](../src/draft/README.md) | Executable proof/contract packages that make selected design claims testable. |
| [`../competitors/`](../competitors/README.md) | Product and platform positioning references. |
| [`../patterns/`](../patterns/README.md) | Architecture/operations patterns used by HoBo decisions. |
| [`../standards/`](../standards/README.md) | External standards referenced by design decisions. |
| [`../technologies/`](../technologies/README.md) | Technology notes for adapters, engines, and possible implementation choices. |
| [`../archive/`](../archive/) | Deferred or superseded planning artifacts. |

## Maintenance checklist

When docs change, verify:

- Relative links and anchors pass `npm run docs:design-lint`.
- CLI examples use canonical verbs and pass `npm run docs:cli-lint`.
- Required community and maintenance docs pass `npm run docs:coverage`.
- Code/tooling changes include a nearby docs change and pass `npm run docs:freshness`.
