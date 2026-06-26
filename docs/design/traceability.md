# HoBo ADR and Plan Traceability

This report is the M0 traceability gate for HOBO-11. It maps every current design plan and every
numbered ADR in the design index to the Linear implementation slices that prove the decision is not
only documented, but has an implementation home.

## Sources

- Plan index: [README.md](./README.md)
- ADR index: [adr/README.md](./adr/README.md)
- Backlog mirror: [../implementation-plan.md](../implementation-plan.md)
- Live source of truth: Linear team `HoBo`, issues `HOBO-1` through `HOBO-399`

Open/proposed `ADR-Pn` items are intentionally excluded from the numbered ADR completeness count
until they are accepted as monotonic `ADR-NNNN` entries.

## Coverage Rules

- Every plan anchor from the design index must appear in this file as `PLAN-NN`.
- Every numbered ADR from the ADR index must appear in this file as `ADR-NNNN`.
- Each row names concrete `HOBO-N` issue coverage or an issue family recorded in the Linear backlog.
- A coverage row is not considered enough if it only names a broad subsystem without a testable
  assertion; the `Coverage assertion` column states what the issue family must prove.

## Plan Coverage

| Plan | Source | Coverage assertion | Primary issues |
|---|---|---|---|
| PLAN-00 | [vision.md](./vision.md#plan-00) | Product scope and guiding principles remain represented in the implementation backlog. | HOBO-10, HOBO-11 |
| PLAN-17 | [vision.md](./vision.md#plan-17) | Competitive positioning does not create hidden scope outside the 15 subsystem backlog. | HOBO-10, HOBO-11 |
| PLAN-10 | [architecture.md](./architecture.md#plan-10) | Repository structure, WIT-first architecture, package boundaries, and build conventions have branch-sized owners. | HOBO-1, HOBO-2, HOBO-3, HOBO-4, HOBO-5, HOBO-6, HOBO-7, HOBO-10, HOBO-11 |
| PLAN-04 | [control-plane.md](./control-plane.md#plan-04) | Planning, matching, resource actors, executors, deltas, BuildProvider outputs, execution-host provider categories, and orchestration are covered by control-plane slices. | HOBO-39, HOBO-41, HOBO-45, HOBO-47, HOBO-50, HOBO-55, HOBO-59, HOBO-61, HOBO-64, HOBO-68, HOBO-72, HOBO-73, HOBO-78, HOBO-81, HOBO-82, HOBO-86, HOBO-95, HOBO-97, HOBO-103, HOBO-109, HOBO-145, HOBO-149, HOBO-153, HOBO-174, HOBO-186, HOBO-199 |
| PLAN-02 | [sdk-api.md](./sdk-api.md#plan-02) | SDK authoring surfaces, generated code, IfC collection, permissions, and local testing are tied to SDK slices. | HOBO-9, HOBO-37, HOBO-38, HOBO-40, HOBO-43, HOBO-49, HOBO-52, HOBO-58, HOBO-62, HOBO-67, HOBO-70, HOBO-75, HOBO-79, HOBO-83, HOBO-88, HOBO-98, HOBO-106, HOBO-386, HOBO-389, HOBO-392, HOBO-394, HOBO-396, HOBO-398, HOBO-399 |
| PLAN-06 | [ai-native-agent-auth.md](./ai-native-agent-auth.md#plan-06) | Agent identity, end-user auth, XAA, token brokerage, MCP operations, workload attestation, auth events, and high-risk approval hooks have security slices. | HOBO-43, HOBO-44, HOBO-48, HOBO-54, HOBO-56, HOBO-63, HOBO-66, HOBO-71, HOBO-77, HOBO-84, HOBO-90, HOBO-98, HOBO-99, HOBO-110, HOBO-136, HOBO-158, HOBO-162, HOBO-166, HOBO-168, HOBO-230, HOBO-271, HOBO-333 |
| PLAN-11 | [data-plane.md](./data-plane.md#plan-11) | EventEnvelope, replay, ActorHost fencing/passivation, queues, streams, runbook events, and projection semantics are assigned to runtime/data-plane slices. | HOBO-2, HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-24, HOBO-25, HOBO-30, HOBO-57, HOBO-60, HOBO-69, HOBO-74, HOBO-104, HOBO-241, HOBO-260 |
| PLAN-32 | [data-plane.md](./data-plane.md#plan-32) | Data model, projections, pagination, migration, search, and paradigm packages have runtime/data-plane or SDK package owners. | HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-30, HOBO-60, HOBO-65, HOBO-67, HOBO-69, HOBO-74, HOBO-76, HOBO-80, HOBO-104, HOBO-107, HOBO-248, HOBO-252, HOBO-389 |
| PLAN-05 | [reliability-observability-cost.md](./reliability-observability-cost.md#plan-05) | Telemetry envelopes, OpenInference trajectory capture, structured logs, SLOs, cost, sagas, budgets, burn rate, SRE projection diagnosis, golden suites, compensation escalation, and data-flywheel retention/sampling map to reliability and policy slices. | HOBO-25, HOBO-39, HOBO-104, HOBO-141, HOBO-146, HOBO-155, HOBO-192, HOBO-241, HOBO-243, HOBO-246, HOBO-249, HOBO-253, HOBO-259, HOBO-272, HOBO-274, HOBO-276, HOBO-277, HOBO-290, HOBO-315, HOBO-328, HOBO-332, HOBO-335, HOBO-339, HOBO-364 |
| PLAN-12 | [security-networking.md](./security-networking.md#plan-12) | Security, ingress, gateway, DNS, certs, custom domains, per-run encrypted trajectory payloads, and data-flywheel privacy boundaries have dedicated security/networking slices. | HOBO-44, HOBO-48, HOBO-54, HOBO-56, HOBO-71, HOBO-90, HOBO-136, HOBO-138, HOBO-142, HOBO-144, HOBO-148, HOBO-151, HOBO-155, HOBO-159, HOBO-163, HOBO-335, HOBO-364 |
| PLAN-50 | [security-networking.md](./security-networking.md#plan-50) | Multi-tenant app isolation, tenant routing, and cross-tenant guardrails are policy/security/networking work. | HOBO-56, HOBO-63, HOBO-142, HOBO-154, HOBO-158, HOBO-162 |
| PLAN-07 | [developer-experience.md](./developer-experience.md#plan-07) | CLI verbs, dev loop, inspect/logs/doctor/codegen/build/collect, and MCP parity have implementation slices. | HOBO-8, HOBO-115, HOBO-118, HOBO-132, HOBO-136, HOBO-140, HOBO-143, HOBO-147, HOBO-152, HOBO-156, HOBO-160, HOBO-164, HOBO-168, HOBO-176, HOBO-332 |
| PLAN-49 | [developer-experience.md](./developer-experience.md#plan-49) | Dashboard/status-page availability and operational read views are covered by projection and DX slices. | HOBO-104, HOBO-140, HOBO-146 |
| PLAN-20 | [wasm-runtime-wit.md](./wasm-runtime-wit.md#plan-20) | WIT versioning, WIT packages, component host, runtime ports, transport, and SDK conformance are covered. | HOBO-3, HOBO-4, HOBO-12, HOBO-13, HOBO-14, HOBO-15, HOBO-16, HOBO-17, HOBO-18, HOBO-19, HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-24, HOBO-25, HOBO-26, HOBO-27, HOBO-28, HOBO-29, HOBO-30, HOBO-31, HOBO-32, HOBO-33, HOBO-34, HOBO-35, HOBO-36 |
| PLAN-21 | [authoring-resources-wiring.md](./authoring-resources-wiring.md#plan-21) | Resource catalog, manifest IR, wiring, config/secrets, provider options, and Hobo Code are owned by SDK slices. | HOBO-37, HOBO-38, HOBO-40, HOBO-43, HOBO-49, HOBO-52, HOBO-62, HOBO-67, HOBO-70, HOBO-75, HOBO-79, HOBO-83, HOBO-88, HOBO-386, HOBO-392, HOBO-394 |
| PLAN-25 | [platform-engineering.md](./platform-engineering.md#plan-25) | Matching, environments, providers, drivers, packs, GitOps, Relay, pipelines, and the runbook contract consumed by the Pipelines sibling engine have control/provider/operator owners. | HOBO-45, HOBO-47, HOBO-50, HOBO-55, HOBO-61, HOBO-64, HOBO-68, HOBO-72, HOBO-73, HOBO-78, HOBO-81, HOBO-82, HOBO-86, HOBO-87, HOBO-93, HOBO-95, HOBO-97, HOBO-102, HOBO-103, HOBO-108, HOBO-109, HOBO-135, HOBO-139, HOBO-145, HOBO-149, HOBO-153, HOBO-174, HOBO-199, HOBO-260, HOBO-332, HOBO-362, HOBO-365, HOBO-383 |
| PLAN-29 | [contracts-policy-flags.md](./contracts-policy-flags.md#plan-29) | Contract gates, policy, obligations, RBAC, feature flags, generation promotion gates, and progressive delivery have policy/harness slices. | HOBO-119, HOBO-123, HOBO-128, HOBO-133, HOBO-137, HOBO-141, HOBO-146, HOBO-150, HOBO-154, HOBO-158, HOBO-162, HOBO-166, HOBO-192, HOBO-290, HOBO-319, HOBO-323, HOBO-326, HOBO-328, HOBO-333 |
| PLAN-09 | [generated-stack.md](./generated-stack.md#plan-09) | Verification/testing, conformance, golden suites, and generated-stack checks map to conformance/eval slices. | HOBO-5, HOBO-6, HOBO-7, HOBO-102, HOBO-104, HOBO-146, HOBO-327, HOBO-346, HOBO-357 |
| PLAN-23 | [generated-stack.md](./generated-stack.md#plan-23) | Generation IO, sandboxing, scaffold, LLM-fill, training trajectories, privacy boundaries, eval gates, policy gates, repair, provenance, certification, and provider generation have slices. | HOBO-7, HOBO-102, HOBO-108, HOBO-146, HOBO-307, HOBO-320, HOBO-321, HOBO-324, HOBO-327, HOBO-330, HOBO-333, HOBO-335, HOBO-346, HOBO-357, HOBO-364 |
| PLAN-40 | [operators-sre.md](./operators-sre.md#plan-40) | Crew operators, incidents, runbooks, read-only diagnosis, remediation envelopes, escalation, and DR map to Operators/SRE slices. | HOBO-141, HOBO-146, HOBO-251, HOBO-260, HOBO-270, HOBO-272, HOBO-276 |
| PLAN-46 | [governance-planes.md](./governance-planes.md#plan-46) | Compliance, data governance, AI safety, policy packs, lifecycle policy, and human obligations have policy/security slices. | HOBO-137, HOBO-141, HOBO-146, HOBO-150, HOBO-154, HOBO-158, HOBO-162, HOBO-166 |
| PLAN-19 | [worked-example.md](./worked-example.md#plan-19) | End-to-end example flow is covered by SDK, CLI, control-plane, provider, identity, and user-story slices. | HOBO-1, HOBO-37, HOBO-67, HOBO-70, HOBO-88, HOBO-115, HOBO-118, HOBO-160, HOBO-164, HOBO-396 |

## ADR Coverage

| ADR | Source | Coverage assertion | Primary issues |
|---|---|---|---|
| ADR-0001 | [architecture-core](./adr/01-architecture-core.md#adr-0001) | WASM/WASI/WIT-native architecture and optional Kubernetes/IaC choices are carried by foundation, WIT, and provider work. | HOBO-1, HOBO-3, HOBO-4, HOBO-12, HOBO-17, HOBO-28, HOBO-35, HOBO-87, HOBO-102 |
| ADR-0002 | [architecture-core](./adr/01-architecture-core.md#adr-0002) | Durable ports, ActorHost fencing, and Camp runtime are owned by runtime port and host slices. | HOBO-17, HOBO-18, HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-29, HOBO-30 |
| ADR-0003 | [architecture-core](./adr/01-architecture-core.md#adr-0003) | Event sourcing, CQRS, and materialized projections are reflected in core envelope and data/runtime issues. | HOBO-2, HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-103, HOBO-104 |
| ADR-0004 | [architecture-core](./adr/01-architecture-core.md#adr-0004) | Choreography sagas and virtual actors are assigned to runtime and orchestrator slices. | HOBO-13, HOBO-21, HOBO-68, HOBO-73, HOBO-109, HOBO-249 |
| ADR-0005 | [architecture-core](./adr/01-architecture-core.md#adr-0005) | One ports/adapters shape is enforced by core types, component/build artifact contracts, BuildProvider ImageRefs, provider ports, package boundary lint, and bind/container build-wiring. | HOBO-1, HOBO-2, HOBO-4, HOBO-45, HOBO-47, HOBO-49, HOBO-87, HOBO-93, HOBO-145, HOBO-199 |
| ADR-0006 | [architecture-core](./adr/01-architecture-core.md#adr-0006) | Pluggable IaC adapters and per-resource state are owned by provider/IaC slices. | HOBO-47, HOBO-72, HOBO-87, HOBO-97, HOBO-139, HOBO-174 |
| ADR-0007 | [architecture-core](./adr/01-architecture-core.md#adr-0007) | Provider-specific options are contractually pinned and implemented in provider package authoring. | HOBO-9, HOBO-52, HOBO-87, HOBO-93, HOBO-174 |
| ADR-0008 | [identity-security](./adr/02-identity-security.md#adr-0008) | Keyless agent identity, SVIDs, OIDC federation, and brokered tokens have identity slices. | HOBO-44, HOBO-48, HOBO-54, HOBO-71, HOBO-77, HOBO-84, HOBO-90, HOBO-99, HOBO-110, HOBO-136, HOBO-230 |
| ADR-0009 | [identity-security](./adr/02-identity-security.md#adr-0009) | Capability Manifest auth/capability standard and Registry flow have schema, provider, and distribution owners. | HOBO-2, HOBO-87, HOBO-93, HOBO-102, HOBO-120, HOBO-331, HOBO-343 |
| ADR-0010 | [data-plane](./adr/03-data-plane.md#adr-0010) | Generated providers are gated by conformance, generation, scaffold, LLM-fill, repair, policy, certification, and provenance work. | HOBO-5, HOBO-7, HOBO-102, HOBO-108, HOBO-146, HOBO-307, HOBO-320, HOBO-321, HOBO-324, HOBO-327, HOBO-330, HOBO-333, HOBO-346 |
| ADR-0011 | [architecture-core](./adr/01-architecture-core.md#adr-0011) | Scopes as SDK objects are covered by first-class topology and Hobo Code authoring work. | HOBO-9, HOBO-62, HOBO-394 |
| ADR-0012 | [identity-security](./adr/02-identity-security.md#adr-0012) | Credential-scoped executors and isolation tiers are owned by executor and identity slices. | HOBO-72, HOBO-77, HOBO-84, HOBO-90, HOBO-110 |
| ADR-0014 | [data-plane](./adr/03-data-plane.md#adr-0014) | MCP as control surface has CLI/MCP implementation and auth-scoping owners. | HOBO-115, HOBO-168, HOBO-176 |
| ADR-0015 | [identity-security](./adr/02-identity-security.md#adr-0015) | Contracts, policy planes, Gatekeeper, generation policy gates, and durable obligations map to policy issues. | HOBO-119, HOBO-123, HOBO-133, HOBO-137, HOBO-141, HOBO-146, HOBO-150, HOBO-154, HOBO-290, HOBO-333 |
| ADR-0018 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0018) | Requirements artifact and traceability are implemented by this audit and doc-lint hardening. | HOBO-10, HOBO-11 |
| ADR-0019 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0019) | Persona/ICP prioritization is preserved as plan and walkthrough coverage, not a separate runtime feature. | HOBO-10, HOBO-11, HOBO-362 |
| ADR-0021 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0021) | NFR/SLO targets map to reliability, SLO, Gatekeeper, and golden-suite work. | HOBO-104, HOBO-141, HOBO-146 |
| ADR-0023 | [identity-security](./adr/02-identity-security.md#adr-0023) | Secure-by-default posture maps to identity, policy, provenance, untrusted generation material, telemetry redaction at capture, and static-key hardening. | HOBO-7, HOBO-44, HOBO-48, HOBO-54, HOBO-90, HOBO-110, HOBO-146, HOBO-154, HOBO-253, HOBO-259, HOBO-271, HOBO-324, HOBO-335, HOBO-346, HOBO-364, HOBO-365 |
| ADR-0024 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0024) | Portability conformance guarantee is enforced by WIT, conformance suites, provider contracts, manifest upcasters, and swap escape hatches. | HOBO-3, HOBO-5, HOBO-12, HOBO-29, HOBO-30, HOBO-102, HOBO-153, HOBO-174, HOBO-386, HOBO-388 |
| ADR-0025 | [data-plane](./adr/03-data-plane.md#adr-0025) | Training-engine, repair optimizer boundary, OpenInference trajectory capture, trajectory privacy, and `"use training"` work are covered by generated-stack and eval slices. | HOBO-104, HOBO-146, HOBO-330, HOBO-335, HOBO-364 |
| ADR-0026 | [architecture-core](./adr/01-architecture-core.md#adr-0026) | Scope hierarchy is implemented by topology objects, provider matching, and SDK contract hardening. | HOBO-9, HOBO-62, HOBO-81, HOBO-394 |
| ADR-0027 | [identity-security](./adr/02-identity-security.md#adr-0027) | Secretless-first config/secrets maps to config schema, token broker, and provider STS federation. | HOBO-40, HOBO-84, HOBO-90, HOBO-110 |
| ADR-0028 | [architecture-core](./adr/01-architecture-core.md#adr-0028) | Multi-Camp deployment semantics are owned by environment, delta, orchestration, and routing work. | HOBO-50, HOBO-73, HOBO-81, HOBO-103, HOBO-151 |
| ADR-0031 | [architecture-core](./adr/01-architecture-core.md#adr-0031) | wasm host choices, manifest-pinned host versions, and portability floor are covered by component-host, manifest upcaster, container, and adapter certification slices. | HOBO-12, HOBO-15, HOBO-17, HOBO-28, HOBO-29, HOBO-35, HOBO-36, HOBO-386 |
| ADR-0032 | [data-plane](./adr/03-data-plane.md#adr-0032) | Data portability and schema versioning map to manifest upcasting, WIT records, and data-plane migration work. | HOBO-15, HOBO-30, HOBO-386 |
| ADR-0033 | [architecture-core](./adr/01-architecture-core.md#adr-0033) | Deterministic matching and planner selection are covered by scoring spike and matching engine slices. | HOBO-55, HOBO-61, HOBO-64, HOBO-78, HOBO-81, HOBO-86 |
| ADR-0034 | [data-plane](./adr/03-data-plane.md#adr-0034) | Search as query-side package maps to paradigm packages and authoring opt-in work. | HOBO-248, HOBO-252, HOBO-389 |
| ADR-0035 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0035) | Custom domains, DNS, and multi-cloud ingress are covered by gateway, domain, validation, cert, and routing slices. | HOBO-138, HOBO-142, HOBO-144, HOBO-148, HOBO-151, HOBO-163 |
| ADR-0036 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0036) | Air-gapped/sovereign Yard mode maps to signed bundles, registry import, offline feature-flag evaluation, and offline integrity hardening. | HOBO-7, HOBO-319, HOBO-350, HOBO-383, HOBO-390, HOBO-397 |
| ADR-0037 | [architecture-core](./adr/01-architecture-core.md#adr-0037) | SDK codegen surface and drift checks are covered by WIT tooling, bind graph typing, and CLI codegen slices. | HOBO-3, HOBO-16, HOBO-32, HOBO-49, HOBO-88, HOBO-152 |
| ADR-0038 | [identity-security](./adr/02-identity-security.md#adr-0038) | End-user/application auth is covered by `hobo:auth` contracts and authoring/runtime auth slices. | HOBO-63, HOBO-98 |
| ADR-0039 | [identity-security](./adr/02-identity-security.md#adr-0039) | Metering, quota, cost attribution, and cost-driven availability map to telemetry/cost and dispatcher work. | HOBO-104, HOBO-155, HOBO-192, HOBO-243, HOBO-290, HOBO-339 |
| ADR-0040 | [architecture-core](./adr/01-architecture-core.md#adr-0040) | Cross-Camp state consistency is represented by runtime ports, saga, and cross-Camp routing constraints. | HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-73, HOBO-151 |
| ADR-0041 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0041) | Adopt-in-place, external resources, and migration-importer scaffold support are control-plane/provider/generation work. | HOBO-47, HOBO-95, HOBO-97, HOBO-103, HOBO-186, HOBO-321 |
| ADR-0042 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0042) | Local-dev fidelity is represented by local provider, per-capability conformance tags, local runtime, `hobo dev`, and testRuntime slices. | HOBO-102, HOBO-135, HOBO-199, HOBO-392 |
| ADR-0043 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0043) | Junction federation maps to connectivity inference, custom domains, policy packs, and registry federation. | HOBO-150, HOBO-159, HOBO-163, HOBO-390 |
| ADR-0044 | [identity-security](./adr/02-identity-security.md#adr-0044) | Feature flags and progressive delivery are covered by Harness port, built-in store, SDK surface, ruleset sync, and delivery slices. | HOBO-141, HOBO-146, HOBO-319, HOBO-323, HOBO-326, HOBO-328 |
| ADR-0045 | [identity-security](./adr/02-identity-security.md#adr-0045) | SLO-as-code, error-budget gating, and alerts map to reliability and Gatekeeper work. | HOBO-104, HOBO-141, HOBO-146, HOBO-272, HOBO-277 |
| ADR-0046 | [identity-security](./adr/02-identity-security.md#adr-0046) | Boundary standards map to EventEnvelope and telemetry boundary schema slices. | HOBO-2, HOBO-39, HOBO-66, HOBO-104, HOBO-253 |
| ADR-0047 | [identity-security](./adr/02-identity-security.md#adr-0047) | Chaos and continuous-resilience verification are covered by golden suites and operator/SRE work. | HOBO-104, HOBO-141, HOBO-146 |
| ADR-0048 | [data-plane](./adr/03-data-plane.md#adr-0048) | Persisted code mutation for training promotion maps to generated-stack, eval, and policy gate work. | HOBO-104, HOBO-146 |
| ADR-0049 | [architecture-core](./adr/01-architecture-core.md#adr-0049) | Hobo Code naming and DSL reservation are covered by SDK contract hardening and DSL frontend work. | HOBO-9, HOBO-394 |
| ADR-0050 | [data-plane](./adr/03-data-plane.md#adr-0050) | Event-sourced data plane, deterministic in-process evaluation, reactive SDK consumption, cursor pagination, ruleset sync, and projection sinks map to runtime ports and data-plane package work. | HOBO-20, HOBO-21, HOBO-22, HOBO-23, HOBO-30, HOBO-60, HOBO-65, HOBO-74, HOBO-76, HOBO-80, HOBO-107, HOBO-248, HOBO-252, HOBO-319, HOBO-323, HOBO-326 |
| ADR-0051 | [data-plane](./adr/03-data-plane.md#adr-0051) | WIT records as canonical domain schema are represented by WIT tooling, SDK codegen, and event-body upcaster gates. | HOBO-3, HOBO-12, HOBO-16, HOBO-42, HOBO-57, HOBO-88, HOBO-152 |
| ADR-0052 | [data-plane](./adr/03-data-plane.md#adr-0052) | Projection-sink paradigm taxonomy and reactive boundary map to paradigm packages and authoring opt-in. | HOBO-74, HOBO-248, HOBO-252, HOBO-389 |
| ADR-0053 | [data-plane](./adr/03-data-plane.md#adr-0053) | Write-side commands, aggregates, and the fenced actor boundary map to WIT runtime and ActorHost slices. | HOBO-13, HOBO-21, HOBO-30, HOBO-69 |
| ADR-0054 | [data-plane](./adr/03-data-plane.md#adr-0054) | Operator Agents as built-in Yard services map to Operators/SRE, policy, MCP surfaces, and read-only diagnosis. | HOBO-115, HOBO-141, HOBO-146, HOBO-158, HOBO-270, HOBO-272, HOBO-276 |
| ADR-0055 | [data-plane](./adr/03-data-plane.md#adr-0055) | Generated stack persistence maps to generation, conformance, and persisted-mutation gates. | HOBO-5, HOBO-7, HOBO-102, HOBO-146, HOBO-327, HOBO-346 |
| ADR-0056 | [data-plane](./adr/03-data-plane.md#adr-0056) | App/UI generation maps to generated-stack verification and future UI package slices. | HOBO-146 |
| ADR-0057 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0057) | Patchability and derivative upgrades map to conformance, registry, generation, and compatibility work. | HOBO-5, HOBO-7, HOBO-102, HOBO-108, HOBO-388 |
| ADR-0058 | [data-plane](./adr/03-data-plane.md#adr-0058) | SRE incident management, runbooks, read-only diagnosis, and self-healing map to operators, obligations, and Gatekeeper work. | HOBO-141, HOBO-146, HOBO-251, HOBO-260, HOBO-270, HOBO-272, HOBO-276 |
| ADR-0059 | [data-plane](./adr/03-data-plane.md#adr-0059) | App communications through `hobo:notify` map to WIT capability surfaces and operators/SRE handoff. | HOBO-14, HOBO-141 |
| ADR-0060 | [identity-security](./adr/02-identity-security.md#adr-0060) | Compliance/data governance maps to lifecycle policy and policy-pack slices. | HOBO-137, HOBO-150, HOBO-154, HOBO-162 |
| ADR-0061 | [identity-security](./adr/02-identity-security.md#adr-0061) | AI safety and model governance map to generation sandbox/eval/policy gate work. | HOBO-7, HOBO-102, HOBO-137, HOBO-146 |
| ADR-0062 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0062) | Registry distribution and trust are covered by signed artifacts, provider packs, registry publish lifecycle, trust-tier, and swap work. | HOBO-7, HOBO-102, HOBO-331, HOBO-346, HOBO-354, HOBO-357, HOBO-362, HOBO-365, HOBO-383, HOBO-385, HOBO-388, HOBO-390, HOBO-391, HOBO-393, HOBO-397 |
| ADR-0063 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0063) | Single designed scope is enforced by plan coverage and this traceability gate. | HOBO-10, HOBO-11 |
| ADR-0064 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0064) | AI-native meta-cloud scope boundary is captured by the 15-project implementation backlog. | HOBO-10, HOBO-11 |
| ADR-0069 | [architecture-core](./adr/01-architecture-core.md#adr-0069) | Runtime membrane through WIT/wRPC and thin SDK maps to WIT, component artifacts, component host, links, usage-inferred grants, trigger lowering, and SDK conformance. | HOBO-3, HOBO-4, HOBO-12, HOBO-16, HOBO-17, HOBO-18, HOBO-19, HOBO-26, HOBO-27, HOBO-32, HOBO-67, HOBO-79 |
| ADR-0070 | [identity-security](./adr/02-identity-security.md#adr-0070) | Dev-mode auth bypass via contract testing maps to auth fixtures, local-dev testing, and `hobo dev` surfaces. | HOBO-63, HOBO-98, HOBO-392 |
| ADR-0071 | [architecture-core](./adr/01-architecture-core.md#adr-0071) | Dispatcher placement/dispatch/traffic decisions map to matching, region/objective, runner/build-machine providers, credit/cost, and routing work. | HOBO-64, HOBO-81, HOBO-103, HOBO-149, HOBO-155, HOBO-246, HOBO-339 |
| ADR-0072 | [architecture-core](./adr/01-architecture-core.md#adr-0072) | WIT-first SDK maps to WIT package, bindings, handler trigger lowering, collection-coverage honesty, reverse extraction, idiom parity, and SDK conformance. | HOBO-3, HOBO-12, HOBO-16, HOBO-31, HOBO-32, HOBO-75, HOBO-79, HOBO-88, HOBO-106, HOBO-398 |
| ADR-0073 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0073) | Swappable integration ports map to artifact repo, registry, signed bundles, issue tracker, digest selection, and portability swap work. | HOBO-347, HOBO-354, HOBO-365, HOBO-383, HOBO-388, HOBO-390, HOBO-391 |
| ADR-0074 | [identity-security](./adr/02-identity-security.md#adr-0074) | Org governance, RBAC, mandatory rules, and control-plane action taxonomy map to policy/RBAC slices. | HOBO-128, HOBO-133, HOBO-137, HOBO-150, HOBO-154, HOBO-158, HOBO-162, HOBO-166 |
| ADR-0075 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0075) | Interface stability tiers and Capability Spec map to WIT pinning, manifest versioning, registry, and adversarial version work. | HOBO-12, HOBO-15, HOBO-33, HOBO-36, HOBO-331, HOBO-343, HOBO-362, HOBO-386, HOBO-395 |
| ADR-0076 | [identity-security](./adr/02-identity-security.md#adr-0076) | Boundary virtualization maps to local-dev/test, provider mock, preview, and chaos surfaces. | HOBO-135, HOBO-332, HOBO-392 |
| ADR-0077 | [identity-security](./adr/02-identity-security.md#adr-0077) | Projects/environments grouping maps to topology, environment, dashboard, and status-page read models. | HOBO-62, HOBO-81, HOBO-140 |
| ADR-0078 | [identity-security](./adr/02-identity-security.md#adr-0078) | Architecture-derived availability maps to reliability/SLO and operational projection work. | HOBO-104, HOBO-140, HOBO-146 |
| ADR-0079 | [identity-security](./adr/02-identity-security.md#adr-0079) | App multi-tenancy maps to PrincipalRef/RBAC, tenant routing, and policy gate work. | HOBO-56, HOBO-63, HOBO-142, HOBO-158 |
| ADR-0080 | [identity-security](./adr/02-identity-security.md#adr-0080) | Tenant isolation conformance maps to auth, RBAC, policy, and conformance gate work. | HOBO-56, HOBO-63, HOBO-102, HOBO-146, HOBO-158 |
| ADR-0081 | [data-plane](./adr/03-data-plane.md#adr-0081) | Paradigm resource packages map to data-plane packages and SDK opt-in binding. | HOBO-248, HOBO-252, HOBO-389 |
| ADR-0082 | [identity-security](./adr/02-identity-security.md#adr-0082) | Golden Suites, A2H, and default verification gates map to conformance, Gatekeeper, obligations, and operator handoff. | HOBO-5, HOBO-102, HOBO-141, HOBO-146 |
| ADR-0083 | [identity-security](./adr/02-identity-security.md#adr-0083) | Harness progressive delivery maps to feature flag, SDK consumption, ruleset sync, delivery, experiment, and adapter conformance work. | HOBO-141, HOBO-146, HOBO-274, HOBO-319, HOBO-323, HOBO-326, HOBO-328, HOBO-387 |
| ADR-0084 | [identity-security](./adr/02-identity-security.md#adr-0084) | Cross-App Access maps to `crossApp`, ID-JAG token exchange, inferred scopes, and XAA runtime work. | HOBO-9, HOBO-43, HOBO-54, HOBO-83, HOBO-110, HOBO-230, HOBO-271 |
| ADR-0085 | [architecture-core](./adr/01-architecture-core.md#adr-0085) | wRPC/WIT version floors, vendored interface hashes, and preview upcaster discipline are proven by the HOBO-12 spike and expanded by WIT vendoring work. | HOBO-12, HOBO-15, HOBO-26, HOBO-27, HOBO-36 |
| ADR-0086 | [data-plane](./adr/03-data-plane.md#adr-0086) | Replay/live equivalence is pinned as an executable data-plane gate for deterministic materialization folds. | HOBO-60, HOBO-51, HOBO-57, HOBO-74, HOBO-80 |
| ADR-0087 | [architecture-core](./adr/01-architecture-core.md#adr-0087) | Package namespace ownership is pinned by the canonical import table and doc lint guards. | HOBO-58 |
| ADR-0088 | [architecture-core](./adr/01-architecture-core.md#adr-0088) | Matching specificity vectors, true-tie handling, and catalog-hash attribution are pinned by executable HOBO-55 vectors and consumed by the matching engine. | HOBO-55, HOBO-64, HOBO-78, HOBO-81 |
| ADR-0089 | [data-plane](./adr/03-data-plane.md#adr-0089) | GraphQL facade generation is bounded to deterministic SDL plus thin materialization dispatch; HOBO-92 pins cached query snapshots, shared observable subscriptions, and tenant/scope gates as a runtime contract proof. | HOBO-65, HOBO-92 |
| ADR-0090 | [architecture-core](./adr/01-architecture-core.md#adr-0090) | Provider-owned equivalence entries, pure capability negotiation, prefer-degrade warnings, conformance-gated truthfulness, and cross-paradigm rejection are pinned by the HOBO-108 spike and prototype, then consumed by the HOBO-78 deploy-path negotiation proof. | HOBO-108, HOBO-87, HOBO-102, HOBO-78, HOBO-174 |
| ADR-0091 | [architecture-core](./adr/01-architecture-core.md#adr-0091) | Non-TS idiom layers start from reverse-extracted WIT plus a parity report, with TS-only ergonomics translated through lowering records and semantics-annex gates. | HOBO-398, HOBO-16, HOBO-31, HOBO-32, HOBO-106 |
| ADR-0092 | [architecture-core](./adr/01-architecture-core.md#adr-0092) | Self-host bootstrap ordering is pinned as a disposable seed Yard, single-use operator credential, immutable provenance import, explicit Identity handover, and air-gap-compatible recovery table. | HOBO-59, HOBO-50, HOBO-39 |
| ADR-0093 | [architecture-core](./adr/01-architecture-core.md#adr-0093) | SDK semantics-annex parity is a separate required conformance lane from golden-IR lowering equality, with negative vectors for error mapping, cancellation, async ordering, and IfC side-effect order. | HOBO-31, HOBO-32, HOBO-106, HOBO-398 |
| ADR-0094 | [identity-security](./adr/02-identity-security.md#adr-0094) | Autonomous-action safety rails map to Crew blast-radius envelopes, oscillation guards, and SRE remediation classification. | HOBO-263, HOBO-251, HOBO-267 |
| ADR-0095 | [portability-extensibility](./adr/07-portability-extensibility.md#adr-0095) | Distributed-artifact resolution semantics are pinned by the HOBO-340 decision vectors and consumed by the future resolver. | HOBO-340, HOBO-370 |
| ADR-0096 | [identity-security](./adr/02-identity-security.md#adr-0096) | Deny-ceiling composition has deterministic proof vectors for scope monotonicity, default override, and fail-closed widening attempts. | HOBO-128, HOBO-133 |
| ADR-0097 | [identity-security](./adr/02-identity-security.md#adr-0097) | ID-JAG draft tracking and XAA threat-model coverage are pinned by the HOBO-271 spike vectors before adversarial XAA work. | HOBO-271, HOBO-250, HOBO-255 |
| ADR-0098 | [data-plane](./adr/03-data-plane.md#adr-0098) | Generation eval methodology uses hybrid rubrics, golden trajectories, held-out/adversarial splits, independent calibration, and min-sample floors before promotion. | HOBO-309, HOBO-351 |
| ADR-0099 | [data-plane](./adr/03-data-plane.md#adr-0099) | Data-flywheel trajectory privacy is pinned by HOBO-364 proof vectors for capture boundaries, PII redaction, cross-tenant isolation, retention, opt-out, and optimizer payload redaction. | HOBO-364, HOBO-335, HOBO-358 |

## ADR Numbering and Status Audit

- Counted ADRs: 88 numbered entries from [adr/README.md](./adr/README.md).
- Status policy: every numbered ADR listed in the index is **Accepted / current** unless a future row
  explicitly marks it superseded; proposed decisions remain `ADR-Pn` and are not part of the
  monotonic accepted set.
- Explicit numbering gaps through `ADR-0099`: ADR-0013, ADR-0016, ADR-0017, ADR-0020, ADR-0022,
  ADR-0029, ADR-0030, ADR-0065, ADR-0066, ADR-0067, ADR-0068.
- Gap status: intentional unassigned IDs in the current consolidated suite; none is silently
  referenced from the index or theme docs as an accepted decision.

## Contradiction and Supersession Audit

No hard contradiction requiring an RCR sub-issue was found in this pass. The intentionally repeated
decision chain is internally consistent:

- `ADR-0026`, `ADR-0069`, `ADR-0071`, and `ADR-0074` agree that inferred Camps are allowed only
  under approved provider and policy conditions, not by uncontrolled auto-placement.
- `ADR-0063` and `ADR-0064` define the single-scope boundary; the plan index and implementation
  backlog keep monetization/business mechanics out of the current platform scope.
- `ADR-0024`, `ADR-0062`, `ADR-0073`, and `ADR-0075` agree that portability/conformance and swap-for-equivalent
  remain available and cannot be commercially gated.
- `ADR-0036`, `ADR-0043`, `ADR-0062`, and `ADR-0073` align on sovereign/Junction federation:
  artifacts and policies are signed and mirrored, but no shared global controller is introduced.

Supersession rule for future runs: if a later ADR changes a prior behavior, the traceability row
must cite the newer ADR as the current decision and list either the superseded issue update or a new
RCR issue.

## Adversarial Coverage Checks

- Vague coverage check: rows avoid "covered by platform" claims and state the testable assertion or
  specific issue family that must prove the ADR or plan.
- Superseded reference check: this file keeps `ADR-Pn` out of the counted set until accepted.
- Missing-link check: `scripts/validate-traceability.mjs` verifies every relative `.md` link target
  exists and every indexed ADR/plan appears in this report.
