# ADR-0068 — Derivative upgrade paths: seam versioning & compat for forks/patches

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering
- **Related:** [Plan 43 — Patchability & extensibility](../43-patchability-extensibility.md) · [ADR-0057 — Patchability guarantee](./ADR-0057-patchability-derivative-implementations.md) · [ADR-0048 — Persisted code-mutation mechanism](./ADR-0048-persisted-code-mutation-mechanism.md) · [ADR-0024 — Portability conformance](./ADR-0024-portability-conformance-guarantee.md) · [ADR-0037 — SDK codegen / drift gate](./ADR-0037-sdk-codegen-surface.md) · [Plan 9 — Conformance](../09-verification-open-questions.md) · [Plan 12 — Signing/provenance](../12-security-multitenancy.md) · [Plan 27 — Drivers/Packs](../27-drivers-packs-profiles.md)

## Context
[ADR-0057](./ADR-0057-patchability-derivative-implementations.md) makes **patchability** a first-class guarantee: swap any engine, add any adapter, fork the Yard, persist AI/human patches ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)) — all trusted via `@hobo/conformance`. But it explicitly **defers** the upgrade story: *"long-lived derivatives need an upstream-tracking/upgrade story — deferred, an iteration hook."* That deferral undermines the moat: a fork that swaps the policy engine, adds custom drivers, and persists patches has no defined answer for "core ships v1.1 with a breaking WIT-port change." Without it, derivatives rot or fork permanently.

## Decision
Give derivatives a **versioned, conformance-gated upgrade path**.

1. **Seams are independently semver-versioned.** Each extension seam (a WIT port: `policy-engine`, `contract-engine`, `component-host`, a provider/driver/runtime/projection-sink) carries a semver; a Yard pins the seam versions it requires, and the manifest IR records which seam versions a Bindle uses (proven by its conformance run).
2. **A signed `derivative.json` descriptor.** A derivative publishes (signed, [Plan 12](../12-security-multitenancy.md)): the **core version range** it targets (`core@^1.0.0 <1.1.0`), its **seam implementations + versions** (`policy-engine@2.3.0`, `custom-aws-driver@1.0.0`), and **pinned upcasters** for any persisted mutations ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)) — codemods that repair the hand-written/generated regions on a core upgrade.
3. **An `hobo derivative upgrade <from> <to>` ceremony.** In a derivative Yard it: checks `derivative.json` compatibility (warns on any seam/mutation incompatibility), runs the pinned upcasters, **re-runs seam conformance** to prove the upgrade didn't regress a guarantee, and emits an upgrade report. Events: `derivative.UpgradeStarted` · `derivative.UpgradeSucceeded` · `derivative.UpgradeFailed`.
4. **Core releases ship a breaking-change manifest.** Each core release publishes the seam/port changes with upcaster hints (*"`policy-engine` gained decision field X — here's the migration"*), so a derivative author writes targeted upcasters instead of reverse-engineering the diff. Conformance is the bridge: a derivative that re-passes the suite post-upgrade is a trusted, upgradable first-class citizen ([ADR-0057](./ADR-0057-patchability-derivative-implementations.md)).

## Alternatives considered
- **Leave upgrades undefined (status quo deferral).** Rejected: it's the documented blocker on the patchability moat; long-lived forks are the point.
- **Forbid breaking seam changes.** Rejected: unrealistic over the platform's life; semver + upcasters + conformance handle breakage honestly.
- **Auto-rebase derivatives on core (no descriptor/ceremony).** Rejected: silent rebasing of a fork's swapped engines/patches is exactly the un-auditable mutation [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) rejects; the ceremony is explicit + gated.

## Consequences
- **(+)** Closes the deferred patchability gap: derivatives are maintainable across core releases, not abandon-ware.
- **(+)** Reuses semver + conformance + signing + [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) upcasters + the drift gate ([ADR-0037](./ADR-0037-sdk-codegen-surface.md)) — a descriptor + a ceremony + events, not new runtime.
- **(−)** A compatibility commitment: the enumerated seams ([Plan 43](../43-patchability-extensibility.md)) become a versioned public surface the core must evolve carefully (offset by WIT/conformance versioning).
- **(−)** Upcaster authoring burden falls partly on derivative authors; core breaking-change manifests + hints reduce but don't remove it.
