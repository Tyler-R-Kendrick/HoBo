# ADR-0062 — Marketplace & ecosystem: a governed lifecycle over signed, certified artifacts

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 48 — Marketplace & ecosystem](../48-marketplace-ecosystem.md) · [ADR-0020 — Monetization model](./ADR-0020-monetization-model.md) (OSS core + hosted Yard + marketplace) · [ADR-0024 — Portability conformance guarantee](./ADR-0024-portability-conformance-guarantee.md) (never-gate-portability) · [Plan 27 — Drivers/Packs/Profiles](../27-drivers-packs-profiles.md) (Registry, `hobo pack add`) · [Plan 6](../06-ai-native-agent-auth.md)/[Plan 12](../12-security-multitenancy.md) (identity, signing, provenance) · [Plan 9](../09-verification-open-questions.md)/[Plan 24](../24-wit-interfaces-reference.md) (`@hobo/conformance`) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md) (Forge-generatable listings; no community bottleneck) · [Plan 25 — Matching](../25-resource-definitions-matching.md)/[ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) (install ≠ force; deterministic bind) · [ADR-0039 — Billing](./ADR-0039-billing-quota-cost-attribution.md) (`billing` port) · [ADR-0036 — Air-gapped](./ADR-0036-air-gapped-sovereign-mode.md) (offline-bundle install) · [Plan 11](../11-event-model.md) (`listing.*`)
- **Origin:** ADR-0020 named a marketplace as a monetization channel and Plans 40/42/43 each *deferred* a marketplace — a standing forward-reference the suite never resolved. The primitives all existed; the plane tying them together did not.

## Context
HoBo has every primitive a marketplace needs — a Registry, signed Resource Packs, `@hobo/conformance`, provenance, a monetization model, and MCP — and several plans explicitly punted "a marketplace of X" to later. Without a unifying plane, third-party/community distribution stays ad-hoc and the network effect ADR-0020 anticipated can't form. The risk to avoid: a marketplace that becomes a lock-in lever, contradicting the portability guarantee that is HoBo's core promise.

## Decision
1. **The marketplace is a governed index + lifecycle over existing signed/certified artifacts**, not new infrastructure or new artifact types. Listings = providers / Resource Packs / policy packs / agent-skills / runbooks / Hobo-Code modules / guardrails+model cards.
2. **Publish = sign + conformance-certify + provenance** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 12](../12-security-multitenancy.md)/[Plan 9](../09-verification-open-questions.md)/[Plan 33](../33-forge-generation-pipeline.md)) — the same trust boundary every adapter crosses; uncertified ⇒ unlisted (`listing.Published`/`Certified`).
3. **Discover is capability-indexed and agent-drivable** (WIT port + Matching criteria + region/classification), surfaced via MCP so the Forge/agents can install as part of planning.
4. **Install = `hobo add`, bound by Matching** ([Plan 25](../25-resource-definitions-matching.md)) — installing makes an artifact *available* to deterministic selection, never forces its use; air-gap installs via signed offline bundle ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)).
5. **Trust = provenance tier + publisher identity + ratings** (a composite derived from facts; policy packs can require a minimum tier). **Monetize = free/paid/rev-share via the `billing` port** ([ADR-0039](./ADR-0039-billing-quota-cost-attribution.md)) with the hard invariant that **portability is never a paid feature** ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)): conformance, ports, import/export, and the swap-for-an-equivalent escape hatch are always free; the Forge guarantees a non-paid equivalent can always be generated.

## Alternatives considered
- **A free-for-all upload marketplace (npm-style, trust-by-popularity).** Rejected: HoBo's value is the conformance/provenance trust boundary; bypassing it for distribution would import the supply-chain risks HoBo exists to remove.
- **Make the marketplace a new store with its own artifact format.** Rejected: duplicates the Registry/signing/conformance; listings are existing artifacts plus distribution metadata.
- **Allow portability/conformance behind a paywall to drive revenue.** Rejected outright — contradicts ADR-0024, the core promise. Premium *specific* providers are fine; gating the *escape hatch* is not.
- **Force-bind on install.** Rejected: would make installing risky and break deterministic Matching; install adds a candidate, Matching decides.
- **Human-only web storefront.** Rejected as the *only* surface: agent-drivable MCP discovery is required for the AI-native thesis; a web UI is additive and deferred.

## Consequences
- **(+)** Operationalizes the long-deferred marketplace with almost no new machinery — a `listing.*` lifecycle + capability index over already-signed/certified artifacts; turns the Forge + Crew into composable *community* surfaces.
- **(+)** Trust is fact-derived (provenance tier + conformance + identity), so enterprises can govern their own supply chain via policy; agents can safely self-serve dependencies.
- **(+)** The never-gate-portability invariant is enforced structurally (Forge guarantees an equivalent), so the marketplace can't become lock-in — a differentiator vs closed-PaaS app stores.
- **(−)** Curation/moderation and a real storefront UX are real product work, deferred; v1 is CLI/MCP + a few listing kinds.
- **(−)** Yank propagation to already-deployed Sets is delicate (warn vs block vs forced migration) — an iteration hook; getting it wrong either breaks running apps or leaves vulns deployed.
- **(−)** A vibrant third-party ecosystem raises the stakes on conformance-suite quality — a weak suite would certify weak artifacts.
