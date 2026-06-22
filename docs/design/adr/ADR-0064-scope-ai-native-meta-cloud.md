# ADR-0064 — Scope: AI-native meta-cloud (remove business + app-build-out)

- **Status:** Accepted (supersedes [ADR-0020](./README.md) monetization model, now removed)
- **Date:** 2026-06-22
- **Deciders:** Founders, Product, Engineering
- **Related:** [00 Vision](../00-vision.md) · [17 Positioning](../17-positioning-competitive.md) · [ADR-0063 — Single v1 scope](./ADR-0063-single-v1-scope.md) · [ADR-0024 — Portability guarantee](./ADR-0024-portability-conformance-guarantee.md) · [ADR-0039 — Metering/quota/cost-attribution](./ADR-0039-billing-quota-cost-attribution.md)

## Context
HoBo is an **AI-native meta-cloud** — a direct competitor to **Convex, Lakebed.dev, and Nitric**: a portable durable runtime + a cloud-agnostic provisioning control plane that any cloud's primitives plug into via ports, operable by agents, with the **Forge** generating the missing adapters. As the suite grew it accreted two kinds of scope that drift past a meta-cloud:
1. **SaaS-business functions** — billing, subscriptions, invoicing, tax/VAT, chargeback, monetization, rev-share. HoBo is not a payments/billing product, and a meta-cloud should not carry a commercial toolkit.
2. **App-build-out** — generating the developer's *own product*, in particular its **UI** (and the "generate your whole app" framing of the generated stack). Writing the user's application is a different category from running it on any cloud.

## Decision
**Scope HoBo to the meta-cloud.** The test for any capability: ***would Convex, Nitric, or Lakebed ship this as a platform capability?*** Note that *developer-facing ≠ out of scope* — these competitors are batteries-included; the cut line is **business + app-build-out**, not "non-developer."

1. **Keep** (in scope): cloud/infra orchestration; the durable, event-sourced runtime; AI-native agents + MCP; the Forge (AI-generated **infrastructure** — providers/adapters/implementations behind ports) and self-optimizing runtime functions (`"use training"`); and the developer-facing **cloud primitives** (data, reactivity, auth, search, messaging, storage) as ports. Cloud-cost **FinOps** (estimates/budgets/showback/quotas/spend-safety) stays — it is infra, not money.
2. **Remove — business/monetization:** the monetization model (ADR-0020, deleted); the `billing` port / chargeback / invoicing / tax / rev-share; ADR-0039 retitled to *Metering, quota & cost attribution* (FinOps only); the marketplace's monetize lifecycle.
3. **Remove — app-build-out:** UI-layer generation (Plan 42), the **UX-Designer** operator (Plan 40), the **UI layer** of the generated stack (Plan 41), the `ui-render` port, and `Design.md`. AI generation is refocused to **infrastructure + runtime** (Forge + `"use training"` + data/message glue), not "generate the developer's product."
4. **Consolidate:** `notify` (email/sms/push/webhook) becomes a thin **cloud-messaging port** in the resource catalog, not a standalone plane; the marketplace's publish/discover/install/trust folds into the **Registry** + **Resource Packs**; governance planes (compliance, AI safety) keep their **enforcement** machinery, trimming the compliance-program paperwork framing.
5. **Tombstone, don't renumber.** Removed plan numbers (42, 45, 48) become short "removed — out of scope" stubs that preserve links and point to where the capability folded.

## Alternatives considered
- **Keep monetization + UI generation as differentiators.** Rejected: they push HoBo from a meta-cloud into a SaaS-business + app-builder, blurring the Convex/Lakebed/Nitric positioning and adding maintenance surface unrelated to the thesis.
- **Cut only the literal billing list, keep everything else.** Rejected: leaves the app-build-out drift (UI generation) and the sprawl the directive ("consolidate and tighten") asked to remove.
- **Delete the generated-stack plan entirely.** Considered; instead refocused it to infrastructure/runtime generation so the Forge + use-training story stays coherent.

## Consequences
- **(+)** Sharper, more defensible identity: the uncontested intersection (agnostic IfC + durable event-sourced runtime + agents/Forge + conformance + patchability) survives intact; the business/app-build-out sprawl leaves.
- **(+)** Smaller surface to design, build, and maintain; clearer competitive story vs Convex/Lakebed/Nitric.
- **(−)** Loses the "generates your UI / whole app" differentiator and any first-party commercial story in the docs (commercialization is now out of design scope).
- **(↔)** Updates ripple through the suite: ADR-0063 (v1 scope list), the roadmap/phases (stage 6), the requirements (BRD/PRD/TRD), the event model, the glossary/index, and the gap-analysis. Removed numbers are tombstoned, not reused.
