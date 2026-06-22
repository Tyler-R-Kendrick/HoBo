# Plan 48 — Marketplace & ecosystem — COLLAPSED INTO THE REGISTRY

> **Removed as a standalone plane — out of scope of an AI-native meta-cloud refocus ([ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md)).** The publish → discover → install → trust lifecycle (`listing.*`) folds into the **Registry** ([Plan 6](./06-ai-native-agent-auth.md)) + **Resource Packs** ([Plan 27](./27-drivers-packs-profiles.md)) as **Registry distribution** over signed/certified artifacts. **Monetization is removed** — no free/paid/rev-share, no `billing` port; HoBo is not a commerce product ([ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md)).

## What was kept (folded into Registry distribution)
- The **`listing.*`** lifecycle (`Published` / `Certified` / `Installed` / `Yanked`, [Plan 11](./11-event-model.md)) — publish → discover → install → trust over the **Registry** ([Plan 6](./06-ai-native-agent-auth.md)) + **Resource Packs** ([Plan 27](./27-drivers-packs-profiles.md)).
- **Publish = sign + `@hobo/conformance`-certify + provenance** ([Plan 9](./09-verification-open-questions.md)/[Plan 12](./12-security-multitenancy.md)/[Plan 33](./33-forge-generation-pipeline.md)) — uncertified ⇒ unlisted.
- **Capability-indexed, agent-drivable discovery** (WIT port + Matching criteria + region/classification, MCP-surfaced); **install = `hobo add`, bound by Matching** ([Plan 25](./25-resource-definitions-matching.md)).
- **Trust gates** — provenance tier + publisher identity + ratings; policy packs can require a minimum tier ([Plan 30](./30-policy-plane.md)). Air-gap installs via signed offline bundle ([ADR-0036](./adr/ADR-0036-air-gapped-sovereign-mode.md)).

## What was dropped
- **Monetization** entirely — free/paid/rev-share, the `billing` port, and the ADR-0020 references (ADR-0020 deleted, [ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md)). Registry distribution is not a storefront.
- The framing of the marketplace as a separate **plane** (it is Registry distribution, not a plane).

See [ADR-0062](./adr/ADR-0062-marketplace-ecosystem.md) (reframed: **Registry distribution** — publish/discover/install/trust over signed/certified artifacts; no monetization) and [ADR-0064](./adr/ADR-0064-scope-ai-native-meta-cloud.md).
