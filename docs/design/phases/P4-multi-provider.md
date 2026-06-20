# Phase P4 — Multi-provider + wiring depth

> [Phases index](./README.md) · realizes [Plan 3](../03-providers-iac.md), [Plan 13](../13-networking-connectivity.md), [Plan 22](../22-wiring-manifest.md), [Plan 2](../02-sdk-api.md).

**Objective.** Prove the agnostic thesis: the **same bindle** deploys to multiple clouds via mapping rules, with cross-provider connectivity and typed provider-specific optimization — no app edits.
**Depends on.** P2 (and benefits from P3 for cross-cloud identity/links).

> **v3 (Humanitec):** this is where **Resource Definitions** shine — platform engineers write per-`envType`/per-`class` definitions so the same bindle resolves to managed-HA in prod and cheap variants in ephemeral ([Plan 25](../25-resource-definitions-matching.md)/[Plan 26](../26-environments-deltas.md)); add the **echo**/**container**/**custom-webhook** Drivers ([Plan 27](../27-drivers-packs-profiles.md)), **Resource Packs**, the **HoBo Agent** for private targets, and the **GitOps publisher** ([Plan 28](../28-agent-gitops-pipelines.md)).

> **v4 (gates):** deepen the contract plane — **observed/promoted** contracts (trace-mining) and cross-provider/**version-skew `can-deploy`** ([Plan 29](../29-contracts-compatibility.md)); **capability contracts** (`.allow()` required ⊆ granted) and policy packs with **region/data-classification obligations** ([Plan 30](../30-policy-plane.md)/[Plan 12](../12-security-multitenancy.md)) become first-class as the topology spans clouds.

## Workstream 1 — Additional CloudProviders (AWS, Azure)
1. Implement capability ports for the full resource catalog ([Plan 21](../21-resources-catalog.md)) on AWS and Azure as capability providers.
2. Equivalence classes per port (e.g. `database{postgres}` → RDS / Flexible Server); Hobo Code for each.
3. Typed `.with(...)` option builders per provider (`aws.fargate`, `azure.containerApps`, …).

## Workstream 2 — Mapping rules & resolution
1. Implement the three mapping styles in `hobo.config.ts`: whole-app `defaultProvider`, per-`tiers`, per-`bindings` ([Plan 2](../02-sdk-api.md)).
2. Planner resolution order + `prefer`/`require` capability negotiation; record rationale on `deployment.Planned`.
3. Ensure `.with(...)` is inert for non-resolved providers (one bindle → many clouds).

## Workstream 3 — Cross-provider networking ([Plan 13](../13-networking-connectivity.md))
1. Service identity via SVIDs; **links** resolve to endpoints across providers.
2. Connectivity tiers: native private → private interconnect → **overlay mesh** → public + **mTLS** (SVID-keyed).
3. Annotate `bind` edges with connectivity tier + estimated egress (feeds the Planner + dashboard).

## Workstream 4 — Wiring/manifest parity ([Plan 22](../22-wiring-manifest.md))
1. Aspire-style reference/config injection for the **container/wasm-host fallback** (env conventions); lazy `{ref}` resolution.
2. Uniform `AddContainer`-style config (endpoints/env/args/mounts/lifetime/health) applied to components + containers.

## Deliverables
- `provider-aws`, `provider-azure`; mapping-rule engine; cross-provider connectivity; `examples/multi-cloud-shop`.

## Exit criteria (acceptance)
- `multi-cloud-shop` deploys the **same bindle to two providers** via mapping rules.
- Cross-cloud services **connect over mTLS** keyed by SVIDs; the topology graph shows the connectivity tier + egress.
- A `require`d capability that no resolved provider offers → **`deployment.PlanRejected`** with a precise reason.
- Switching a resource's provider touches **only `hobo.config.ts`** (no `bindle.ts`/`src` change).

## Risks / iteration hooks
- Overlay-mesh technology (WireGuard vs eBPF/Cilium vs Tailscale-style).
- Planner objective when multiple providers fully satisfy (cost vs latency vs stay-on-one-cloud) ([Plan 16](../16-cost-finops.md)).
- Crossplane substrate coexistence with the TS-native orchestrator.
