---
type: Agent Skill Reference
title: "Draft planning reference"
description: "Classify HoBo draft work into the lowest proof layer and identify required artifacts."
tags: [hobo, draft, planning, proof-taxonomy]
timestamp: 2026-06-30T00:00:00Z
---

# Draft planning reference

Use this when converting an issue, design note, or request into draft proof work.

## Classification

Choose the lowest layer that proves the claim:

- `technical-proofs` when the claim is an atomic technical capability, contract, parser, protocol, adapter boundary, event, projection, or performance envelope.
- `exp-proofs` when the claim is about human or developer experience: UX, DX, CX, API ergonomics, SDK shape, onboarding, admin, support, billing, privacy, legal, marketplace, or launch readiness.
- `epic-proofs` when several technical and experience proofs must work together as one isolated epic.
- `projects` only when a scoped MVP must integrate multiple epic proofs.

## Planning artifacts

- Design or Linear source.
- Draft kind and slug.
- Scope and explicit non-scope.
- Required ADRs.
- Required mocks and simulated boundaries.
- Validation commands.
- Rollup or propagation ledger when work crosses layers.

## Migration rule

When moving existing proof material, use `git mv`. Keep pre-existing deletions deleted unless the task explicitly asks to restore them.
