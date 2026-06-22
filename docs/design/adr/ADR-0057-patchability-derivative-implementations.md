# ADR-0057 — Patchability as a first-class guarantee (distinct from portability)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 43 — Patchability & extensibility](../43-patchability-extensibility.md) · [ADR-0024 — Portability conformance guarantee](./ADR-0024-portability-conformance-guarantee.md) (the sibling guarantee) · [Plan 3](../03-providers-iac.md)/[Plan 27](../27-drivers-packs-profiles.md) (adapters/packs/drivers) · [Plan 9](../09-verification-open-questions.md) (conformance) · [Plan 12](../12-security-multitenancy.md) (signing/provenance) · [Plan 33](../33-forge-generation-pipeline.md) (Forge-generated derivatives) · [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) (persisted patches) · [ADR-0037](./ADR-0037-sdk-codegen-surface.md) (drift gate) · [ADR-0020](./ADR-0020-monetization-model.md) (Yard-is-a-Bindle)
- **Origin:** the vision states "**Patchable** — allowing derivative implementations and extensible plugin capabilities; **not just portability**." The capability existed (ports everywhere, Resource Packs, Forge, persisted mutation) but was never named as a goal distinct from portability (only [ADR-0024](./ADR-0024-portability-conformance-guarantee.md) was stated).

## Context
HoBo's stated guarantee was **portability** ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)): the same artifact runs unmodified on N backends. But the architecture also affords something portability does not: you can **change HoBo itself** — every engine is behind a port, every seam is an adapter, the Yard is a Bindle, and AI/human edits persist via region-scoped AST mutation ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)). The vision elevates this to a named goal ("not just portability"). Naming it makes the extension seams a *contract* and clarifies that derivatives stay trustworthy via the same conformance/signing machinery.

## Decision
1. **Adopt patchability as a first-class guarantee, distinct from portability.** Definition: *you can derive your own HoBo (swap any engine, add any adapter, fork the Yard) and persist AI/human patches, and a conforming derivative is a trusted, upgradable first-class citizen.* Portability = the user's app isn't locked to a backend; patchability = the platform isn't a black box.
2. **Three pillars** ([Plan 43](../43-patchability-extensibility.md)): **(a) derivative implementations** behind the same WIT ports, distributed as signed Resource Packs/plugins, human- or Forge-generated; **(b) enumerated extension seams** (providers/IaC/build, capability providers, runtimes/`component-host`, drivers, engines, Resource Defs/Packs/Profiles, agent-skills, projection sinks, `ui-render`) — adding an implementation never edits the core; **(c) persisted patches** via region-scoped, format-preserving AST mutation + signed provenance ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)), round-trippable + drift-gated ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)).
3. **Conformance is the trust bridge for both guarantees.** The same `@hobo/conformance` suite ([Plan 9](../09-verification-open-questions.md)) + signing/provenance ([Plan 12](../12-security-multitenancy.md)) that make a *swapped backend* safe (portability) make a *derived implementation* safe (patchability). A derivative that passes conformance is trusted; one that doesn't is rejected.
4. **Never gate patchability behind a paid tier** — consistent with [ADR-0020](./ADR-0020-monetization-model.md)'s portability stance; OSS core is self-hostable and forkable.

## Alternatives considered
- **Leave it under "portability" / "extensibility" (don't name it).** Rejected: the vision explicitly distinguishes them ("not just portability"); conflating them hides that HoBo lets you change the *platform*, not just move the *app*.
- **Allow arbitrary core forks without conformance.** Rejected: an unconformant derivative isn't trustworthy or upgradable; conformance is the price of first-class-citizen status.
- **Free-form runtime code mutation (no region/provenance discipline).** Rejected: that's an ephemeral hack, not a durable derivative; [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)'s region-scoping + provenance is what makes a patch maintainable.

## Consequences
- **(+)** Names a real differentiator (closed PaaS has neither portability nor patchability; raw IaC lacks portability) and turns the extension seams into a stable, enumerated contract.
- **(+)** Reuses existing machinery (ports, conformance, signing, packs, ADR-0048) — naming + enumeration, not new mechanism.
- **(+)** Derivatives, persisted patches, and swapped engines all ride one trust bridge (conformance), so the platform stays open *and* safe.
- **(−)** Long-lived derivatives need an upstream-tracking/upgrade story (how a fork follows core semver) — deferred, an iteration hook.
- **(−)** More public surface area to keep stable (the enumerated seams become a compatibility commitment); offset by WIT/conformance versioning.
- **(−)** Trust for third-party derivatives needs a signing/attestation chain beyond v1's basics ([Plan 12](../12-security-multitenancy.md)).
