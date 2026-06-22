# Architecture Decision Records (ADR) — index

> Part of the [HoBo Design Plan Suite](../README.md). This directory holds **one file per decision**, the convention adopted from ADR-0018 onward. Earlier decisions (ADR-0001…0017) remain in the consolidated [18 — ADR log](../18-adr-log.md); they are listed here for a single chronological view.
>
> **Format (house style):** `Status · Context · Decision · Consequences`, plus (for per-file ADRs) `Date`, `Deciders`, `Related`, and `Alternatives considered`. Statuses: **Proposed · Accepted · Superseded · Deprecated**. ADRs are the things we should be deliberate about *unmaking*.

## How ADRs are numbered
- IDs are global and monotonic across the whole suite: `ADR-NNNN`.
- ADR-0001…0017 live in [`../18-adr-log.md`](../18-adr-log.md) (one section each).
- ADR-0018+ live here as `ADR-NNNN-<slug>.md`.
- Open/proposed-but-undecided items use `ADR-Pn` and are tracked at the bottom of [`../18-adr-log.md`](../18-adr-log.md).

## Index

| ID | Title | Status | Source |
|---|---|---|---|
| 0001 | TS-native control-plane core (Kubernetes optional) | Accepted | [18-adr-log](../18-adr-log.md#adr-0001--ts-native-control-plane-core-kubernetes-optional) |
| 0002 | Pluggable durable ports + a built-in engine ("Worlds") | Accepted | [18-adr-log](../18-adr-log.md) |
| 0003 | Event sourcing + CQRS as the foundation | Accepted | [18-adr-log](../18-adr-log.md) |
| 0004 | Choreography sagas + virtual actors | Accepted | [18-adr-log](../18-adr-log.md) |
| 0005 | One ports/adapters shape for cloud, IaC, build/VM | Accepted | [18-adr-log](../18-adr-log.md) |
| 0006 | Pulumi Automation API as primary IaC | Accepted | [18-adr-log](../18-adr-log.md) |
| 0007 | Provider-specific options via typed `.with(...)` | Accepted | [18-adr-log](../18-adr-log.md) |
| 0008 | Keyless agent identity (SVID/OIDC) + token broker | Accepted | [18-adr-log](../18-adr-log.md) |
| 0009 | Capability Manifest capability/auth standard + Registry | Accepted | [18-adr-log](../18-adr-log.md) |
| 0010 | Forge: AI-generated providers gated by conformance | Accepted | [18-adr-log](../18-adr-log.md) |
| 0011 | `bindle.ts` (what) vs `hobo.config.ts` (where/how) | Accepted | [18-adr-log](../18-adr-log.md) |
| 0012 | Firecracker-sandboxed, credential-scoped executors | Accepted | [18-adr-log](../18-adr-log.md) |
| 0013 | Per-resource IaC stacks (default) | Accepted | [18-adr-log](../18-adr-log.md) |
| 0014 | MCP as a first-class control surface | Accepted | [18-adr-log](../18-adr-log.md) |
| 0015 | Contracts & policy are HoBo-native planes; engines behind ports | Accepted | [18-adr-log](../18-adr-log.md) |
| 0016 | A single `can-deploy`/Gatekeeper gate composes all checks | Accepted | [18-adr-log](../18-adr-log.md) |
| 0017 | Policy obligations are durable effects, not advice | Accepted | [18-adr-log](../18-adr-log.md) |
| 0018 | Requirements-artifact structure & traceability scheme | Accepted | [ADR-0018](./ADR-0018-requirements-structure-and-traceability.md) |
| 0019 | Persona prioritization / primary ICP | Accepted | [ADR-0019](./ADR-0019-persona-prioritization-icp.md) |
| 0020 | Monetization model (OSS core + hosted Yard + marketplace) | Accepted | [ADR-0020](./ADR-0020-monetization-model.md) |
| 0021 | NFR baselines / committed SLOs for v1 | Proposed | [ADR-0021](./ADR-0021-nfr-baselines-slos.md) |
| 0022 | MVP scope line / MoSCoW mapped to phases | Accepted | [ADR-0022](./ADR-0022-mvp-scope-moscow.md) |
| 0023 | Security posture commitments for v1 | Accepted | [ADR-0023](./ADR-0023-security-posture-commitments.md) |
| 0024 | Portability conformance guarantee ("same Bindle, N clouds") | Accepted | [ADR-0024](./ADR-0024-portability-conformance-guarantee.md) |
| 0025 | `"use training"` directive + `training-engine` behind a port (Agent Lightning/Trace optional, internal) | Accepted | [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md) |
| 0026 | Scope model `Yard ⊃ Camp ⊃ Bindle`; remove "World" (fold into Camp) | Accepted | [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md) |
| 0027 | Secretless-first configuration & secrets | Accepted | [ADR-0027](./ADR-0027-secretless-config-and-secrets.md) |
| 0028 | Multi-Camp deployment model (cardinality, naming, atomicity) | Accepted | [ADR-0028](./ADR-0028-multi-camp-deployment-model.md) |
| 0029 | Reactive / live-query model (event-log reactor) | Accepted | [ADR-0029](./ADR-0029-reactive-live-query-model.md) |
| 0030 | Forge generation: inputs & algorithm | Accepted | [ADR-0030](./ADR-0030-forge-generation-inputs-and-algorithm.md) |
| 0031 | wasm host of record & runtime substrate (`component-host` port) | Accepted | [ADR-0031](./ADR-0031-wasm-host-of-record-and-runtime-substrate.md) |
| 0032 | Data portability & schema-versioning strategy | Accepted | [ADR-0032](./ADR-0032-data-portability-schema-versioning.md) |
| 0033 | Deterministic Matching & Planner selection (+ default objective; resolves ADR-P4) | Accepted | [ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) |
| 0034 | Search & vector surface (unified `search` port + `embed`) | Accepted | [ADR-0034](./ADR-0034-search-vector-surface.md) |
| 0035 | Custom domains & multi-cloud ingress (Yard-level `domain` + `dns`) | Accepted | [ADR-0035](./ADR-0035-custom-domains-and-multi-cloud-ingress.md) |
| 0036 | Air-gapped / sovereign Yard mode (zero-egress profile + signed bundle import) | Accepted | [ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md) |
| 0037 | SDK codegen surface & policy (checked-in `_generated/`) | Accepted | [ADR-0037](./ADR-0037-sdk-codegen-surface.md) |
| 0038 | End-user / application auth (federate+verify; unified `PrincipalRef`) | Accepted | [ADR-0038](./ADR-0038-end-user-application-auth.md) |
| 0039 | Billing, quota & cost attribution (event-sourced metering; `billing` port) | Accepted | [ADR-0039](./ADR-0039-billing-quota-cost-attribution.md) |
| 0040 | Cross-Camp stateful consistency (declared topology; single-writer default) | Accepted | [ADR-0040](./ADR-0040-cross-camp-stateful-consistency.md) |
| 0041 | Migration & onboarding (`hobo import` adopt-in-place; strangler-fig) | Accepted | [ADR-0041](./ADR-0041-migration-onboarding.md) |
| 0042 | Local-dev fidelity (simulate / mock / Camp-only matrix) | Accepted | [ADR-0042](./ADR-0042-local-dev-fidelity.md) |
| 0043 | Multi-Yard federation: the Junction (peer; v1 single-Yard, federation-ready) | Accepted | [ADR-0043](./ADR-0043-multi-yard-federation-junction.md) |
| 0044 | Feature flags & progressive delivery (OpenFeature-compatible port) | Accepted | [ADR-0044](./ADR-0044-feature-flags-progressive-delivery.md) |
| 0045 | SLO-as-code, error-budget gating & alerting model (OpenSLO / AlertManager-style) | Accepted | [ADR-0045](./ADR-0045-slo-as-code-and-alerting.md) |
| 0046 | Boundary standards: CloudEvents · OCSF · OTLP | Accepted | [ADR-0046](./ADR-0046-boundary-standards-cloudevents-ocsf-otlp.md) |
| 0047 | Chaos / continuous-resilience verification tier | Accepted | [ADR-0047](./ADR-0047-chaos-resilience-verification-tier.md) |
| 0048 | Persisted code-mutation mechanism (`"use training"` promotion) | Accepted | [ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md) |
| 0049 | Reserve "Hobo Code" for the configuration + code DSL (rename auth standard → Capability Manifest) | Accepted | [ADR-0049](./ADR-0049-hobo-code-dsl-reservation.md) |
| 0050 | Event-sourced-by-default app domain data; backends are projection sinks | Accepted | [ADR-0050](./ADR-0050-event-sourced-domain-data-projection-sinks.md) |
| 0051 | WIT records as the canonical domain schema (TS + protobuf + Zod generated) | Accepted | [ADR-0051](./ADR-0051-wit-record-canonical-domain-schema.md) |
| 0052 | Projection-sink paradigm taxonomy & the reactivity boundary | Accepted | [ADR-0052](./ADR-0052-projection-sink-paradigm-taxonomy.md) |

> ADR-0021 is **Proposed** (SLO numbers need stakeholder ratification — see the open ADR-P series in the log). ADR-0023/0024 were produced by the requirements review/hardening pass (see [`../../../plans/README.md`](../../../plans/README.md)). ADR-0026 supersedes the *naming* in ADR-0002 ("Worlds") — the decision (pluggable durable ports + built-in engine) stands.
