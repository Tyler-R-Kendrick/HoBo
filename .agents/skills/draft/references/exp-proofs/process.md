---
type: Agent Skill Reference
title: "Experience proof reference"
description: "Define experience proof artifacts for UX, DX, CX, API, SDK, audience modeling, friction, and standards."
tags: [hobo, draft, exp-proofs, user-centered-design]
timestamp: 2026-06-30T00:00:00Z
---

# Experience proof reference

Experience proofs live at `src/draft/exp-proofs/<slug>`.

## Purpose

Mock the experience before committing to production behavior. Experience includes UX, DX, CX, API ergonomics, SDK interfaces, admin/support workflows, billing/legal/privacy surfaces, marketplace flows, and launch-readiness views.

## Required artifacts

- `README.md` with audience, scenario, scope, non-scope, proof command, and mocked boundaries.
- `ADR.md` covering the experience decision, alternatives, friction tradeoffs, and standards used.
- Audience model using a standard shape: persona or actor, context, goals, constraints, prior knowledge, accessibility needs, risk tolerance, and success criteria.
- Friction inventory with measurable standards/specs.
- UX surfaces: wireframes, image mockups, or deterministic visual fixtures.
- API/SDK surfaces: interface declarations, type tests, example consumers, and error/edge-case ergonomics.

## Design posture

Use human-centered design: identify observable friction, make the target audience explicit, reduce unnecessary steps, and measure whether the mock improves the user's workflow.

## Validation

Use deterministic mocked-boundary tests. For UX, prefer DOM/component/visual checks when the proof renders UI. For API and SDK proofs, prefer type tests, compile consumers, and contract fixtures.
