# ADR-0062 — Registry distribution: publish/discover/install/trust over signed, certified artifacts

- **Status:** Accepted (reframed to **Registry distribution**; **monetization removed** — no free/paid/rev-share, no `billing` port — [ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md))
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 48 — collapsed into Registry distribution](../48-marketplace-ecosystem.md) · [ADR-0024 — Portability conformance guarantee](./ADR-0024-portability-conformance-guarantee.md) (never-gate-portability) · [Plan 6 — Registry](../06-ai-native-agent-auth.md) · [Plan 27 — Drivers/Packs/Profiles](../27-drivers-packs-profiles.md) (Resource Packs, `hobo pack add`) · [Plan 12](../12-security-multitenancy.md) (identity, signing, provenance) · [Plan 9](../09-verification-open-questions.md)/[Plan 24](../24-wit-interfaces-reference.md) (`@hobo/conformance`) · [Plan 33 — Forge generation](../33-forge-generation-pipeline.md) (Forge-generatable listings; no community bottleneck) · [Plan 25 — Matching](../25-resource-definitions-matching.md)/[ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) (install ≠ force; deterministic bind) · [ADR-0036 — Air-gapped](./ADR-0036-air-gapped-sovereign-mode.md) (offline-bundle install) · [Plan 11](../11-event-model.md) (`listing.*`)
- **Origin:** Plans 40/42/43 each *deferred* "a marketplace of X" — a standing forward-reference the suite never resolved. The primitives all existed (Registry, signed Packs, conformance, provenance); the distribution lifecycle tying them together did not.

## Context
HoBo has every primitive distribution needs — a Registry, signed Resource Packs, `@hobo/conformance`, provenance, and MCP — and several plans explicitly punted "a marketplace of X" to later. Without a unifying lifecycle, third-party/community distribution stays ad-hoc. The risk to avoid: distribution that becomes a lock-in lever, contradicting the portability guarantee that is HoBo's core promise. **Monetization is explicitly out of scope** — HoBo is an AI-native meta-cloud, not a commerce product ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)); this is **Registry distribution**, not a storefront.

## Decision
1. **Registry distribution is a governed index + lifecycle over existing signed/certified artifacts**, not new infrastructure or new artifact types. Listings = providers / Resource Packs / policy packs / agent-skills / runbooks / Hobo-Code modules / guardrails+model cards.
2. **Publish = sign + conformance-certify + provenance** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 12](../12-security-multitenancy.md)/[Plan 9](../09-verification-open-questions.md)/[Plan 33](../33-forge-generation-pipeline.md)) — the same trust boundary every adapter crosses; uncertified ⇒ unlisted (`listing.Published`/`Certified`).
3. **Discover is capability-indexed and agent-drivable** (WIT port + Matching criteria + region/classification), surfaced via MCP so the Forge/agents can install as part of planning.
4. **Install = `hobo add`, bound by Matching** ([Plan 25](../25-resource-definitions-matching.md)) — installing makes an artifact *available* to deterministic selection, never forces its use; air-gap installs via signed offline bundle ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)).
5. **Trust = provenance tier + publisher identity + ratings** (a composite derived from facts; policy packs can require a minimum tier). **Portability is never gated** ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)): conformance, ports, import/export, and the swap-for-an-equivalent escape hatch are always free and open; the Forge guarantees an equivalent can always be generated. **No monetization** — Registry distribution carries no free/paid/rev-share tiers and no `billing` port ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)).

## Alternatives considered
- **A free-for-all upload marketplace (npm-style, trust-by-popularity).** Rejected: HoBo's value is the conformance/provenance trust boundary; bypassing it for distribution would import the supply-chain risks HoBo exists to remove.
- **Make the marketplace a new store with its own artifact format.** Rejected: duplicates the Registry/signing/conformance; listings are existing artifacts plus distribution metadata.
- **Monetize distribution (free/paid/rev-share, a `billing` port).** Removed — out of scope ([ADR-0064](./ADR-0064-scope-ai-native-meta-cloud.md)): HoBo is a meta-cloud, not a commerce product. Registry distribution carries no commercial tiers; portability/conformance/escape-hatch stay always-free regardless.
- **Force-bind on install.** Rejected: would make installing risky and break deterministic Matching; install adds a candidate, Matching decides.
- **Human-only web storefront.** Rejected as the *only* surface: agent-drivable MCP discovery is required for the AI-native thesis; a web UI is additive and deferred.

## Consequences
- **(+)** Operationalizes the long-deferred marketplace with almost no new machinery — a `listing.*` lifecycle + capability index over already-signed/certified artifacts; turns the Forge + Crew into composable *community* surfaces.
- **(+)** Trust is fact-derived (provenance tier + conformance + identity), so enterprises can govern their own supply chain via policy; agents can safely self-serve dependencies.
- **(+)** The never-gate-portability invariant is enforced structurally (Forge guarantees an equivalent), so the marketplace can't become lock-in — a differentiator vs closed-PaaS app stores.
- **(−)** Curation/moderation and a real storefront UX are real product work, deferred; v1 is CLI/MCP + a few listing kinds.
- **(−)** Yank propagation to already-deployed Sets is delicate (warn vs block vs forced migration) — an iteration hook; getting it wrong either breaks running apps or leaves vulns deployed.
- **(−)** A vibrant third-party ecosystem raises the stakes on conformance-suite quality — a weak suite would certify weak artifacts.
