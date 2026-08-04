---
type: Maintenance Note
title: "SDLC state — hobo-code optimizexp surfaces"
description: "Durable sdlc coordinator state for the initiative (phase, decisions, dispatched issues)."
tags: [hobo, plans, sdlc]
---

# SDLC state — hobo-code optimizexp surfaces

**phase:** closed
**branch:** feat/hobo-code-optimizexp-surfaces (merged)
**PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/990
**merge:** `5e88a06446e9424cdddd3ddf7a4bd417a6977c84` (2026-07-31)

## Delivered

- Multi-persona DX/UX/AX for hobo-code (Herdr, GHCP, nix, remote attach, Grok Build, Claude/Cursor guides, cost $0, Pi/Flue, nvim edit, config setup, protocol-native agent)
- Verbs: auth, models, attach, tasks, guide, cost, harness, edit, config, agent
- Optimizexp features under packages/code/.optimizexp/
- Dual-regime runs closed at pareto-equilibrium for major surfaces including config-setup and agent-native

## Finish notes

- Local: `@hobo/code` vitest 104 passed; build green
- CI: checks failed with empty steps (billing/budget class) — documented on PR, squash-merged per sdlc finish protocol

## Residual (L)

- Full ACP host methods
- Live OAuth client_credentials remote AS
- CIBA headless user consent
