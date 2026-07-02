---
type: Agent Skill Reference
title: "Experience proof reference"
description: "Define experience proof artifacts for UX, DX, CX, API, SDK, audience modeling, friction, and standards."
tags: [hobo, draft, exp-proofs, user-centered-design]
timestamp: 2026-07-02T00:00:00Z
---

# Experience proof reference

Experience proofs live at `src/draft/exp-proofs/<type>/<slug>`, where `<type>` is one of `dx` (developer), `ux` (user), `cx` (customer), `ax` (agent), or `api` (API/SDK surface) — classified in `src/draft/exp-proofs/_classification.md`.

## Purpose

Mock the experience before committing to production behavior. Experience includes UX, DX, CX, API ergonomics, SDK interfaces, admin/support workflows, billing/legal/privacy surfaces, marketplace flows, and launch-readiness views.

## Required artifacts

- `README.md` with audience, scenario, scope, non-scope, proof command, and mocked boundaries.
- `ADR.md` covering the experience decision, alternatives, friction tradeoffs, and standards used.
- Audience model using a standard shape: persona or actor, context, goals, constraints, prior knowledge, accessibility needs, risk tolerance, and success criteria.
- Friction inventory with measurable standards/specs.
- `proof.json` manifest (schema: `scripts/lib/proof-manifest.ts`) with `experienceType` matching the type folder.
- `examples/` with at least one runnable, documented example (gate-executed against committed expected output).
- `notebook.ipynb` (tslab) demonstrating the experience, committed with executed outputs.
- Per-type experience artifacts (**gate-enforced** by `pnpm run draft:artifacts`):
  - `ux`: `assets/` with **real visuals** — SVG/PNG wireframes, image mockups, screenshots. TypeScript "mockup modules" do not satisfy this.
  - `dx`: pseudo-code, protobuf + CUE contracts, and mermaid diagrams.
  - `cx`: journey maps/scripts and communication fixtures (`assets/*.md` or `journeys/`).
  - `ax`: MCP transcripts, tool schemas, or llms.txt fixtures (`assets/` or `transcripts/`).
  - `api`: interface declarations, type tests (`type-tests/`), example consumers, and error/edge-case ergonomics.

Scaffold new proofs from `src/draft/_templates/exp/`; classify the type in `src/draft/exp-proofs/_classification.md` and place the package under `src/draft/exp-proofs/<type>/`.

## Design posture

Use human-centered design: identify observable friction, make the target audience explicit, reduce unnecessary steps, and measure whether the mock improves the user's workflow.

## Validation

Use deterministic mocked-boundary tests. For UX, prefer DOM/component/visual checks when the proof renders UI. For API and SDK proofs, prefer type tests, compile consumers, and contract fixtures.
