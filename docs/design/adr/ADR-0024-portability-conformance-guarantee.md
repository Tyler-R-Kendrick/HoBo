# ADR-0024 — Portability conformance guarantee ("same Bindle, N clouds")

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Engineering, Platform, Product
- **Related:** [PRD §NFRs](../../requirements/PRD.md) · [TRD §5.1/§5.2/§6](../../requirements/TRD.md) · [00 Vision](../00-vision.md) · [01 Monorepo](../01-monorepo.md) · [03 Providers/IaC](../03-providers-iac.md) · [24 WIT worlds](../24-wit-worlds-reference.md) · open ADR-P/Q11 in [18-adr-log](../18-adr-log.md)
- **Origin:** the requirements portability review (see [`plans/README.md`](../../../plans/README.md), findings P-01…07).

## Context
HoBo's core promise — *"write once, deploy to N clouds, unedited; self-host = hosted"* — was stated as vision and high-level NFRs (NFR-001/013), but the **defensive mechanisms** that keep it from silently eroding were missing or undefined: "unedited" had no formal meaning, the agnostic-core layering invariant had no enforced check, Worlds portability wasn't proven across ≥2 Worlds, there was no lock-in detection, no World/upstream version policy, and no explicit self-host/hosted parity statement. A promise without a conformance mechanism degrades to marketing.

## Decision
Make portability a **conformance guarantee** with verifiable mechanisms (each lands as an `NFR`/`FR`/`TR`):
1. **Define "unedited" precisely** — across cloud targets the `bindle.ts` **and** application source (`src/`) are **byte-identical**; only `hobo.config.ts` and CLI/env parameters may change. The `multi-cloud-shop` E2E proves it by deploying an unchanged `bindle.ts` to ≥2 providers and asserting identical resource topology + bindings. (NFR-001, TRD §5.1)
2. **Enforce the layering invariant in CI** — a dependency-graph lint gate (e.g. `depcheck`/`madge`) fails the build if `@hobo/core` (or any agnostic package) imports a provider/iac/build package, or if an adapter imports another adapter. The agnostic core cannot leak provider detail. (TR-006, NFR-020)
3. **Prove Worlds portability** — at least one example runs unchanged on ≥2 Worlds (e.g. `world-local` and `world-postgres`) with only a World override, asserting identical lifecycle (replay==live). (TR-012)
4. **Detect lock-in** — `hobo doctor` warns (non-blocking, explained) when a resource has provider-specific `.with()` for only one provider, or uses a static key where federation is available. (FR-014)
5. **Pin upstream + define a version policy** — exact pins for Pulumi Automation API / WASI-WIT / MCP; World port versions are recorded in the manifest IR and are immutable for a Bindle version; upgrades go through an explicit, gated `hobo upgrade` path with a compat/upgrade test in CI. A version-mismatch fails planning with a precise reason. (TR-013) The deeper `hobo:*` versioning question remains open (ADR-P/Q11); this is the v1 default.
6. **State self-host/hosted parity** — self-host and hosted ship the **same code and the same control-plane features** (identity, policy, audit, conformance, observability); the **only** differences are operational and the hosted-only revenue features (chargeback/billing, managed multi-region HA, org SSO/RBAC). A hosted-gated feature must be explicitly documented and must not silently weaken self-host security. (NFR-013)

## Alternatives considered
- **Keep portability as vision + NFR-001 only** — rejected: the promise erodes the first time someone imports a provider into the core or ships a Bindle that only runs on one cloud, with nothing to catch it.
- **Block on lock-in (hard fail) instead of warn** — rejected for v1: provider-specific optimization is a *feature* (`.with()`); a warning preserves intent while surfacing risk. Revisit if drift proves common.
- **Resolve `hobo:*` versioning fully now** — deferred (ADR-P/Q11); this ADR commits the v1 pin-and-gate default without prejudging the long-term scheme.

## Consequences
- **(+)** "Same Bindle, N clouds" and "self-host = hosted" become testable gates (CI lint, ≥2-World E2E, multi-cloud E2E, parity tests), not slogans.
- **(+)** Lock-in and upstream churn — the two ways portability quietly dies — now have explicit detection/isolation requirements.
- **(−)** The CI dep-graph lint and the ≥2-World E2E add engineering cost and a second mature World earlier than strictly required for a single-cloud demo.
- **(−)** The version-pinning policy adds an upgrade ceremony; mitigated by making it explicit and gated rather than implicit.
