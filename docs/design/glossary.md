---
type: Reference
title: "HoBo Glossary"
description: "This is the canonical glossary for HoBo design terms. `docs:design-lint` treats this table as the single source of truth for canonical term definitions."
tags: [hobo, design]
---

# HoBo Glossary

This is the canonical glossary for HoBo design terms. `docs:design-lint` treats this table as the single source of truth for canonical term definitions.

| Term | Definition |
|---|---|
| Agent-to-human handoff | A typed escalation package over `hobo:notify` that asks a human to apply a fix, re-bless output, or abort work before a deadline. |
| Aggregate | The write-model consistency boundary, realized as an actor over the event log. |
| Bindle | App-level topology and bindings, provider-agnostic, deployed into one or more Camps. |
| Broker Catalog Snapshot | Versioned provider/catalog evidence set consumed by the Meta-cloud Broker when validating a Contract Manifest. |
| Broker Environment | Approved broker input state that constrains which providers, catalogs, mapping contracts, policies, and version pins may be used for a broker decision. |
| Camp | Provider-specific deployment target such as `prod-aws`; it selects runtime backend, Provider, and IaC engine for a Bindle placement. |
| Capability Manifest | Machine-readable provider manifest describing capabilities, auth flows, cost facts, and how an agent obtains scoped tokens. |
| Capability provider | A Provider acting as a wasm capability adapter that implements a WIT interface. |
| Component | WASM/WASI component, the default deployable unit for a HoBo service, with an OCI-container fallback. |
| Component host | Camp capability that executes components; Wasmtime locally and wasm-in-container as the v1 production floor. |
| Config and secrets | Secretless-first app configuration resolved through `ctx.config` to Camp-specific references rather than plaintext values. |
| Contract | Typed expectation on a graph edge, declared, inferred, observed, or promoted, and checked by the compatibility gate. |
| Contract Manifest | Application contract artifact presented to the Meta-cloud Broker; names requested capabilities, constraints, and declared application facts for broker validation. |
| Crew | Alias for Operator Agents — the built-in autonomous Yard services roster; see the Operator Agents row and [operators-sre.md](./operators-sre.md#plan-40). |
| Cross-App Access | IdP-brokered, policy-governed access from a HoBo app or agent to an external app on a user's behalf, using ID-JAG token exchange. |
| Decision graph | Per-decision explainability artifact (`DecisionGraph`) emitted by the FinOps routing control plane, recording candidates generated/rejected, constraint results, policy outcomes, metric vectors, Pareto frontier, preference result, stability decision, rationale, and audit references; DX/OpsX/FinX surfaces read this same graph ([finops-budget-routing-control-plane.md](./finops-budget-routing-control-plane.md)). |
| Delta | Mutable diff applied to an immutable Deployment Set before promotion. |
| Deployment Set | Immutable resolved config of a Camp manifest. |
| Dispatcher | Credit-aware deterministic selector used for placement, dispatch, and traffic decisions. |
| Driver | Execution mechanism a Resource Definition uses, such as `terraform`, `template`, `echo`, `container`, or `custom-webhook`. |
| DX / OpsX / FinX surfaces | The three FinOps control-plane product surfaces over the same decision graph: DX (intent spec, dry-run preview, simulation, "why this placement?"), OpsX (override, freeze, rollback, migrate, incident reroute, blast-radius controls), and FinX (budgets, forecasts, attribution, anomaly signals, commitments, optimization recommendations). |
| Environment group | Member Camps of one logical environment, promoted or rolled back as a saga. |
| Environment type | Environment classification such as `production` or `ephemeral`, used as a matching dimension. |
| Event model | Durable append-only substrate where facts are `EventEnvelope` records and projections fold replayable streams. |
| Executor | Sandboxed runner that applies IaC or builds artifacts with scoped short-lived credentials. |
| Four-lens taxonomy | Contract means must not break; Eval means should improve; Policy means allowed or denied; Trace means what happened. |
| Gatekeeper | Composite deploy gate combining contracts, policy, evals, conformance, cost, signing, and golden-suite decisions. |
| Golden Suite | Signed bundle of conformance, contract, eval, benchmark, chaos, SLO, and golden-master checks for a deployment. |
| Grain | Virtual actor, HoBo's default concurrency primitive. |
| Harness | Progressive delivery core over OpenFeature, HoBo-shaped OpenDelivery, HoBo-shaped OpenExperiment, and OpenTelemetry. |
| Hobo Code | Planned declarative plus generated-stub DSL that lowers to the same manifest IR and SDK constructs as TypeScript authoring. |
| ID-JAG | Identity Assertion JWT Authorization Grant used for Cross-App Access token exchange. |
| IfC | Infrastructure-from-Code, where resources are declared inline and collected by running the component. |
| Junction | Cross-cloud or hybrid scope that federates identity, signed policy packs, signed registry bundles, and inferred connectivity across autonomous Yards. |
| Layered scopes | Infra containment chain `Junction` contains `Yard` contains `Camp` contains `Bindle`; project and app-tenant are separate rollup axes. |
| Mapping Contract | Broker artifact that constrains provider/catalog/resource mapping inputs without giving providers unilateral selection authority. |
| Manifest IR | Deployment intermediate representation produced by authoring and consumed by the Planner. |
| Matching Criteria | Deterministic selector for Resource Definitions, ranked by hard requirements, specificity, priority, objective, and stable tiebreak. |
| Meta-cloud Broker | Hosted authority that validates Contract Manifests against approved Broker Environments and emits Resolution Receipts or Resolution Rejections for Yard consumption. |
| Metric contract | Governed definition (`MetricContract`) of a routing metric's semantics, units, source, normalization, and version under the three-tier model: Tier 0 immutable system metrics, Tier 1 derived metrics via approved transforms, Tier 2 composition-only approved user metrics. |
| MetricVector | Per-candidate vector of metric-contract values (cost, reliability, latency, risk, approved custom metrics) evaluated after constraint filtering and used to build the Pareto frontier. |
| Obligation | Durable HoBo effect required by an allow decision, such as approval, canary, auth middleware, or budget action. |
| Operator Agents | Built-in autonomous Yard services such as SRE, Endpoint Monitor, GitOps, Platform Engineer, UX Designer, and SWE. |
| Pareto frontier | Non-dominated candidate set (`ParetoFrontier`) built across metric dimensions; preference weights select only within it — the router never uses one global weighted score, and a stability controller may still override the preferred candidate. |
| Planner | Pure function that turns a Bindle plus mapping into a DeploymentPlan DAG. |
| Planner objective | Soft ranking tiebreak such as `cost`, `latency`, `single-provider`, `carbon`, or `maximize-credits`. |
| Port | Contract boundary; may mean runtime substrate port, infra port, or capability WIT port depending on tier. |
| Pre-approved catalog | Trust-tiered listing set a Yard vouches for and production policy may require. |
| Project | Ownership and rollup axis spanning many Bindles, Camps, and Yards; not an infra containment noun. |
| Projection | Subscribable materialization built by folding the event log into a WIT-record read model. |
| Projection Sink | Optional queryable cache materialized through Matching; the event log remains authoritative. |
| Provider | Adapter implementing cloud, IaC, build, or capability ports for a backend. |
| Relay | Outbound-only proxy inside a private network so a hosted Yard can deploy without inbound access. |
| Resolution Receipt | Broker-issued evidence artifact proving a Contract Manifest was resolved against a specific Broker Environment and catalog snapshot. |
| Resolution Rejection | Broker-issued evidence artifact naming why resolution failed, such as stale, incompatible, ambiguous, or unsupported mapping state. |
| Resource Definition | Rule for realizing a port in a context, including provider, driver, and options. |
| Resource Pack | Shareable signed bundle of Resource Definitions. |
| ResourceActor | Controller-style grain that reconciles one resource's desired and actual state. |
| ResourceIntent | Provider-neutral infrastructure request that enters the FinOps routing pipeline as its canonical input, before candidate generation; the router core must not see provider names, SKUs, regions, account IDs, or backend API names. |
| Run | One durable workflow or agent execution represented by a `run.*` event stream. |
| Runtime | Reused term for the SDK primitives package, the `Runtime` interface, or a runtime backend; context names which one. |
| Runtime ports | Durable substrate ports a Camp provides: EventStore, Queue, Streamer, ActorHost, and Clock. |
| Scope listing | Bindle, Camp, Yard, or Junction distributed as an npm package or structured git repo that exports the constructed scope. |
| SVID | SPIFFE-style workload identity issued by the Yard for keyless auth. |
| Stub | Typed recording placeholder behind a WIT port so an app runs before a real implementation exists. |
| The `notify` port | Canonical cloud-messaging transport for email, sms, push, webhooks, ops alerts, app comms, status, and paging. |
| Token budget | Scoped **`TokenBudget`** object capping LLM inference input/output/total tokens per period (`per-run`, `daily`, `monthly`) for tenant/Camp/agent/model/run scopes; enforced by the pre-inference **`evaluateInferenceTokenBudget`** gate over a seq-pinned `MeteringView` ([governance-planes.md#per-token-inference-budgets](./governance-planes.md#per-token-inference-budgets)). Distinct from auth `token.*` credential events. |
| WIT interface | Canonical language-neutral contract form for a HoBo port. |
| WIT-first SDK | SDK model where each language uses generated `hobo:sdk` WIT bindings plus a thin idiom layer. |
| Workload Profile | How a service is realized, such as wasm component, container, serverless, or VM. |
| Yard | Provider-specific cross-Camp scope and the control plane that runs that provider's orchestration. |
| Yard manifest | Generated IR of a Yard's exposed endpoints, domains, cross-Yard links, residency, and trust requirements. |
| `@hobo/bindles` | App idiom layer for declaring resources, `.allow()` grants, and Bindles. |
| `@hobo/camps` | Topology idiom package for declaring Camps. |
| `@hobo/junctions` | Topology idiom package for declaring Junctions. |
| `@hobo/sdk` | Operator SDK used to configure and self-host a HoBo cloud; distinct from the `hobo:sdk` WIT contract/package. |
| `@hobo/yards` | Topology idiom package for declaring Yards. |
| `.allow(...)` | Capability permission surface that narrows or asserts usage-inferred grants, capped by policy deny ceilings. |
| `hobo:sdk` | WIT contract/package for app primitives and capability/data interfaces; distinct from the `@hobo/sdk` operator SDK. |
| Package namespace map | Canonical import-ownership table for `@hobo/*` packages; see [package-namespaces.md](./package-namespaces.md) (ADR-0087). |
| `"use training"` | SDK directive marking an AI-rewritable semantic function optimized behind the `training-engine` port. |
