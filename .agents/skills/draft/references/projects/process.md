---
type: Agent Skill Reference
title: "Project MVP reference"
description: "Define project MVP rollup artifacts that integrate epic proofs and propagate design changes downward."
tags: [hobo, draft, projects, mvp-rollups]
timestamp: 2026-06-30T00:00:00Z
---

# Project MVP reference

Project MVP rollups live at `src/draft/projects/<slug>`.

## Purpose

Integrate epic proofs into a scoped project MVP. Do not create fake MVPs. The default project layer starts with registry and templates only until a project has an owner, outcome, and scope.

## Required artifacts

- `README.md` with project outcome, owning issue/design plan, integrated epic proofs, scope, non-scope, and proof command.
- Project ADR for integration decisions.
- Rollup ledger from project to epics.
- Propagation ledger for changes pushed down into epic, technical, or experience proofs.
- Mock/simulation inventory for any service boundary outside the MVP slice.

## Validation

Project proof validation should replay the integrated epic proofs and then run only the project-level orchestration checks needed to prove the MVP slice.
