# ADR-0043 — Multi-Yard federation: the Circuit (and the Yard's scope, clarified)

- **Status:** Accepted (architecture); **v1 ships single-Yard, federation-ready** (the Circuit is post-v1)
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [ADR-0026 — Scope model `Yard ⊃ Camp ⊃ Bindle`](./ADR-0026-scope-model-yard-camp-bindle.md) · [ADR-0028 — Multi-Camp model](./ADR-0028-multi-camp-deployment-model.md) · [Plan 4 — The Yard](../04-control-plane.md) · [Plan 12 — Security/multitenancy](../12-security-multitenancy.md) · [Plan 6 — Agent auth](../06-ai-native-agent-auth.md) (OIDC federation) · [Plan 30 — Policy plane](../30-policy-plane.md) (signed policy packs) · [ADR-0036 — Air-gap](./ADR-0036-air-gapped-sovereign-mode.md) (signed-bundle sharing) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (#20)
- **Origin:** open question #20 ("Yard federation"). Brainstorm surfaced that the question conflated *multi-region* (already solved) with *true multi-Yard*; the Yard is the central cross-cloud orchestrator, so any aggregate above it needs its own concept.

## Context
#20 framed multi-region/regulatory as needing "multi-Yard federation." But a **Yard is the central cross-cloud / cross-region orchestrator** ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)) — a multi-region/multi-cloud deployment is already **one Yard ⊃ many Camps** ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)), where each Camp is a provider/region target. So multi-region needs **no** second Yard. A second Yard is warranted only for **extreme isolation**: a tenant/boundary that must have a **wholly separate control plane** (sovereign/regulated tenants, air-gapped boundaries, [ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md), or isolation beyond per-tenant streams). And because the Yard is itself the central orchestrator, an aggregate *over* Yards can't be a bigger Yard — it needs a distinct concept.

## Decision
1. **The Yard is the central cross-cloud orchestrator; one Yard per app/org by default.** Cross-region/cross-cloud = `Yard ⊃ Camp` ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)/[ADR-0028](./ADR-0028-multi-camp-deployment-model.md)). #20's "multi-Yard for multi-region" is corrected: **multi-region needs no second Yard.**
2. **True multi-Yard is for extreme isolation only** — a tenant/boundary requiring a wholly separate control plane (sovereignty/regulatory, air-gap, hard multi-tenant isolation). Otherwise: one Yard.
3. **Introduce the `Circuit` — a peer federation of sovereign Yards (a new aggregate, *not* a controller).** Thematically, a hobo travels a circuit of yards. When sovereign Yards must interoperate, a Circuit federates exactly three things, reusing mechanisms HoBo already has:
   - **Identity trust** — cross-Yard SVID/OIDC trust under an agreed root (the same OIDC federation HoBo does for providers, [Plan 6](../06-ai-native-agent-auth.md)), so a principal from Yard A can be authenticated by Yard B.
   - **Policy** — shareable **signed policy packs** ([Plan 30](../30-policy-plane.md)) propagate across the Circuit.
   - **Registry** — certified providers/packs flow via the **signed-bundle/mirror** mechanism ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)).
   Each Yard keeps its **own event log + control plane + data** — the Circuit is **trust + signed-artifact sharing, never shared mutable state and never a super-controller**. A cross-Yard operation is a *federated request* (authn via federated identity, authz by the **target** Yard's own policy), with **data residency preserved** (nothing centralizes). The scope model becomes, for the rare case: **`Circuit` (optional, peer) ⊇ `Yard ⊃ Camp ⊃ Bindle`** — where `⊇` is federation, not control.
4. **v1 ships single-Yard, federation-ready.** v1 implements one Yard per boundary but makes identity/policy/registry **federation-ready**: no assumption of a single global trust root, policy packs + registry bundles already signed/portable, the event `tenant` already scoping. The Circuit (and its future events `circuit.YardJoined`/`circuit.TrustEstablished`/`circuit.ArtifactShared`/`circuit.YardLeft`) is **post-v1** but the v1 design does not preclude it.

## Alternatives considered
- **A central super-Yard (hierarchy) over regional Yards.** Rejected: a global SPOF + a data-residency problem (the central plane would see all regions) + it contradicts "the Yard is the broadest orchestrator" ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)). The Circuit is peer, not hierarchical.
- **Overload the Yard to nest under another Yard.** Rejected per the scope model — the Yard is the central orchestrator; an aggregate above it must be a distinct concept (the Circuit), not a subordinated Yard.
- **Use multiple Yards for multi-region (the original #20 framing).** Rejected: multi-region is Camps under one Yard ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)); a second Yard there would duplicate control planes for no benefit.
- **No federation (independent Yards, manual).** Rejected for the extreme-isolation case: leaves sovereign tenants as disconnected islands when they legitimately need to share identity/policy/providers; the Circuit gives a thin, trust-only bridge.
- **Build the Circuit in v1.** Rejected: it's a post-v1 need (v1 is one-Yard-per-boundary); the decision is the *architecture* + forward-compat, not v1 implementation.

## Consequences
- **(+)** Resolves #20 honestly: clarifies that multi-region is already one-Yard-many-Camps, scopes true multi-Yard to extreme isolation, and gives that case a clean concept (the Circuit) without distorting the Yard.
- **(+)** The Circuit reuses OIDC federation ([Plan 6](../06-ai-native-agent-auth.md)), signed policy packs ([Plan 30](../30-policy-plane.md)), and the signed-bundle mechanism ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)) — no new control-plane machinery, and data residency is preserved (peer, not central).
- **(+)** v1 stays simple (one Yard) while remaining federation-ready, so the design doesn't paint itself into a corner.
- **(−)** A peer federation has no single global view/governance point — cross-Circuit policy conflicts must be reconciled by agreement, not a central authority (acceptable, and the point, for sovereignty).
- **(−)** The Circuit is specified but deferred; its event model + join/trust ceremony are post-v1 work, so the multi-Yard story is architectural-only until then.
