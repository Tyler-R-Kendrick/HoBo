# ADR-0019 — Persona prioritization / primary ICP

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Product, Founders
- **Related:** [BRD §Stakeholders](../../requirements/BRD.md) · [PRD §Personas](../../requirements/PRD.md) · [00 Vision](../00-vision.md) · [17 Positioning](../17-positioning-competitive.md)

## Context
HoBo serves four distinct personas — **application developers**, **platform engineers**, **operators**, and **AI agents-as-users** ([00-vision.md](../00-vision.md), [06-ai-native-agent-auth.md](../06-ai-native-agent-auth.md)). The roadmap can't optimize for all four at once; trying to would dilute the wedge. Positioning ([17](../17-positioning-competitive.md)) already names the wedge: developer-centric, agnostic-by-default, agent-operable, with Lakebed/Vercel-grade onboarding. We must commit a priority order so the BRD/PRD scope and the P0–P6 sequencing align to one Ideal Customer Profile (ICP).

## Decision
Prioritize personas in this order for v1 (P0–P5):
1. **Primary ICP — the indie/startup TypeScript developer *and* the AI agent acting on their behalf.** These are co-primary: the developer authors a Bindle; the agent deploys/operates it via MCP. Every capability must be reachable by both (SDK/CLI **and** MCP), with first-class agent identity.
2. **Secondary — the platform engineer** (defines Resource Definitions, mapping rules, policy/cost guardrails). Served from P4 onward, when multi-provider + governance matter.
3. **Deferred — the multi-tenant hosted operator** (runs a hosted Yard for others). Served at P6 (HA/FinOps/multi-region). Self-host single-tenant is supported earlier because "self-host = hosted" is the same code.

## Alternatives considered
- **Platform-engineer-first (Humanitec/IDP posture)** — rejected for v1: leads with governance before there is a developer base to govern; slower to a "wow" moment.
- **Enterprise-operator-first** — rejected: requires multi-tenant HA + compliance up front (P6 work) before the core agnostic-deploy thesis is proven.
- **Human-developer-only, agents later** — rejected: contradicts the "agents are users, not afterthoughts" principle ([00-vision.md](../00-vision.md)) and the core differentiator.

## Consequences
- **(+)** Sharpens P0–P3 around the develop→deploy→agent-operate loop; the MCP surface and keyless identity are not deferrable.
- **(+)** Gives marketing/positioning one clear ICP to address.
- **(−)** Platform-engineer features (Resource Definitions/Matching, policy packs) are real but land later (P4+); early adopters in regulated/large orgs wait. Mitigation: the design already accommodates them ([25](../25-resource-definitions-matching.md), [30](../30-policy-plane.md)); only the *requirements priority* is deferred, not the architecture.
