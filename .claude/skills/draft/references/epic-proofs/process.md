---
type: Agent Skill Reference
title: "Epic proof reference"
description: "Define isolated epic rollup artifacts, compatibility ADRs, Gherkin suites, Pact inventory, simulations, and ledgers."
tags: [hobo, draft, epic-proofs, gherkin, pact]
timestamp: 2026-06-30T00:00:00Z
---

# Epic proof reference

Epic proofs live at `src/draft/epic-proofs/<slug>`.

## Purpose

Prove one epic in isolation by rolling up technical and experience proofs. Reuse lower-layer artifacts and code instead of copying logic. Mock or simulate every service boundary outside the epic.

## Required artifacts

- `README.md` with epic scope, included lower-layer proofs, non-scope, proof command, and simulations.
- `ADR.md` for epic-level integration decisions.
- Additional ADRs whenever technical proof details change for compatibility, package upgrades, integration shape, or generated-contract alignment.
- Gherkin/Cucumber feature suite for user stories and feature behavior.
- Pact fixture inventory for mocked service boundaries.
- Simulation docs covering fake providers, clocks, queues, identity, data stores, and failure modes.
- Rollup ledger mapping each lower-layer proof to its role in the epic.

## Propagation rule

If an epic proof requires changing a technical or experience proof, update that lower proof too and add the ADR there. Epic compatibility decisions must not live only at the rollup layer.
