# ADR-0035 — Custom domains & multi-cloud ingress

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 13 — Networking & connectivity](../13-networking-connectivity.md) (the `gateway` port + DNS) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) (blue/green gateway flip, health) · [Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md) (secretless cert issuance via Identity) · [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md) (Yard owns cross-provider topology) · [ADR-0028](./ADR-0028-multi-camp-deployment-model.md) (a Bindle spans Camps; env-group saga) · [ADR-0027](./ADR-0027-secretless-config-and-secrets.md) · [Plan 21](../21-resources-catalog.md)/[Plan 24](../24-wit-worlds-reference.md) (catalog + worlds) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G4/Q23)
- **Origin:** the gap analysis flagged that Nitric ships custom domains while HoBo's `gateway` model left custom-domain provisioning + multi-cloud DNS/CNAME a one-liner (Q23/G4). Designed via brainstorming + grill-with-docs.

## Context
[Plan 13](../13-networking-connectivity.md) specifies the `gateway` port (TLS termination, routing, traffic-split) and HoBo-managed DNS for *internal* logical endpoints, but custom domains were a single sentence ("a provider capability; bind to a gateway"). The genuinely hard, HoBo-specific part is unaddressed: when a Bindle spans **multiple Camps** (a multi-cloud `production` = {`prod-aws`,`prod-azure`}, [ADR-0028](./ADR-0028-multi-camp-deployment-model.md)), **which Camp owns `shop.com`, how does traffic route across clouds, and who issues the cert?** Single-cloud custom domains are well-understood; multi-cloud ingress is the differentiator HoBo must specify.

## Decision
1. **A custom domain is a first-class, Yard-level resource.** `domain("shop.com").routes(api)` is owned at the **Yard** (which already holds cross-provider topology, [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)), declared IfC-style, and **fronts the member Camps** of an environment group ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)). It is backed by a new **`dns` capability** + the existing **`gateway`** port ([Plan 13](../13-networking-connectivity.md)). One domain, N Camps.
2. **Routing across Camps is policy-driven DNS.** The domain carries a routing policy — **`failover`** (active-passive, health-checked), **`weighted`** (canary/split), or **`latency`/`geo`** (nearest Camp) — programmed through a **provider-agnostic `dns` capability**. It reuses the env-group saga ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)), the blue/green gateway flip + health signals ([Plan 5](../05-reliability-ha.md)), and records each routing decision as an event (auditable "why did traffic go to `prod-aws`"). HoBo does **not** operate a global data-plane LB in v1.
3. **Certs are ACME DNS-01 by default, issued + rotated by Identity (secretless).** Because HoBo controls the zone, **DNS-01** works across any cloud, including wildcards and multi-Camp; certs are issued + auto-rotated by Identity ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 31](../31-config-secretless-secrets.md)) with **no static cert secret** ([ADR-0027](./ADR-0027-secretless-config-and-secrets.md)). **Provider-managed certs** (ACM / App Service / Google-managed) are an **opt-in per-Camp adapter** when a provider's LB requires its own.
4. **Ingress depth stays layered:** the `gateway` does TLS termination + routing + traffic-split + provider `.with()` WAF/rate-limit/DDoS; the `domain` sits above it, routing across Camps.
5. **Events:** `domain.Registered` · `domain.Validated` (DNS/ACME challenge passed) · `domain.CertIssued` · `domain.CertRotated` · `domain.RoutingChanged` (policy decision + chosen target Camps).

## Alternatives considered
- **Per-Camp gateway attachment (single cloud).** Rejected as the model: punts the multi-cloud-ingress case that distinguishes HoBo. (A single-Camp domain is just the degenerate case of the Yard-level resource.)
- **BYO DNS (HoBo only outputs the CNAME/A target).** Rejected as the default: HoBo wouldn't own routing, so cross-Camp failover/weighted routing becomes the user's problem; kept as a fallback for users who insist on managing their own zone.
- **HoBo-operated global anycast LB.** Rejected for v1: makes HoBo operate a global data-plane tier (cost, latency, ops, a new SPOF). Noted as a future opt-in adapter; DNS-based routing covers failover/weighted/geo without it.
- **Provider-managed certs as the default.** Rejected: per-provider, not portable across the equivalence class, inconsistent for wildcard/multi-Camp; kept as an adapter.
- **BYO uploaded cert.** Rejected: manual renewal + a static secret to custody, against the secretless posture ([ADR-0027](./ADR-0027-secretless-config-and-secrets.md)).

## Consequences
- **(+)** Closes G4/Q23 with a genuine **multi-cloud ingress** story — one domain routes across clouds with failover/weighted/geo policies, which no single-cloud competitor offers.
- **(+)** Reuses the Yard topology ([ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md)), env-group saga ([ADR-0028](./ADR-0028-multi-camp-deployment-model.md)), gateway flip + health ([Plan 5](../05-reliability-ha.md)), and secretless Identity ([Plan 31](../31-config-secretless-secrets.md)); the new surface is a `dns` capability + a `domain` resource + a small `domain.*` event group.
- **(+)** ACME DNS-01 gives portable, wildcard-capable, auto-rotated certs with no static secret — consistent with the keyless ethos.
- **(−)** DNS-based routing has propagation/TTL latency on failover (seconds–minutes) vs an anycast LB's instant flip — acceptable for v1; the anycast adapter is the upgrade path for stricter RTO.
- **(−)** A provider-agnostic `dns` capability must be conformance-covered per provider (record types, health-check hooks, ALIAS/ANAME quirks) — ongoing equivalence-class work.
