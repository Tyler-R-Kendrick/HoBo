# ADR-0020 — Monetization model (OSS core + hosted Yard + marketplace)

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Founders, Business
- **Related:** [BRD §Business model](../../requirements/BRD.md) · [00 Vision](../00-vision.md) · [16 Cost/FinOps](../16-cost-finops.md) · open item ADR-P (governance/license) in [18-adr-log](../18-adr-log.md)

## Context
Open question #9 in [09-verification-open-questions.md](../09-verification-open-questions.md) flags "governance/license for OSS core + the hosted Yard business model" as undecided. The BRD needs a stated model to frame business requirements and pricing, even if exact figures stay TBD. Two principles constrain us: **"self-host = hosted"** (the Yard is itself a Bindle — [00-vision.md](../00-vision.md)) and **"agnostic by default"** (we cannot lock users into our cloud, or we contradict the product).

## Decision
A three-part model:
1. **Open-source core (the SDK, runtime, built-in runtime engine, conformance, CLI, and a self-hostable Yard).** Permissive enough to drive adoption and self-host; the agnostic promise requires the core be runnable by anyone. (Exact license — Apache-2.0 vs a fair-source/BSL variant for the Yard — is tracked as an open ADR; default lean is **Apache-2.0 for libraries, with the hosted differentiators kept commercial**.)
2. **Hosted Yard (SaaS) — the primary revenue line.** Multi-tenant managed control plane with the operationally hard, ongoing-value features: managed HA/multi-region, showback→**chargeback/billing integration** ([16-cost-finops.md](../16-cost-finops.md)), org SSO/RBAC, audit retention, support SLAs, and a hosted Forge. Priced per-seat and/or per-deployment/usage (figures TBD).
3. **Marketplace — Forge-certified providers & Resource Packs.** A distribution channel for signed, conformance-passing providers/implementations and platform-engineer Resource Packs ([27](../27-drivers-packs-profiles.md)); monetization optional/secondary (rev-share or paid tiers), explicitly **not** a community bottleneck since Forge can generate providers.

We do **not** monetize by charging egress/markup on the user's own cloud spend, and we do **not** gate portability behind a paid tier — that would break the core thesis.

## Alternatives considered
- **Closed-source PaaS (Lakebed-style)** — rejected: contradicts agnostic/self-host principles and the OSS adoption motion.
- **Pure OSS + support contracts only** — kept as a fallback, but insufficient as the primary line; the hosted Yard captures the recurring operational value.
- **Cloud-spend markup / resale** — rejected: misaligns incentives with the user's cost-optimization goal ([16](../16-cost-finops.md)).

## Consequences
- **(+)** Adoption (OSS) and revenue (hosted) are aligned with the product's values; self-host remains first-class.
- **(+)** Cost/FinOps features ([16](../16-cost-finops.md)) have a clear home: showback in OSS, chargeback/billing in hosted.
- **(−)** The OSS/commercial line must be drawn carefully so the hosted tier has durable differentiators without crippling self-host; exact license + the feature split remain open and are called out as BRD risks/assumptions.
- **(−)** A marketplace implies trust, signing, and provenance infrastructure ([12](../12-security-multitenancy.md)) — already in scope, but its quality now has commercial stakes.
