# ADR-0019 — Persona prioritization / primary ICP

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Product, Founders
- **Related:** [BRD §Stakeholders](../../requirements/BRD.md) · [PRD §Personas](../../requirements/PRD.md) · [00 Vision](../00-vision.md) · [17 Positioning](../17-positioning-competitive.md)

## Context
HoBo serves four distinct personas — **application developers**, **platform engineers**, **operators**, and **AI agents-as-users** ([00-vision.md](../00-vision.md), [06-ai-native-agent-auth.md](../06-ai-native-agent-auth.md)). All four are served in the single v1 ([ADR-0063](./ADR-0063-single-v1-scope.md)), but the build can't optimize for all four at once; leading with the wrong one would dilute the wedge. Positioning ([17](../17-positioning-competitive.md)) already names the wedge: developer-centric, agnostic-by-default, agent-operable, with Lakebed/Vercel-grade onboarding. We commit a **build-emphasis order** so the BRD/PRD scope and the v1 build stages ([phases/](../phases/README.md)) align to one primary Ideal Customer Profile (ICP) without deferring any persona to a later release.

## Decision
All four personas are in v1; we prioritize **build emphasis** (which to nail first) in this order:
1. **Primary ICP — the indie/startup TypeScript developer *and* the AI agent acting on their behalf.** These are co-primary: the developer authors a Bindle; the agent deploys/operates it via MCP. Every capability must be reachable by both (SDK/CLI **and** MCP), with first-class agent identity. Anchored from the earliest build stages.
2. **Platform engineer** (defines Resource Definitions, mapping rules, policy/cost guardrails). Fully in v1; their surface deepens once multi-provider + governance are in place (build stage 4 onward).
3. **Multi-tenant hosted operator** (runs a hosted Yard for others). In v1; the hosted HA/FinOps/multi-region substrate it relies on lands in the later build stages. Self-host single-tenant works from the first deploy because "self-host = hosted" is the same code.

## Alternatives considered
- **Platform-engineer-first (Humanitec/IDP posture)** — rejected for v1: leads with governance before there is a developer base to govern; slower to a "wow" moment.
- **Enterprise-operator-first** — rejected: requires multi-tenant HA + compliance up front (late-stage work) before the core agnostic-deploy thesis is proven.
- **Human-developer-only, agents later** — rejected: contradicts the "agents are users, not afterthoughts" principle ([00-vision.md](../00-vision.md)) and the core differentiator.

## Consequences
- **(+)** Sharpens the early build stages around the develop→deploy→agent-operate loop; the MCP surface and keyless identity are not deferrable.
- **(+)** Gives marketing/positioning one clear ICP to address.
- **(−)** Platform-engineer features (Resource Definitions/Matching, policy packs) are in v1 but built after the core loop (build stage 4+); they are sequenced later, not cut. The design already accommodates them ([25](../25-resource-definitions-matching.md), [30](../30-policy-plane.md)); only *build order* differs, not scope or architecture.
