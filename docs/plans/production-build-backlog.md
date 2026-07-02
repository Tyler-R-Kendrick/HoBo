---
type: Implementation Plan
title: "HoBo v1 Production Build — staged Linear scope"
description: "Initiative, stage projects (S0–S6), milestones, and one-shot issue specs that promote the design suite + draft proofs into real production implementation. Imported into Linear (team HoBo) on 2026-07-01; this doc is the durable mirror of that import."
tags: [hobo, plans]
---

# HoBo v1 Production Build — staged Linear scope

> **Why this document exists.** The 399-issue backlog (15 subsystem projects, all complete) was
> executed as **draft proofs** under `src/draft/` — there is no production code. This scope promotes
> the proven designs into a real build. **Import status: DONE.** The full scope — richer than the
> per-issue briefs below (42 QA-verified one-shot bodies for all of S0/S1 and every stage M0) — is
> live in Linear under initiative **HoBo v1 Production Build**
> (`bc463c40-f5a8-4246-8d71-0d4dd2f6c6c7`): 7 stage projects, 27 milestones, 87 issues
> (HOBO-578…HOBO-665), plus the companion Intent-Alignment Gap Remediation project (25 issues,
> HOBO-666…HOBO-690). **Do not re-import this document** — Linear is the live source; see the
> Import record section below for the identifier map.
>
> **Structure rule (mirrors the requirements Release Criteria):** stages S0–S6 are dependency-ordered
> projects; each closes with an executable gate issue; each later stage starts with an M0
> acceptance-record issue that unblocks its skeleton slices — the post-core-delta pattern from the
> implementation plan, applied to the production build.

## Initiative

**Name:** HoBo v1 Production Build

Promotes HoBo's completed design suite (104 ADRs, ~110 design docs, formal requirements TR-001..TR-164) and the 399-issue draft-proof backlog into **real production implementation**: runnable packages, a real `hobo` CLI, a real event-sourced control plane. The 15 completed proof projects stay **closed and untouched**; material under `src/draft/` (especially `src/draft/epic-proofs/*`) is promotion source only — contracts, Pact fixtures, golden IR, and scope records get lifted into production code, never extended in place.

**Stage order** follows the requirements Release Criteria (docs/archive/requirements/requirements.md §Release criteria): S0/S1 hello-bindle offline + replay==live → S2 first cloud + governed Yard → S3 keyless agent deploys via MCP → S4 one unedited Bindle on ≥2 clouds + cross-cloud mTLS → S5 `hobo forge <url>` yields a certified provider → S6 HA/DR + FinOps + dashboard + governance planes. Each stage closes with an executable gate issue; the next stage's M0 is blocked on it.

**Production layout (stated once, used by every issue):** the monorepo layout from docs/design/architecture.md §Monorepo & package architecture — `packages/<name>/` for `@hobo/*` (packages/core, packages/wit, packages/bindles, packages/camps, packages/yards, packages/junctions, packages/runtime, packages/data, packages/events, packages/componentize, packages/conformance, packages/contracts, packages/policy, packages/evals, packages/training, packages/cli, packages/cloud, packages/registry, packages/identity, packages/mcp, packages/runtimes/runtime-local, packages/providers/provider-<x>, packages/iac/iac-pulumi, packages/build/build-wasm), plus `examples/` (hello-bindle, multi-cloud-shop, durable-agent, self-host-yard) doubling as E2E fixtures. Per AGENTS.md architecture rules: protobuf-first types with CUE constraints in each package's local `data-models/`, parse-don't-validate refined types, PACT contracts at every service boundary, CQRS/event-sourcing/actors/materialized views, dependencies inward-only (`apps → adapters → sdk/runtime → core`), enforced by `architecture:guard` in CI. No new code under `src/draft/`.

## Delivery projects

### Build S0: Toolchain & Contracts Bootstrap (`S0`)

**Summary.** Real monorepo production packages (core, wit, componentize, conformance), protobuf+CUE+PACT infra, keyless CI fabric, architecture-guard wiring. Gate: hello-bindle builds to a signed wasm OCI artifact through CI; conformance harness self-test green.

**Stage goal:** stand up the production monorepo so every later stage lands real code behind real gates. Creates `packages/core`, `packages/wit`, `packages/componentize`, `packages/conformance` plus the contract toolchain (buf/protobuf codegen, CUE vet, PACT lanes), keyless-OIDC CI fabric, artifact signing + SLSA provenance, and `architecture:guard` extended to the `packages/` tree.

**Acceptance gate (feeds requirements Stage-0/1):** `examples/hello-bindle` builds through CI into a signed, provenance-attested wasm OCI artifact; `@hobo/conformance` self-suite and PACT lanes green; a seeded core→provider import fails CI (NFR-020).

**Subsystems promoted:** Foundations, Build & Conformance Harness (HOBO-1..11; proof: `src/draft/epic-proofs/foundations-build-conformance-harness/`), the WIT toolchain slice of the membrane epic.

**Dependency:** none — this is the root stage; every S1 issue is blocked on S0-12.

**Milestones:**

- **Monorepo & CI fabric** — packages/ tree, Turborepo lanes, boundary lint, keyless-OIDC CI, architecture-guard production wiring.
- **Core contracts (@hobo/core)** — Port interfaces, EventEnvelope, Capability Manifest, DI container; protobuf+CUE toolchain; PACT lanes.
- **WIT toolchain & componentize** — hobo:sdk WIT package, vendored wasi:* pins, bindings generation, TS→wasm→OCI build, hello-bindle fixture.
- **Conformance harness** — @hobo/conformance port-suite harness with golden-IR capture + replay.
- **Supply chain & stage gate** — Signing + SLSA provenance, install-time verification, S0 acceptance record + executable gate.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S0-01 | Scaffold the production monorepo: pnpm workspaces + Turborepo + layered packages/ tree with boundary lint | Monorepo & CI fabric | slice | 2 | — | Full one-shot body staged — see appendix S0-01. |
| S0-02 | @hobo/core: port interfaces, EventEnvelope, Capability Manifest schema, DI container (packages/core/) | Core contracts (@hobo/core) | slice | 2 | S0-01, S0-03 | Full one-shot body staged — see appendix S0-02. |
| S0-03 | Protobuf+CUE contract toolchain: buf codegen + cue vet lanes wired through Turborepo | Core contracts (@hobo/core) | slice | 2 | S0-01 | Full one-shot body staged — see appendix S0-03. |
| S0-04 | @hobo/wit: WIT toolchain, hobo:sdk package, vendored wasi:* pins, generated bindings (packages/wit/) | WIT toolchain & componentize | slice | 2 | S0-02 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/wit/ with the canonical `hobo:sdk` WIT package, vendored+pinned `wasi:*` interfaces, and jco/wit-bindgen binding generation for TS, per docs/design/wasm-runtime-wit.md (Plan 20 / ADR-0072). Promotes HOBO-3/15/16 and the WIT contracts in src/draft/epic-proofs/wit-component-model-runtime-membrane/contracts/. Done when `pnpm turbo run build --filter @hobo/wit` regenerates bindings deterministically and a wasi round-trip conformance check passes in CI. Depends on: S0-02 |
| S0-05 | @hobo/componentize: TS service → wasm component → OCI artifact (packages/componentize/) | WIT toolchain & componentize | slice | 2 | S0-04 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/componentize/ building a TS service via jco into a wasm component and packaging it as an OCI artifact with a deterministic digest, per docs/design/wasm-runtime-wit.md. Promotes HOBO-4 and the hello-bindle componentize fixture in src/draft/epic-proofs/foundations-build-conformance-harness/. Done when the same input yields a byte-identical wasm + OCI descriptor across two CI runs and `wasm-tools validate` passes. Depends on: S0-04 |
| S0-06 | @hobo/conformance: port-suite harness with golden-IR capture + replay (packages/conformance/) | Conformance harness | slice | 2 | S0-02, S0-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/conformance/ as the shared port-contract test harness: suite registration per WIT port, golden-IR capture, deterministic replay, and machine-readable pass/fail reports (later consumed by provider certification). Promotes HOBO-5 and the harness simulation in src/draft/epic-proofs/foundations-build-conformance-harness/. Done when a reference in-memory adapter passes its suite and a seeded violation produces a failing, explainable report. Depends on: S0-02, S0-03 |
| S0-07 | PACT boundary-test infrastructure: consumer/provider contract lanes | Core contracts (@hobo/core) | slice | 2 | S0-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Wire PACT-style consumer-driven contract testing as first-class lanes (`test:contract:consumer` / `test:contract:provider`) with package-local pact fixtures, covering SDK/runtime, CLI/API and event/projection boundaries as they land (AGENTS.md: a boundary is not implemented until its contract is executable). Promotes the Pact fixtures used across src/draft/epic-proofs/*/contracts/. Done when a deliberately broken provider verification fails CI while consumer stubs stay green. Depends on: S0-01 |
| S0-08 | CI fabric: keyless-OIDC pipelines, cached Turbo lanes, examples-as-fixtures | Monorepo & CI fabric | slice | 2 | S0-05, S0-06, S0-07 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Create .github/workflows/ production CI: keyless OIDC (zero stored cloud secrets), turbo-cached build/lint/test:unit/test:schema/contract lanes, architecture-guard + docs gates, and an examples/ fixture lane. Promotes HOBO-6 and the mocked CI contract in src/draft/epic-proofs/foundations-build-conformance-harness/. Done when a PR runs all lanes green under 10 minutes warm-cache and secret-scanning confirms no static credentials. Depends on: S0-05, S0-06, S0-07 |
| S0-09 | Artifact signing + SLSA provenance on publish; verify on install | Supply chain & stage gate | slice, security | 2 | S0-08 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement Changesets-driven publish with Sigstore signing and SLSA provenance attached to every @hobo/* npm package and OCI artifact, plus install-time verification that refuses unsigned artifacts. Promotes HOBO-7 and the signed-artifact fixtures in src/draft/epic-proofs/foundations-build-conformance-harness/. Done when an unsigned artifact is rejected at install in a CI test and a published artifact's provenance verifies end-to-end. Depends on: S0-08 |
| S0-10 | examples/hello-bindle: production reference fixture | WIT toolchain & componentize | slice, user-story | 2 | S0-05 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Author examples/hello-bindle/ as the first real example-as-test: a minimal Bindle source that componentizes via @hobo/componentize and is asserted in CI (examples double as E2E fixtures per docs/design/architecture.md, mock-bounded per the repo testing policy). Promotes the hello-bindle fixture in src/draft/epic-proofs/foundations-build-conformance-harness/. Done when CI builds hello-bindle to a signed wasm component and smoke-executes it under wasmtime. Depends on: S0-05 |
| S0-11 | HARDENING: architecture:guard production wiring for packages/ | Monorepo & CI fabric | hardening | 2 | S0-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Extend scripts/ architecture:guard to the production packages/ tree: adapters import only @hobo/core ports, no adapter→adapter imports, local data-models/ presence for every package defining CUE-constrained types, generated-file and JS-family-extension guards, staged pre-commit variant. Done when each rule has a failing fixture test and the staged path runs in under 10 seconds. Depends on: S0-01 |
| S0-12 | S0 gate: toolchain acceptance — hello-bindle builds signed through CI; conformance self-test green | Supply chain & stage gate | hardening | 1 | S0-08, S0-09, S0-10, S0-11 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Stage-0 acceptance record in docs/design/ (post-core delta pattern from docs/implementation-plan.md) plus the executable gate: hello-bindle builds through CI to a signed, provenance-attested wasm OCI artifact; @hobo/conformance self-suite, schema and PACT lanes green; architecture:guard enforcing NFR-020 as a required check on main. Done when the record links every S0 issue to its runnable proof and the gate workflow is branch-protected. Blocks all S1 work. Depends on: S0-08, S0-09, S0-10, S0-11 |

### Build S1: Local SDK & Runtime (`S1`)

**Summary.** WIT membrane, runtime-local ports (EventStore/ActorHost/Queue/Clock/Streamer), @hobo/bindles IfC + manifest IR, @hobo/runtime authoring, hobo dev. Gate: hello-bindle runs fully offline; replay==live; runtime-local passes runtime-port conformance.

**Stage goal:** a developer runs a real app locally with zero cloud/credentials. Builds the WIT membrane (`hobo:runtime` + capability interfaces, wRPC links, deny-by-default capabilities), the `runtime-local` durable runtime ports, the TS SDK (`@hobo/bindles` IfC resource collection → `hobo.manifest/v1`, `@hobo/runtime` actors/workflows, `@hobo/data`/`@hobo/events` CQRS), and the `hobo` CLI local loop (`new`/`dev`/`codegen`/`collect`/`build`).

**Acceptance gate (requirements Stage 0/1):** the local Camp (`runtime-local`) passes runtime-port conformance; hello-bindle runs fully offline under `hobo dev` (≤60 s cold, NFR-002); replay == live (NFR-011).

**Subsystems promoted:** WIT & Component-Model Runtime (HOBO-12..36; proof: `src/draft/epic-proofs/wit-component-model-runtime-membrane/`), SDK & Authoring (HOBO-37..106+; proof: `src/draft/epic-proofs/sdk-authoring-ifc-bindles/`), Data Plane core (proof: `src/draft/epic-proofs/data-plane-event-sourcing-cqrs-reactivity/`), CLI local verbs (proof: `src/draft/epic-proofs/cli-mcp-developer-experience/`).

**Dependency:** every issue transitively blocked on S0-12 (S0 gate).

**Milestones:**

- **WIT membrane** — hobo:runtime + capability WIT interfaces, wRPC links, deny-by-default capabilities, failure semantics.
- **Runtime ports** — runtime-local component host + EventStore/ActorHost/Queue/Clock/Streamer durable ports.
- **SDK & IfC authoring** — @hobo/bindles resources + .allow(), manifest IR, collection engine, @hobo/runtime + CQRS helpers, replay==live.
- **Local dev loop** — @hobo/cli shell + new/dev/codegen/collect/build verbs; offline-first developer experience.
- **Conformance gates** — Runtime-port + component-host + idiom-parity conformance suites; S1 stage gate.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S1-01 | Author the hobo:runtime primitive WIT interfaces (workflow/step/actor/saga) | WIT membrane | slice | 2 | S0-12 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Add the production `hobo:runtime` WIT interfaces (workflow/step/actor/saga) to packages/wit/, with protobuf+CUE mirrors in packages/wit/data-models/ per docs/design/wasm-runtime-wit.md. Promotes HOBO-13 and the runtime WIT contracts in src/draft/epic-proofs/wit-component-model-runtime-membrane/contracts/. Done when bindings regenerate deterministically and a PACT consumer fixture pins the interface shape. Depends on: S0-12 |
| S1-02 | Author hobo:queue / hobo:scheduler / hobo:blob-events capability WIT interfaces | WIT membrane | slice | 2 | S1-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Add the capability interfaces `hobo:queue`, `hobo:scheduler`, `hobo:blob-events` to packages/wit/ per docs/design/wasm-runtime-wit.md, promoting HOBO-14 and the membrane proof contracts. Done when generated TS bindings compile and each interface has a golden-IR fixture registered in @hobo/conformance. Depends on: S1-01 |
| S1-03 | @hobo/runtime-local component host: wasmtime/jco host + link table (packages/runtimes/runtime-local/) | Runtime ports | slice | 2 | S1-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/runtimes/runtime-local/ hosting wasm components with a link table binding each imported WIT port to a capability provider, emitting `link.Established`/`link.Called` events per docs/design/architecture.md §Runtime/IfC components. Promotes HOBO-17 and the host skeleton in src/draft/epic-proofs/wit-component-model-runtime-membrane/. Done when the hello-bindle component loads, links, and serves a call locally. Depends on: S1-01 |
| S1-04 | In-process links over the wRPC abstraction (transport-agnostic calls) | WIT membrane | slice | 2 | S1-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Wire component-to-provider calls through a wRPC-style transport abstraction in packages/runtimes/runtime-local/ so the same link works in-process now and cross-process later. Promotes HOBO-18 and the membrane proof's transport simulation. Done when the same conformance fixture passes over the in-process transport and the transport seam is PACT-pinned. Depends on: S1-03 |
| S1-05 | Deny-by-default capability enforcement + usage-inferred grants | WIT membrane | slice, security | 2 | S1-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Enforce that a component reaches a backend only via a link its manifest declared (architecture.md invariant addendum): deny-by-default link table in packages/runtimes/runtime-local/ plus usage-inferred grant records. Promotes HOBO-19. Done when an undeclared capability call fails closed with a typed error and the allowed path stays green in the conformance suite. Depends on: S1-03 |
| S1-06 | Camp EventStore runtime port (sqlite/filesystem) + durability conformance assertions | Runtime ports | slice | 2 | S1-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement the EventStore runtime port in packages/runtimes/runtime-local/ (sqlite/filesystem engine): append-only streams, subscriptions, snapshots, protobuf event bodies with CUE constraints in local data-models/. Promotes HOBO-20 and the data-plane proof in src/draft/epic-proofs/data-plane-event-sourcing-cqrs-reactivity/. Done when durability assertions (append/replay/subscribe ordering) pass in @hobo/conformance. Depends on: S1-03 |
| S1-07 | ActorHost runtime port: single-writer leases + fencing | Runtime ports | slice | 2 | S1-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement the ActorHost port in packages/runtimes/runtime-local/ with single-writer leases and fencing tokens per docs/design/wasm-runtime-wit.md. Promotes HOBO-21. Done when a contended-activation conformance test proves exactly-one-writer and a stale fencing token is rejected. Depends on: S1-06 |
| S1-08 | Queue + Clock runtime ports: at-least-once delivery + deterministic time | Runtime ports | slice | 2 | S1-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement the Queue (at-least-once, redelivery, DLQ) and Clock (deterministic virtual time for replay) ports in packages/runtimes/runtime-local/. Promotes HOBO-22. Done when the conformance suite proves redelivery-after-crash and that replayed timers fire at identical virtual instants. Depends on: S1-06 |
| S1-09 | Streamer runtime port: per-run realtime read/write | Runtime ports | slice | 2 | S1-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement the Streamer port (per-run realtime streams backing logs/live-tail/websocket fan-out) in packages/runtimes/runtime-local/. Promotes HOBO-23. Done when a writer/reader conformance fixture streams live then replays identically from the log. Depends on: S1-06 |
| S1-10 | @hobo/bindles: IfC resource catalog + topology objects (packages/bindles/) | SDK & IfC authoring | slice | 2 | S0-12 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/bindles/: the TS idiom layer over hobo:sdk bindings — IfC resources (api/web/kv/bucket/queue/topic/secret/sql), `.allow()`, and the first-class `bindle()`/`camp()` topology objects per docs/design/authoring-resources-wiring.md and sdk-api.md. Promotes HOBO-37/49/62 and src/draft/epic-proofs/sdk-authoring-ifc-bindles/. Done when hello-bindle authors against the real package with full type inference and the public surface is PACT/type-test pinned. Depends on: S0-12 |
| S1-11 | hobo.manifest/v1 deployment IR schema (protobuf+CUE, packages/bindles/data-models/) | SDK & IfC authoring | slice | 2 | S1-10 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Define and version `hobo.manifest/v1` — the deployment IR the Planner will consume — protobuf-first with CUE invariants in packages/bindles/data-models/, plus parse-don't-validate constructors. Promotes HOBO-38 and the manifest fixtures in src/draft/epic-proofs/sdk-authoring-ifc-bindles/contracts/. Done when golden manifests round-trip byte-stable and a constraint-violating manifest is unrepresentable past the parser. Depends on: S1-10 |
| S1-12 | Resource-collection engine: run-to-collect → manifest IR | SDK & IfC authoring | slice | 2 | S1-11, S1-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement the IfC Collector in packages/bindles/: run components in resource-collection mode, emit `bindle.ResourcesCollected`/`bindle.ManifestProduced`, produce the manifest IR (architecture.md §Runtime/IfC components). Promotes HOBO-67. Done when hello-bindle's collected manifest matches its golden fixture and collection is deterministic across two runs. Depends on: S1-11, S1-03 |
| S1-13 | Usage-inferred permissions + .allow() narrowing | SDK & IfC authoring | slice, security | 2 | S1-12 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Infer least-privilege grants from observed resource usage during collection and let `.allow()` only narrow (never widen) them, in packages/bindles/. Promotes HOBO-70 and the sdk-authoring proof's permission fixtures. Done when a handler calling an ungranted operation fails collection with an actionable error and the narrowed grant set appears in the manifest IR. Depends on: S1-12 |
| S1-14 | @hobo/runtime authoring surface: actors/workflow/step/agent/ctx (packages/runtime/) | SDK & IfC authoring | slice | 2 | S1-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/runtime/: the developer-facing durable primitives (actors/grains, workflow/step, agent(), stubs, ctx) lowering onto the hobo:runtime WIT bindings, per docs/design/sdk-api.md. Promotes the runtime authoring slices of src/draft/epic-proofs/sdk-authoring-ifc-bindles/. Done when a durable workflow in examples/ survives a host restart and resumes from the event log. Depends on: S1-01 |
| S1-15 | @hobo/data + @hobo/events: CQRS write path, projections, saga/messaging helpers | SDK & IfC authoring | slice | 2 | S1-14, S1-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/data/ (command → aggregate fold → event; projection/view declaration over materialized views) and packages/events/ (emit/subscribe/saga choreography) per docs/design/data-plane.md and the AGENTS.md CQRS rules. Promotes HOBO-69/74/76 and src/draft/epic-proofs/data-plane-event-sourcing-cqrs-reactivity/. Done when a command round-trips to a queryable projection and actors never mutate read models directly (guard-asserted). Depends on: S1-14, S1-06 |
| S1-16 | Replay==live determinism: golden-replay corpus + replay-then-live reads | SDK & IfC authoring | slice, hardening | 2 | S1-15 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Build the replay==live guarantee (NFR-011): golden-replay corpus, event-body upcaster hooks, and the replay-then-live read surface in packages/data/ + packages/runtimes/runtime-local/. Promotes HOBO-57/60/76 and the data-plane proof's replay simulation. Done when projection rebuild-from-zero equals live state byte-for-byte on the corpus, as a CI lane. Depends on: S1-15 |
| S1-17 | @hobo/cli shell: arg parser, command registry, output renderer, MCP-parity dispatch (packages/cli/) | Local dev loop | slice | 2 | S0-12 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement packages/cli/: the `hobo` binary shell with command registry, typed arg parsing, human+JSON renderers, and a shared call path designed for later MCP parity (NFR-004), per docs/design/cli-spec.md. Promotes the CLI shell slice of src/draft/epic-proofs/cli-mcp-developer-experience/. Done when `hobo --help` reflects the canonical verb surface (HOBO-8) and every command handler is invocable programmatically. Depends on: S0-12 |
| S1-18 | hobo new + hobo codegen --check (scaffold + checked-in _generated/ drift gate) | Local dev loop | slice | 2 | S1-17, S1-10 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement `hobo new <name> [-t todo\|api\|agent\|fullstack]` scaffolding an SDK program against @hobo/bindles, and `hobo codegen [--check]` regenerating `_generated/` with a CI drift gate. Promotes HOBO-88 and the CLI/DX proof fixtures. Done when a freshly scaffolded app typechecks and `hobo codegen --check` fails on hand-edited drift. Depends on: S1-17, S1-10 |
| S1-19 | hobo dev: local Camp loop with hot reload + offline replay (≤60 s cold) | Local dev loop | slice, user-story | 2 | S1-17, S1-12, S1-09 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement `hobo dev` in packages/cli/: boot the runtime-local Camp, collect+link the Bindle, hot-reload on change, live-tail via Streamer, fully offline with zero credentials (NFR-002 ≤60 s cold). Promotes the `hobo dev` slice of src/draft/epic-proofs/cli-mcp-developer-experience/. Done when hello-bindle serves locally with no network access (egress-blocked test) inside the cold-start budget. Depends on: S1-17, S1-12, S1-09 |
| S1-20 | hobo collect + hobo build verbs | Local dev loop | slice | 2 | S1-17, S1-12 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement `hobo collect [--camp]` (run IfC collection, print/emit the manifest IR) and `hobo build` (componentize services to wasm via @hobo/componentize) in packages/cli/. Promotes the corresponding CLI/DX proof slices. Done when both verbs run green on hello-bindle in CI and their outputs match golden fixtures. Depends on: S1-17, S1-12 |
| S1-21 | @hobo/conformance runtime-port suite vs runtime-local (durability invariants) | Conformance gates | slice | 2 | S1-06, S1-07, S1-08, S1-09 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Build the production runtime-port conformance suite (EventStore/ActorHost/Queue/Clock/Streamer durability invariants) in packages/conformance/ and run it against runtime-local in CI — the gate every future runtime backend must pass. Promotes HOBO-30 and the membrane proof's conformance simulation. Done when runtime-local passes the full suite and a seeded lease-fencing violation fails it. Depends on: S1-06, S1-07, S1-08, S1-09 |
| S1-22 | Component-host conformance suite + TS idiom-layer parity gate | Conformance gates | slice | 2 | S1-04, S1-21 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Add the component-host portability suite (link table, capability enforcement, transport) and the `@hobo/conformance/sdk` TS idiom-layer parity gate to packages/conformance/. Promotes HOBO-29/32. Done when runtime-local's host and @hobo/bindles both pass in CI and the suites are consumable by third-party adapters. Depends on: S1-04, S1-21 |
| S1-23 | ADVERSARIAL: membrane failure semantics — deadline propagation, backpressure, partial-failure taxonomy | WIT membrane | adversarial | 2 | S1-04 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Implement deadline propagation across every link (each link a timeout boundary), membrane backpressure, and the typed partial/ambiguous-failure taxonomy in packages/runtimes/runtime-local/. Promotes HOBO-24/25 and the membrane proof's failure fixtures. Done when adversarial conformance cases (slow provider, mid-call crash, saturated queue) all fail closed with the taxonomy's typed errors. Depends on: S1-04 |
| S1-24 | S1 gate: hello-bindle fully offline under hobo dev; replay==live; runtime-port conformance green | Conformance gates | hardening, user-story | 1 | S1-05, S1-13, S1-16, S1-19, S1-21, S1-22, S1-23 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Stage-1 acceptance record in docs/design/ plus the executable gate for requirements Release Criteria Stage 0/1: runtime-local passes the runtime-port conformance suite; examples/hello-bindle runs fully offline under `hobo dev` (network-egress-blocked CI job, ≤60 s cold); replay==live corpus green. Done when the gate workflow is a required check and the record maps each criterion to its CI job. Blocks S2-00. Depends on: S1-05, S1-13, S1-16, S1-19, S1-21, S1-22, S1-23 |

### Build S2: First Cloud + Yard (`S2`)

**Summary.** Event-sourced Yard control plane (Gateway/Planner/Matching/Orchestrator/Executors), Identity token broker, first real provider + iac-pulumi, governance gate. Gate: governed deploy to a real cloud survives a Yard restart mid-deploy.

**Stage goal:** a reference Bindle deploys to one real cloud through a real, event-sourced Yard, with the Gatekeeper governance gate in front of every deploy. Builds `packages/cloud` (Yard kernel), `packages/registry`, `packages/identity`, `packages/contracts` + `packages/policy` (Gatekeeper/can-deploy), `packages/iac/iac-pulumi`, and the first `packages/providers/provider-<first>` (first-deploy provider selection is an open ADR-P item resolved in M0).

**Acceptance gate (requirements Stage 2):** the reference Bindle deploys to a real cloud and survives a Yard restart mid-deploy (crash-resume by replay); the Gatekeeper blocks an unsafe change with an explainable reason (policy gates + approval obligations + `can-deploy`, FR-050/051/052).

**Subsystems promoted:** Control Plane (proof: `src/draft/epic-proofs/control-plane-planner-matching-orchestrator/`), Identity/XAA core (proof: `identity-auth-secrets-cross-app-access-xaa`), Providers/IaC (proof: `providers-iac-build-adapters`), Contracts & Policy (proof: `contracts-policy-governance`).

**Dependency:** S2-00 blocked on S1-24 (S1 gate); all skeletons blocked on S2-00 per the post-core delta pattern.

**Milestones:**

- **Yard control-plane core** — M0 acceptance record; @hobo/cloud event-sourced kernel: Gateway, Event Store, projections.
- **Planner, Matching & Orchestrator** — Manifest IR → DeploymentPlan DAG; match.Decided; ResourceActors, sagas, sandboxed Executors.
- **First provider & IaC** — iac-pulumi Automation API; first provider package passing provider conformance.
- **Identity & governance gate** — OIDC issuer + SVID + token broker; contracts/policy Gatekeeper; CLI deploy verbs.
- **Stage-2 gate** — Governed real-cloud deploy surviving Yard restart mid-deploy.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S2-00 | M0: Acceptance record + productionization plan for stage S2 (First Cloud + Yard) | Yard control-plane core | hardening | 1 | S1-24 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Following the post-core delta pattern (docs/implementation-plan.md §Post-399): write the Stage-2 acceptance record in docs/design/ naming scope in/out, target packages (packages/cloud, packages/registry, packages/identity, packages/contracts, packages/policy, packages/iac/iac-pulumi, packages/providers/provider-<first>), owning lanes, and evidence expectations; resolve the ADR-P first-deploy-provider decision; map each S2 skeleton to the design docs (control-plane.md, contracts-policy-flags.md, security-networking.md) and proofs it promotes. Done when the record is indexed, traceability rows link record↔issues↔proofs, and the S2 skeletons are unblocked. Depends on: S1-24 |
| S2-01 | @hobo/cloud Yard kernel: Gateway ingress + Event Store + projections (packages/cloud/) | Yard control-plane core | slice | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Event-sourced multi-tenant Yard kernel per docs/design/control-plane.md + architecture.md: Gateway (RPC/REST authn/z) emitting `DeployRequested`, append-only event store, read-model projections; protobuf+CUE event families in packages/cloud/data-models/. Promotes src/draft/epic-proofs/control-plane-planner-matching-orchestrator/. Proof: a deploy command round-trips to a queryable projection and rebuilds identically from the log. Depends on: S2-00 |
| S2-02 | Planner + Matching: manifest IR → DeploymentPlan DAG + match.Decided | Planner, Matching & Orchestrator | slice | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Planner and Matching engine in packages/cloud/ (Resource Definitions gather→filter→score→pick, capability negotiation, `Planned`/`PlanRejected`/`match.Decided`) per control-plane.md and platform-engineering.md. Promotes HOBO-61/64/78 proof slices. Proof: hello-bindle's manifest yields the golden DeploymentPlan DAG with recorded match decisions. Depends on: S2-00 |
| S2-03 | Orchestrator + ResourceActors + sandboxed Executors (Firecracker) | Planner, Matching & Orchestrator | slice, security | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Choreography saga Orchestrator, per-resource ResourceActor FSMs with idempotent reconcile, and Firecracker-sandboxed Executors streaming `exec.*` in packages/cloud/, per control-plane.md (Executors are the only thing touching a cloud). Promotes HOBO-68/72/73/95/109 proof slices. Proof: a killed-mid-deploy Yard resumes the saga from the log and compensation destroys in reverse-dependency order. Depends on: S2-00 |
| S2-04 | @hobo/identity: OIDC issuer + SVID issuance + token broker (packages/identity/) | Identity & governance gate | slice, security | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Yard Identity per docs/design/security-networking.md and ADR-0023: OIDC issuer + JWKS, workload attestation, JWT-SVID issuance, token-broker skeleton with `identity.*`/`token.*` event families. Promotes HOBO-71/77/84/90 and src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/. Proof: an Executor receives a short-lived scoped token brokered from an SVID; no static secret anywhere in the path. Depends on: S2-00 |
| S2-05 | @hobo/iac-pulumi: Automation API adapter (preview/apply/destroy/refresh) (packages/iac/iac-pulumi/) | First provider & IaC | slice | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Primary IaC adapter behind the core IacProvider port: Pulumi Automation API preview/apply/destroy/refresh with per-resource state, per docs/design/architecture.md packages list. Promotes the iac slices of src/draft/epic-proofs/providers-iac-build-adapters/. Proof: adapter passes its @hobo/conformance IaC suite against a local/container backend. Depends on: S2-00 |
| S2-06 | First provider package: realize() + Capability Manifest + provider conformance (packages/providers/provider-<first>/) | First provider & IaC | slice | 3 | S2-00, S2-05 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. The first real cloud provider (choice recorded in S2-00): `realize()` → IacProgram/BuildSpec, `.with(...)` typed options, published Capability Manifest with cost.json, passing the provider-conformance suite (HOBO-87/93/102 pattern). Promotes src/draft/epic-proofs/providers-iac-build-adapters/. Proof: hello-bindle's plan realizes to real cloud resources and tears down clean. Depends on: S2-00, S2-05 |
| S2-07 | Governance gate: @hobo/contracts + @hobo/policy + Gatekeeper can-deploy (packages/contracts/, packages/policy/) | Identity & governance gate | slice, security | 3 | S2-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Contract plane (Contract IR, `can-deploy` compatibility engine) and policy plane (Policy IR, built-in TS engine, decisions + approval obligations) composed by the Gatekeeper at the deploy decision point, per docs/design/contracts-policy-flags.md. Promotes HOBO-91/100 and src/draft/epic-proofs/contracts-policy-governance/. Proof: an unsafe change is blocked with an explainable, machine-readable reason (FR-050/051/052, NFR-017). Depends on: S2-00 |
| S2-08 | CLI cloud verbs: hobo login/plan/up/down against the real Yard | Identity & governance gate | slice | 3 | S2-00, S2-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Wire `hobo login` (OIDC dev SVID), `hobo plan` (approvable DeploymentPlan diff), `hobo up` (provision+deploy convergence), `hobo down` (reverse teardown) in packages/cli/ over the Gateway, per docs/design/cli-spec.md. Promotes the deploy-verb slices of src/draft/epic-proofs/cli-mcp-developer-experience/. Proof: full plan→up→down cycle green against the Yard with PACT-pinned CLI/API boundary. Depends on: S2-00, S2-01 |
| S2-09 | Stage-2 gate: governed deploy to a real cloud survives Yard restart mid-deploy | Stage-2 gate | hardening, adversarial | 1 | S2-01, S2-02, S2-03, S2-04, S2-05, S2-06, S2-07, S2-08 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Executable Stage-2 acceptance (requirements Release Criteria): reference Bindle deploys to the real cloud; the Yard process is killed mid-deploy and resumes to `Deployed` by replay; the Gatekeeper blocks an unsafe change with an explainable reason; evidence attached to the S2 acceptance record. Proof: a release-lane job (manual/live per testing policy) plus mocked rehearsal in CI. Blocks S3-00. Depends on: S2-01, S2-02, S2-03, S2-04, S2-05, S2-06, S2-07, S2-08 |

### Build S3: Agent Autonomy (`S3`)

**Summary.** MCP surface with CLI parity, keyless identity — agents deploy with brokered short-lived tokens only, credential audit, agent-facing docs, prompt-injection and quota hardening. Gate: an agent deploys via MCP using only brokered tokens; audit present.

**Stage goal:** agents are first-class operators. Builds `packages/mcp` (@hobo/mcp server over the shared CLI call path, NFR-004 surface parity), wires MCP tool auth to the SVID/token-broker model, completes the keyless path to provider STS (NFR-005 ≥99% brokered), lands the CredentialAudit projection with never-compacted audit streams (NFR-018), machine-readable docs/onboarding (NFR-015), and per-principal rate limits (NFR-019).

**Acceptance gate (requirements Stage 3):** an agent deploys via MCP using only brokered tokens; credential audit present.

**Subsystems promoted:** CLI/MCP/DX MCP slices + Identity/XAA brokered-token slices (proofs: `src/draft/epic-proofs/cli-mcp-developer-experience/`, `src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/`; design: docs/design/ai-native-agent-auth.md, developer-experience.md).

**Dependency:** S3-00 blocked on S2-09 (Stage-2 gate); skeletons blocked on S3-00.

**Milestones:**

- **MCP surface** — M0 record; @hobo/mcp server with capability-scoped tools + CLI parity; agent-facing docs.
- **Keyless identity & token broker** — MCP auth on SVIDs; OIDC federation to provider STS; zero static secrets.
- **Audit & hardening** — CredentialAudit projection, never-compact retention, prompt-injection + quota hardening.
- **Stage-3 gate** — Agent deploys via MCP with brokered tokens only; credential audit present.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S3-00 | M0: Acceptance record + productionization plan for stage S3 (Agent Autonomy) | MCP surface | hardening | 1 | S2-09 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Post-core delta M0: Stage-3 acceptance record in docs/design/ naming scope in/out (packages/mcp/, packages/identity/ token-exchange, packages/cli/ shared dispatch), authority boundaries for agent principals, evidence expectations (MCP E2E with brokered tokens, credential-audit projection), and pointers to docs/design/ai-native-agent-auth.md plus the cli-mcp-developer-experience and identity-auth-secrets-cross-app-access-xaa proofs. Done when the record is indexed with traceability rows and S3 skeletons are unblocked. Depends on: S2-09 |
| S3-01 | @hobo/mcp server: capability-scoped tool surface over the shared CLI call path (packages/mcp/) | MCP surface | slice | 3 | S3-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. MCP server exposing every CLI verb as a capability-scoped tool over the same dispatch layer (NFR-004 parity, surface-parity test). Design: developer-experience.md; promotes the MCP slices of src/draft/epic-proofs/cli-mcp-developer-experience/. Proof: parity test asserts CLI↔MCP verb equivalence; an agent completes plan→up on a fixture Bindle. Depends on: S3-00 |
| S3-02 | MCP tool auth on the SVID model + per-tool capability scoping | Keyless identity & token broker | slice, security | 3 | S3-00, S3-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Bind MCP sessions to attested agent principals (JWT-SVID), scope each tool to declared capabilities, deny-by-default, in packages/mcp/ + packages/identity/. Design: ai-native-agent-auth.md, ADR-0023. Proof: an agent invoking an unscoped tool gets a typed denial; every grant is an audited `token.*` event. Depends on: S3-00, S3-01 |
| S3-03 | Keyless end-to-end: OIDC federation token exchange to provider STS | Keyless identity & token broker | slice, security | 3 | S3-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Complete the brokered path in packages/identity/: SVID → token broker → OIDC federation → provider STS short-lived scoped credentials for Executors and agents (NFR-005, ≥99% brokered; bounded static-key escape hatch). Promotes HOBO-110 and the identity proof. Proof: a deploy completes with zero static provider keys; a key past TTL is rejected. Depends on: S3-00 |
| S3-04 | CredentialAudit projection + never-compacted audit-stream retention | Audit & hardening | slice, security | 3 | S3-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. CredentialAudit projection over `identity.*`/`token.*`/`session.*` in packages/cloud/ with retention-floor enforcement — audit streams are never compacted (NFR-018). Promotes HOBO-66 and the identity proof's audit fixtures. Proof: grant/use/revoke visible in the projection; a retention test shows streams older than the floor still present. Depends on: S3-00 |
| S3-05 | Agent-facing docs surface: llms.txt / llms-full.txt / docs.json + npx onboarding | MCP surface | slice, user-story | 3 | S3-00, S3-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Publish machine-readable operations manifests (llms.txt/llms-full.txt/docs.json) generated from the CLI/MCP registry, plus the instant `npx` onboarding path (NFR-015), in packages/cli/ + docs pipeline. Design: developer-experience.md. Proof: onboarding test — a fresh agent self-serves from docs.json to a successful `hobo dev`. Depends on: S3-00, S3-01 |
| S3-06 | ADVERSARIAL: MCP prompt-injection + over-broad permissions; per-principal rate limits & quotas | Audit & hardening | adversarial, security | 3 | S3-00, S3-01, S3-02 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Harden packages/mcp/ + Gateway against prompt-injection-driven tool abuse and over-broad agent permissions; enforce per-principal/per-tenant rate limits + quotas with backpressure (NFR-019). Promotes the adversarial MCP slice of the cli-mcp proof. Proof: a flooding agent is throttled with a typed error while legitimate volume is unaffected; injection corpus cases fail closed. Depends on: S3-00, S3-01, S3-02 |
| S3-07 | Stage-3 gate: agent deploys via MCP using only brokered tokens; credential audit present | Stage-3 gate | hardening, user-story | 1 | S3-01, S3-02, S3-03, S3-04, S3-05, S3-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Executable Stage-3 acceptance (requirements Release Criteria): an MCP agent completes an end-to-end deploy with brokered short-lived tokens only, the CredentialAudit projection shows the full grant/use trail, and the agent self-corrects from a seeded actionable failure (NFR-017). Evidence attached to the S3 acceptance record. Blocks S4-00. Depends on: S3-01, S3-02, S3-03, S3-04, S3-05, S3-06 |

### Build S4: Multi-Cloud (`S4`)

**Summary.** Second provider, Junction federation, cross-cloud mTLS + connectivity tiers, DNS/gateway, portability conformance. Gate: one unedited Bindle on >=2 clouds; cross-cloud mTLS works; provider switch touches only config.

**Stage goal:** portability becomes real. Builds the second provider package, `packages/junctions` (Yard federation + connectivity inference), the SVID-keyed cross-cloud mTLS data path and connectivity tiers, DNS/domain + gateway ingress ports, and the portability conformance harness around `examples/multi-cloud-shop` (NFR-001: `bindle()` + app `src/` byte-identical across targets; NFR-020 core→provider import lint).

**Acceptance gate (requirements Stage 4):** one Bindle deploys to ≥2 clouds; cross-cloud mTLS works; switching a resource's provider touches only config; Resource Definitions/Matching + Resource Packs (FR-060/061/062) participate in resolution.

**Subsystems promoted:** Networking/DNS/Relay (proof: `src/draft/epic-proofs/networking-connectivity-dns-relay/`), Portability/Registry/Distribution (proof: `portability-registry-distribution`), second-provider slices of `providers-iac-build-adapters`; design: security-networking.md, architecture.md (Junction), ADR-0024/0043.

**Dependency:** S4-00 blocked on S3-07; skeletons blocked on S4-00.

**Milestones:**

- **Second provider** — M0 record; second provider package through the same conformance gate as the first.
- **Cross-cloud networking & mTLS** — SVID-keyed mTLS data path, connectivity tiers, DNS/domain + gateway ingress ports.
- **Junction federation & matching** — junction() federation, cross-cloud connectivity inference, Resource Definitions/Packs in resolution.
- **Portability conformance & gate** — multi-cloud-shop byte-identical portability proof; Stage-4 gate.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S4-00 | M0: Acceptance record + productionization plan for stage S4 (Multi-Cloud) | Second provider | hardening | 1 | S3-07 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Post-core delta M0: Stage-4 acceptance record in docs/design/ naming scope in/out (packages/providers/provider-<second>/, packages/junctions/, networking additions to packages/cloud/ + packages/identity/, examples/multi-cloud-shop/), the second-provider selection decision, the NFR-001 byte-identical portability method, and pointers to security-networking.md, ADR-0024/0043, and the networking-connectivity-dns-relay + portability-registry-distribution proofs. Done when the record is indexed with traceability rows and S4 skeletons are unblocked. Depends on: S3-07 |
| S4-01 | Second provider package through the provider-conformance gate (packages/providers/provider-<second>/) | Second provider | slice | 3 | S4-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Second real cloud provider (choice in S4-00) with `realize()`, `.with(...)` options, Capability Manifest + cost.json, passing the same @hobo/conformance provider suite as the first (HOBO-87/102 pattern). Promotes src/draft/epic-proofs/providers-iac-build-adapters/. Proof: hello-bindle deploys unedited to the second cloud and tears down clean. Depends on: S4-00 |
| S4-02 | @hobo/junctions: junction() federation + cross-cloud connectivity inference (packages/junctions/) | Junction federation & matching | slice | 3 | S4-00, S4-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Junction federating peer Yards (no shared mutable state, ADR-0043): `junction()` authoring in packages/junctions/, federate-each-Yard-its-half connectivity inference. Promotes the Junction slices of src/draft/epic-proofs/networking-connectivity-dns-relay/. Proof: two Yards federate and a cross-Yard bind resolves to a working endpoint. Depends on: S4-00, S4-01 |
| S4-03 | Cross-cloud mTLS data path (SVID-keyed) + connectivity-tier model | Cross-cloud networking & mTLS | slice, security | 3 | S4-00, S4-02 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. SVID cert issuance/rotation in packages/identity/ and the 5-tier connectivity model (tier 5 public+mTLS first) realized across Camps on both clouds, per docs/design/security-networking.md and the connectivity-tier IR (HOBO-89). Promotes the networking proof's mTLS fixtures. Proof: a cross-cloud service call verifies peer SVIDs both ways; a non-mTLS peer is refused. Depends on: S4-00, S4-02 |
| S4-04 | DNS + domain validation gates and the gateway/ingress port | Cross-cloud networking & mTLS | slice, security | 3 | S4-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Production `hobo:dns` capability port, Domain resource with validation checks (multi-vantage, TTL-propagation, ACME DNS-01, health) and the gateway/ingress port in packages/cloud/ + provider packages (HOBO-101/105 + `domain.*` events). Promotes src/draft/epic-proofs/networking-connectivity-dns-relay/. Proof: a custom domain validates, gets a cert, and routes to a deployed Bindle on either cloud. Depends on: S4-00 |
| S4-05 | Portability conformance: examples/multi-cloud-shop unedited-Bindle byte-identity harness | Portability conformance & gate | slice, user-story | 3 | S4-00, S4-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Author examples/multi-cloud-shop/ and the NFR-001 harness: assert `bindle()` + app src/ byte-identical across both targets with only camp()/yard() mapping varying, plus the CI dependency-graph lint that fails any core→provider import (NFR-020). Promotes src/draft/epic-proofs/portability-registry-distribution/. Proof: the identical-topology assertion runs as a CI lane over both providers' plans. Depends on: S4-00, S4-01 |
| S4-06 | Provider switch touches only config: Resource Definitions/Matching + Resource Packs in resolution | Junction federation & matching | slice | 3 | S4-00, S4-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Cross-cloud equivalence classes + Matching so switching one resource's provider is a config-only Delta (FR-060/061/062): Resource Definitions, installable Resource Packs, Deployment Set + Delta incremental reconcile in packages/cloud/. Promotes HOBO-93/103/108 proof slices. Proof: flipping a kv resource's provider produces a Delta touching zero app source and reconciles only changed nodes. Depends on: S4-00, S4-01 |
| S4-07 | Stage-4 gate: one unedited Bindle on ≥2 clouds with working cross-cloud mTLS | Portability conformance & gate | hardening, user-story | 1 | S4-01, S4-02, S4-03, S4-04, S4-05, S4-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Executable Stage-4 acceptance (requirements Release Criteria): multi-cloud-shop deploys unedited to ≥2 clouds, cross-cloud mTLS verified, a provider switch is config-only, and Definitions/Matching/Packs demonstrably participate in resolution; evidence attached to the S4 acceptance record. Blocks S5-00. Depends on: S4-01, S4-02, S4-03, S4-04, S4-05, S4-06 |

### Build S5: Forge & Extensibility (`S5`)

**Summary.** AI generation pipeline (scaffold → fill → validate → repair → certify) in a no-egress sandbox, evals/training, registry publication. Gate: hobo forge <url> yields a conformance-certified provider; a stubbed port gets a promoted AI implementation.

**Stage goal:** HoBo extends itself safely. Builds the generation pipeline (scaffold → LLM-fill → sandboxed validation → bounded repair → certify), `packages/evals` (rubrics + promotion gates) and `packages/training` (OPTO + OpenInference capture, internal), the no-egress generation sandbox (NFR-007: Firecracker + wasm capability; signed + conformance-passing or it does not run), the `hobo forge <url>` CLI verb, and certified publication to `packages/registry`.

**Acceptance gate (requirements Stage 5):** `hobo forge <url>` produces a certified provider passing conformance; a stubbed port gets an AI-generated, conformance-passing implementation promoted through the eval gate.

**Subsystems promoted:** Generation Pipeline, Training & AI Safety (G1..G24; proof: `src/draft/epic-proofs/generation-pipeline-training-ai-safety/`), registry publish/certify slices (proof: `portability-registry-distribution`); design: docs/design/generated-stack.md, forge-generated-stack.md, ai-generation-launch-posture.md.

**Dependency:** S5-00 blocked on S4-07; skeletons blocked on S5-00.

**Milestones:**

- **Generation pipeline** — M0 record; scaffold → LLM-fill → validate → bounded-repair loop with gen.* events.
- **Sandbox & certification** — No-egress sandbox, signing + provenance, hobo forge verb, registry publish of certified artifacts.
- **Evals & training** — @hobo/evals rubrics + promotion gates; @hobo/training OPTO + OpenInference trajectories.
- **AI-safety hardening & gate** — Prompt-injection/backdoor defenses; Stage-5 forge gate.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S5-00 | M0: Acceptance record + productionization plan for stage S5 (Forge & Extensibility) | Generation pipeline | hardening | 1 | S4-07 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Post-core delta M0: Stage-5 acceptance record in docs/design/ naming scope in/out (packages/evals/, packages/training/, generation pipeline in packages/cloud/, `hobo forge` in packages/cli/, certify/publish in packages/registry/), the promotion-gate policy (low-risk auto-certify vs human hook), sandbox authority boundary (NFR-007), and pointers to generated-stack.md, ai-generation-launch-posture.md, and the generation-pipeline-training-ai-safety proof (G1..G24 contracts). Done when the record is indexed with traceability rows and S5 skeletons are unblocked. Depends on: S4-07 |
| S5-01 | @hobo/evals: rubrics + promotion gates (Contract/Eval/Policy three-pass) (packages/evals/) | Evals & training | slice | 3 | S5-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Rubric definitions, scoring, and the promotion gate composing contract + eval + policy verdicts for generated artifacts (G2/G10), per docs/design/generated-stack.md. Promotes src/draft/epic-proofs/generation-pipeline-training-ai-safety/. Proof: a below-threshold candidate is refused promotion with a machine-readable rubric report. Depends on: S5-00 |
| S5-02 | No-egress generation sandbox + signed certification descriptor | Sandbox & certification | slice, security | 3 | S5-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Firecracker + wasm-capability generation sandbox with no egress during conformance (NFR-007) and the SLSA-style signed certification descriptor (G3/G5), reusing S0-09 signing infra; in packages/cloud/ executors + packages/registry/. Promotes the generation proof's sandbox contracts. Proof: an egress attempt from a generation run fails closed; an unsigned generated plugin is refused at load. Depends on: S5-00 |
| S5-03 | Generation pipeline: scaffold → LLM-fill → sandboxed validation → bounded repair (gen.* events) | Generation pipeline | slice | 3 | S5-00, S5-01, S5-02 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Event-sourced generation pipeline (G6..G9): per-port scaffolds, contract-first LLM-fill with sanitized hints, sandboxed conformance + trace-replay validation, bounded repair loop escalating to `gen.NeedsHuman`. Promotes src/draft/epic-proofs/generation-pipeline-training-ai-safety/. Proof: the cold-start reference run (generate a `database`-port provider) reaches a conformance-passing candidate. Depends on: S5-00, S5-01, S5-02 |
| S5-04 | hobo forge <url> verb + certified publish to the Registry | Sandbox & certification | slice | 3 | S5-00, S5-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. `hobo forge <url>` in packages/cli/: ingest a provider's API docs, drive the generation pipeline, certify (sign + provenance + conformance report) and publish `listing.Published/Certified` to packages/registry/, per forge-generated-stack.md. Promotes generation + portability-registry-distribution proofs. Proof: forge on a fixture URL yields an installable, Matching-selectable certified provider. Depends on: S5-00, S5-03 |
| S5-05 | @hobo/training: OPTO optimizer + OpenInference trajectory capture (packages/training/, internal) | Evals & training | slice | 3 | S5-00, S5-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. training-engine port with the built-in OPTO optimizer and OpenInference trajectory capture + live-eval reward stream (G4/G11/G12, NFR-021), internal-only surface. Promotes the generation proof's training contracts. Proof: OpenInference spans present per trainable call, exported to a tenant OTLP backend fixture. Depends on: S5-00, S5-01 |
| S5-06 | ADVERSARIAL: prompt-injection sanitization + conformance-passing-but-malicious detection | AI-safety hardening & gate | adversarial, security | 3 | S5-00, S5-03 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Harden the pipeline against poisoned material inputs (G18) and generated code that passes conformance while hiding malicious behavior (G19): sanitizer, static/behavioral screens, human-gate enforcement for prod-risk artifacts (G21). Promotes the adversarial fixtures in the generation proof. Proof: the injection + backdoor corpora fail closed and are audited as `gen.*` events. Depends on: S5-00, S5-03 |
| S5-07 | Stage-5 gate: hobo forge <url> yields a conformance-certified provider; stubbed port promoted through the eval gate | AI-safety hardening & gate | hardening, user-story | 1 | S5-01, S5-02, S5-03, S5-04, S5-05, S5-06 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Executable Stage-5 acceptance (requirements Release Criteria): `hobo forge <url>` produces a certified provider passing @hobo/conformance, and a stubbed port receives an AI-generated, conformance-passing implementation promoted through the eval gate; evidence attached to the S5 acceptance record. Blocks S6-00. Depends on: S5-01, S5-02, S5-03, S5-04, S5-05, S5-06 |

### Build S6: Production Hardening (`S6`)

**Summary.** HA/DR (crash-resume, replay-from-log rebuild), FinOps (budgets/showback/spend caps, plan-cost ±20%), dashboard + WCAG/i18n, governance planes (notify/classification/guardrails/certified listings), canary auto-rollback. Gate: requirements stage-6 acceptance.

**Stage goal:** everything the requirements demand for v1 GA. Hardens the control plane to HA targets (NFR-009 99.9%/99.95%, resume <30 s) and DR as replay-from-log (NFR-010 RPO ~0/≤5 s, RTO <15 min); lands FinOps (CreditLedger/metering, budgets + spend-cap policy gates, showback, plan-time cost within ±20% — FR-070, NFR-012); ships the dashboard (FR-071 views, WCAG 2.1 AA + pseudo-loc i18n, NFR-016); makes the governance planes usable (consent-gated notify, classified-field residency/retention with crypto-shred erasure, guardrail blocks, certified-only Registry listings); and productionizes canary auto-rollback via the Harness.

**Acceptance gate (requirements Stage 6):** canary auto-rollback; plan-time cost within tolerance; DR rebuild < RTO; full dashboard + accessibility; governance planes demonstrably usable. This gate is the v1 GA definition of done.

**Subsystems promoted:** Reliability/Obs/Cost + FinOps (proofs: `src/draft/epic-proofs/reliability-observability-cost-finops/`, `finops-budget-routing-control-plane`), Progressive Delivery (`progressive-delivery-harness`), Operators/SRE (`operators-sre-crew`), governance-plane slices (`contracts-policy-governance`), UX gap closure (`v1-vibe-example-gap-closure`).

**Dependency:** S6-00 blocked on S5-07; skeletons blocked on S6-00.

**Milestones:**

- **HA & DR** — M0 record; control-plane HA + crash-resume; DR replay-from-log rebuild inside RTO.
- **FinOps** — CreditLedger/metering, budgets/caps as policy gates, showback, plan-cost accuracy.
- **Dashboard & UX** — FR-071 dashboard views, WCAG 2.1 AA + i18n, actionable explain-failure, full OTel.
- **Governance planes & delivery** — notify/classification/guardrail/certified-listing planes; canary auto-rollback.
- **Stage-6 gate** — Requirements stage-6 acceptance — the v1 GA definition of done.

**Issues** (labels omit the common `production-build`; priority 1=Urgent 2=High 3=Medium):

| Key | Title | Milestone | Labels | Prio | Depends on | Scope brief |
|---|---|---|---|---|---|---|
| S6-00 | M0: Acceptance record + productionization plan for stage S6 (Production Hardening) | HA & DR | hardening | 1 | S5-07 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Post-core delta M0: Stage-6 acceptance record in docs/design/ naming scope in/out (HA/DR in packages/cloud/ + runtimes, FinOps in packages/cloud/ + packages/policy/, dashboard app under packages/ or apps/dashboard per architecture review, governance planes across packages/policy/+cloud, Harness delivery in packages/cloud/), the NFR targets to be proven (NFR-009/010/012/014/016/017), and pointers to reliability-observability-cost.md, finops-budget-routing-control-plane.md, governance-planes.md, deployment-dashboard-topology-explorer.md and the six S6 proofs. Done when the record is indexed with traceability rows and S6 skeletons are unblocked. Depends on: S5-07 |
| S6-01 | Control-plane HA: availability targets, crash-resume <30 s, saga compensation hardening | HA & DR | slice, hardening | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Harden packages/cloud/ to NFR-009: 99.9%/99.95% availability posture, crash-resume under 30 s via replay, compensation-of-compensation escalation to needs-human. Promotes src/draft/epic-proofs/reliability-observability-cost-finops/ + operators-sre-crew chaos fixtures. Proof: a chaos lane kills each control-plane component mid-saga and the deploy converges inside the resume budget. Depends on: S6-00 |
| S6-02 | DR: replay-from-log rebuild drill (RPO ~0/≤5 s, RTO <15 min) | HA & DR | slice, hardening | 3 | S6-00, S6-01 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. DR as replay from the event log (NFR-010): backup/restore of the log, full Yard rebuild drill with fencing against split-brain, per docs/design/backup-restore.md + drift-reconciliation.md. Promotes the reliability proof's DR simulation and operators-sre-crew failover fixtures. Proof: a scripted drill rebuilds a working Yard from the log inside RTO with measured RPO. Depends on: S6-00, S6-01 |
| S6-03 | FinOps: CreditLedger/metering, budgets + spend-cap policy gates, showback, plan-cost ±20% | FinOps | slice | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. MeteringView + CreditLedgerView projections, budgets/caps enforced through the policy plane (deny-ceiling on spend), showback per tenant/Bindle/Camp, `hobo plan` projected cost within ±20% of fixture (FR-070, NFR-012), runaway-spend circuit-breaker; in packages/cloud/ + packages/policy/. Promotes src/draft/epic-proofs/finops-budget-routing-control-plane/ + reliability-observability-cost-finops. Proof: a budget breach blocks a deploy or raises an approval obligation; cost-accuracy fixture lane green. Depends on: S6-00 |
| S6-04 | Dashboard: timeline/topology/run-inspector/credential-audit/drift views + WCAG 2.1 AA + i18n | Dashboard & UX | slice, user-story | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. The FR-071 dashboard rendered from projections only: deployments timeline with replay/time-travel scrubber, topology graph with connectivity+cost edges, run inspector with replay-diff, credential audit, drift view; WCAG 2.1 AA + pseudo-localization-passing i18n (NFR-016). Design: deployment-dashboard-topology-explorer.md, accessibility-usability-launch-baseline.md; promotes v1-vibe-example-gap-closure proof material. Proof: every view renders for the reference app from projections; automated WCAG audit + pseudo-loc test green. Depends on: S6-00 |
| S6-05 | Governance planes usable: consent-gated notify, classification obligations + crypto-shred, guardrails, certified-only listings | Governance planes & delivery | slice, security | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. The four stage-6 governance demonstrations per docs/design/governance-planes.md in packages/policy/ + packages/cloud/ + packages/registry/: event-sourced consent-gated `notify` send; a classified field driving an enforced residency/retention obligation with crypto-shred erasure; a guardrail blocking a flagged model output; certified Registry listings installable via Matching with uncertified unlisted. Promotes contracts-policy-governance + portability-registry-distribution proofs. Proof: each of the four scenarios runs as an executable acceptance case. Depends on: S6-00 |
| S6-06 | Progressive delivery: canary saga templates + SLO-gated auto-rollback (the Harness) | Governance planes & delivery | slice | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Canary/blue-green/progressive deployment-strategy sagas with SLO-burn-rate-gated automatic promotion/rollback over gateway traffic-split, in packages/cloud/, per the Harness design (docs/design/ progressive delivery + reliability-observability-cost.md). Promotes src/draft/epic-proofs/progressive-delivery-harness/. Proof: a seeded SLO breach during canary auto-rolls-back and the rollback is itself compensable. Depends on: S6-00 |
| S6-07 | Actionable failure output (explain-failure) + full OTel coverage across control + data planes | Dashboard & UX | slice, hardening | 3 | S6-00 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. NFR-017 + NFR-014: every blocked gate / failed deploy states root cause + 1-2 remediation steps machine-readably (`explain-failure`), and OTel logs/traces/metrics cover a deploy and a run end-to-end, in packages/cli/ + packages/cloud/ + runtimes. Promotes reliability-observability-cost-finops proof telemetry contracts. Proof: `explain-failure` on a seeded failure yields cause+fix; traces present for a deploy and a run; the MCP agent self-corrects using the structured error. Depends on: S6-00 |
| S6-08 | Stage-6 gate: v1 GA acceptance — every requirements build-stage gate green | Stage-6 gate | hardening, user-story | 1 | S6-01, S6-02, S6-03, S6-04, S6-05, S6-06, S6-07 | > Skeleton slice — becomes actionable when its stage M0 acceptance record is Done. Executable Stage-6 acceptance per requirements Release Criteria: canary auto-rollback, plan-time cost within tolerance, DR rebuild < RTO, full dashboard + accessibility (NFR-016), and all four governance-plane demonstrations — assembled with the S0..S5 gate evidence into the v1 GA go/no-go record (docs/design/go-no-go-decision-record.md). Proof: a single release-lane pipeline replays every stage gate and publishes the evidence packet. Depends on: S6-01, S6-02, S6-03, S6-04, S6-05, S6-06, S6-07 |

## Companion project: Intent-Alignment Gap Remediation

Delivery vehicle for confirmed findings in [`GAPS.md`](../../GAPS.md) (documentation-level fixes;
one issue per REM entry; grows as later review iterations confirm more findings).

| Key | Title | Prio | Source | Scope brief |
|---|---|---|---|---|
| REM-001 | Make the origin intent and the Nomad evaluation visible in the design suite | 2 | GAPS.md DRIFT-001 | Add an "Origin intent & lineage" subsection to `docs/design/vision.md` (five-pillar origin mapped to plans/ADRs; Nomad row in landscape + borrows tables → `docs/competitors/nomad.md#hobo-mapping`); amend ADR-0031 with an "Alternatives considered" note recording the Nomad evaluation. Acceptance: `grep -ri nomad docs/design/` hits vision.md + ADR-0031; `pnpm agent:check -- --staged` green. Effort S. |
| REM-002 | Record the first-party-commercial-launch vs product-billing boundary as an ADR | 1 | GAPS.md DRIFT-002 | New ADR (next free global ID) in `docs/design/adr/07-portability-extensibility.md` scoping ADR-0064's removal to product billing while first-party launch policies (billing-launch-policy, usage-to-invoice-reconciliation, tax-currency-receipt-obligations, billing-credits, entitlements-plan-limits) are launch collateral; each covered doc cites it; disposition the `invoice.*` event family. Acceptance: ADR in `docs/design/adr/index.md`; every covered doc cites it; `pnpm agent:check -- --staged` green. Effort M. |
| REM-003 | Disposition the dormant marketplace payout hooks | 3 | GAPS.md DRIFT-003 | Extend the REM-002 ADR with a "deferred monetization hooks" clause (or scope note in `marketplace-payout-hooks.md` + `known-limitations-register.md` row): payout-readiness states are dormant, non-normative until an ADR re-admits rev-share. Effort S. |

## Import record (2026-07-01)

Imported live via Linear MCP, paced single-writer, zero failures. **Linear is the live source of
truth**; this doc remains the durable mirror. Identifier map:

| Scope | Linear project ID | Issues |
|---|---|---|
| Initiative: HoBo v1 Production Build | `bc463c40-f5a8-4246-8d71-0d4dd2f6c6c7` | all below |
| Build S0: Toolchain & Contracts Bootstrap | `a15e5df9-0326-481d-86c8-c40e0f28dacb` | S0-01…S0-12 → HOBO-578…589 |
| Build S1: Local SDK & Runtime | `3eeb5b23-68eb-4e4b-be4f-c4420f92cefc` | S1-01…S1-25 → HOBO-590…602, 604…615 |
| Build S2: First Cloud + Yard | `fc135048-8dd6-469d-95ab-1137fe7e99f3` | S2-01…S2-11 → HOBO-616…626 |
| Build S3: Agent Autonomy | `8a322732-b6f8-4f9d-a662-bb89043b9844` | S3-01…S3-10 → HOBO-627…636 |
| Build S4: Multi-Cloud | `579181ec-2472-444f-b696-506d2b66bd3e` | S4-01…S4-09 → HOBO-637…645 |
| Build S5: Forge & Extensibility | `1602a539-4c2f-44da-b030-ad256857103f` | S5-01…S5-10 → HOBO-646…655 |
| Build S6: Production Hardening | `cafc7067-23f2-45aa-9af3-828e62afd4e2` | S6-01…S6-10 → HOBO-656…665 |
| Intent-Alignment Gap Remediation | `292efb1a-669c-4d79-93df-901d134b4832` | REM-001…REM-025 → HOBO-666…690 |

Issue titles are prefixed with their stage key (`S0-01: …`, `REM-004: …`); dependencies are wired as
Linear blocking relations; every issue carries the `production-build` or `intent-alignment` label.
S0/S1 and each stage M0 carry full QA-verified one-shot bodies; S2–S6 slices carry full
build-instruction bodies (upgraded in place 2026-07-02) and are blocked by their stage M0, whose
pinned handoff comment requires sharpening each slice body into a full one-shot checklist before
the M0 closes. Remediation issues point at root `GAPS.md` REM entries as their executable spec;
the review-iteration loop itself is Linear work (HOBO-691/HOBO-692).

## Appendix — full one-shot bodies (import-ready)

### S0-01 — Scaffold the production monorepo: pnpm workspaces + Turborepo + layered packages/ tree with boundary lint

> **Landed early (verify, don't re-do):** main already carries the `packages/` tree with
> nested category globs in `pnpm-workspace.yaml`, `tsconfig.base.json`, `lint:boundaries`
> (`scripts/check-package-boundaries.mts`), Biome config for `packages/*`, an honest
> Turborepo task graph with strict env, and change-impact recognition for
> `packages/{runtimes,providers,iac,build}/<pkg>` in policy + architecture guard. An agent
> picking this up should verify those pieces against the acceptance list below instead of
> re-scaffolding them.

> **Corrections to the architect's brief (verified against the repo on 2026-07-01):**
> 1. The brief says the workspace-skeleton fixture is "in `src/draft/epic-proofs/foundations-build-conformance-harness/`". The **executable** workspace-skeleton contract (the HOBO-1 POC: `canonicalSkeleton`, `validateBoundaryImports`, `detectWorkspaceCycles`) actually lives in **`src/draft/technical-proofs/hobo-monorepo-skeleton-contract/`**. The epic proof only *consumes* it (`services/foundations-reference-architecture.ts` imports it) and carries the Pact fixture `contracts/pacts/workspace-skeleton-boundary.pact.json` plus `simulation/fixtures/foundations-fixture.json`. Both proofs are promoted by this issue.
> 2. The brief says `npm run architecture:guard`; this repo is pnpm-first — the root script is `architecture:guard` in `package.json` and must be run as `pnpm run architecture:guard`.
> 3. The proof's `canonicalSkeleton` pins `pnpm@9.15.0`; the repo root already pins `"packageManager": "pnpm@10.33.4"`. Use the repo pin — do not downgrade.

## Why

Stage S0 (Toolchain & Contracts Bootstrap) turns the design-phase repo into the production monorepo skeleton so every later slice has a place to land and a boundary lint that stops layering rot on day one. This slice is the first brick of the **Monorepo & CI fabric** milestone: it creates the `packages/` tree, wires pnpm workspaces + Turborepo lanes over it, and extends the existing `architecture:guard` gate to enforce the inward-only dependency rule (NFR-020 / ADR-0024 §2). The S0 stage gate is: the layered skeleton exists, `pnpm exec turbo run build` is green across the tree, and a seeded `core → provider` import fails the guard — all sibling S0 slices (core contract surface, WIT toolchain, componentize, CI fabric) depend on this landing first.

## Context & references

- `docs/design/architecture.md` — section **"Monorepo & package architecture"** (the canonical package tree, tooling, and layering rule). Load-bearing quotes:
  - Tooling: *"pnpm workspaces + Turborepo; TypeScript (strict, `nodenext`); `tsup`/`unbuild` for builds; Vitest; Biome; Changesets for versioned publishing."*
  - Layering: *"Packages are layered; dependencies point **inward only** (`apps → adapters → sdk/runtime → core`). `@hobo/core` depends on nothing HoBo."* The layer diagram is: `core ← sdk, runtime ← runtimes/*, providers/*, iac/*, build/* ← cli, cloud, mcp, registry, identity` with *"(all adapters depend only on core's port interfaces)"*.
  - Conventions: *"**Ports live in `core`**, implementations in adapter packages; adapters never import each other."*
- `docs/design/adr/07-portability-extensibility.md#adr-0024` — ADR-0024 §2: *"**Enforce the layering invariant in CI** — a dependency-graph lint gate … fails the build if `@hobo/core` (or any agnostic package) imports a provider/iac/build package, or if an adapter imports another adapter. The agnostic core cannot leak provider detail. (TR-006, NFR-020)"*
- `docs/archive/requirements/requirements.md` — **NFR-020**: *"The **agnostic core never imports a provider/adapter package**; enforced at build time"*, acceptance: *"CI dependency-graph lint fails on a core→provider import"*.
- Draft proofs being promoted:
  - `src/draft/technical-proofs/hobo-monorepo-skeleton-contract/` (the HOBO-1 POC). Its `src/monorepo-skeleton-contract.ts` defines the required package paths, the layer classifier (`core` layer 0, `wit` layer 1, adapters layer 2–3, examples outermost), and the deny rules ("core must not import HoBo packages", "adapters must not import each other", "dependency points outward", cycle detection). Its tests (`test/monorepo-skeleton-contract.test.ts`) pin that a cross-adapter import fixture fails lint and that circular workspace deps fail the cycle check.
  - `src/draft/epic-proofs/foundations-build-conformance-harness/` — the "Platform engineer: bootstrap a package skeleton with boundary lint" BDD slice, the Pact fixture `contracts/pacts/workspace-skeleton-boundary.pact.json` (provider `WorkspaceSkeletonBoundary`, response `{"status":"valid","boundaryViolation":{"effect":"deny"}}`), and the negative case in `services/foundations-reference-architecture.ts` (`runNegativeCases` denies `packages/providers/provider-azure → @hobo/provider-aws`).
- Existing gate to extend: `scripts/check-architecture-guardrails.mjs` (run by root scripts `architecture:guard` / `architecture:guard:staged`; routed by `scripts/relevant-check-policy.ts` inside `pnpm agent:check`). Today it only recognizes `src/draft/<kind>/<slug>` as implementation packages and checks five evidence rules per changed package: PACT contract, protobuf definitions, CUE constraints covering every proto type, parse-don't-validate text evidence, and event-architecture text evidence.
- Repo rules that bind this issue: `AGENTS.md` — "HoBo implementation architecture rules" (protobuf-first records, per-package local `data-models/` folders for CUE-constrained types — *"Do not create a repository-wide `contracts/data-models` catalog"*), "JavaScript-family implementation file policy" (no new `.js`/`.mjs`; new repo scripts are `.mts` run via `node --import tsx`), and the Testing policy (no E2E lanes).

**Key decisions to honor, spelled out:** (1) The dependency rule is *inward only*: `@hobo/core` imports no `@hobo/*` package; adapter-family packages (`packages/providers/*`, `packages/runtimes/*`, `packages/iac/*`, `packages/build/*`) may import **only** `@hobo/core`; adapters never import each other; outer packages (cli) may import inner ones, never the reverse; cycles are always fatal. (2) The guard must *fail closed*: an unknown `@hobo/*` import specifier is a violation, not a warning. (3) All package stubs are strict TypeScript with `module`/`moduleResolution` `nodenext`. (4) Every new implementation package ships its own `data-models/` protobuf + CUE + Pact evidence so the existing guardrail checks pass. (5) Production code never lives under `src/draft/`; this issue creates real `packages/` at the repo root.

## Scope

### In

Exact deliverables (all paths repo-relative):

1. **Workspace config**
   - `pnpm-workspace.yaml`: add globs (keep the existing `src/draft/*` entries and the `minimumReleaseAgeExclude`/`allowBuilds` blocks untouched):
     ```yaml
     - "packages/*"
     - "packages/providers/*"
     - "packages/runtimes/*"
     - "packages/iac/*"
     - "packages/build/*"
     ```
   - `turbo.json`: add `"dependsOn": ["^build"]` to the `build` task and to the `typecheck` task (both currently lack it; layered packages need inner packages built first). Change nothing else.
   - Root `package.json`: add scripts `"build": "turbo run build"` and `"typecheck": "turbo run typecheck"`; rewrite the two guard scripts (exact strings in Steps 10).
   - Root `tsconfig.base.json` (new): shared strict-nodenext compiler options that every package tsconfig extends.

2. **Seven package stubs**, each `private: true`, name `@hobo/<dir>`:
   `packages/core`, `packages/wit`, `packages/bindles`, `packages/runtime`, `packages/componentize`, `packages/conformance`, `packages/cli`.
   Each package contains: `package.json`, `tsconfig.json`, `src/index.ts`, `test/index.test.ts`, `architecture.md`, `data-models/<dir>_boundary.proto`, `data-models/<dir>_boundary.cue`, `data-models/pacts/<dir>-boundary.pact.json`, `README.md`. Data contracts live under each package's own `data-models/` folder per AGENTS.md (no central catalog). `packages/core/data-models/workspace_boundary.proto`/`.cue` additionally define the boundary-lint record shapes (`WorkspaceBoundaryDeclaration`, `ImportEdge`, `BoundaryViolation`) that the guard script's TypeScript types mirror.

3. **Boundary lint** — new script `scripts/check-package-boundaries.mts` (TypeScript, per the no-new-`.mjs` policy). Public API:
   - `interface ImportEdge { from: string; to: string }` (workspace-relative dirs, e.g. `packages/cli` → `packages/core`)
   - `interface BoundaryViolation { from: string; to: string; rule: string }`
   - `collectWorkspaceImportEdges(root: string): Promise<ImportEdge[]>` — union of `package.json` `dependencies`/`devDependencies` entries on `@hobo/*` and static `from "@hobo/..."` / `import("@hobo/...")` specifiers found in `src/**/*.ts`/`.mts`/`.tsx` under `packages/**` and `examples/**`.
   - `validateBoundaryImports(edges: ImportEdge[]): { errors: string[] }` — the allowlist + generic rules below.
   - `detectWorkspaceCycles(edges: ImportEdge[]): { errors: string[] }` — DFS cycle detection (port the proof's implementation).
   - CLI entry (`main`): runs against `process.cwd()`, tolerates and ignores `--staged`/`--base=<ref>` args (they are forwarded by callers), prints `Package boundaries OK: <n> package(s), <m> edge(s).` or one `boundary-violation: <from> -> <to>: <rule>` line per error and exits 1.
4. **Guard extension** — `scripts/check-architecture-guardrails.mjs`: extend `implementationPackageRoot()` so `packages/<name>/...`, `packages/(providers|runtimes|iac|build)/<name>/...`, and `examples/<name>/...` map to implementation package roots (evidence rules then apply to the new stubs). Extend `scripts/relevant-check-policy.ts` so `sourceChanged` also matches the `packages` and `examples` prefixes (today it only watches `src`, `contracts`, `test`, `tests` — without this, future `packages/`-only PRs would skip the guard in `pnpm agent:check`/CI).
5. **Tests** — `test/package-boundaries.test.ts` (node:test + `assert/strict`, mirroring `test/architecture-guardrails.test.mjs`): green run on the real tree; seeded `core → provider` fixture fails; seeded adapter→adapter fixture fails; unknown `@hobo/*` specifier fails; cycle fails. Add a case to `test/relevant-check-policy.test.ts` asserting a `packages/core/src/index.ts` change selects the architecture:guard check.

### Out (explicitly excluded — owned elsewhere)

- Real port interfaces, event envelope, Capability Manifest schema in `@hobo/core` — **S0-02 (shared core contract surface)**. This issue ships placeholder exports only.
- WIT interfaces, `hobo:sdk` WIT package, toolchain lock in `@hobo/wit` — **S0-03 (WIT toolchain)**.
- `examples/hello-bindle` and the real componentize build pipeline — **S0-04 (hello-bindle componentize build)**; do not add an `examples/` glob or package yet.
- CI workflow changes, OIDC, signed-artifact trust — **S0-05 (CI fabric & artifact trust)**. `.github/workflows/hobo-ci.yml` already runs `pnpm agent:check`, which picks up the extended guard automatically; do not edit workflows.
- The rest of the design tree (`camps`, `yards`, `junctions`, `sdk`, `registry`, `identity`, `mcp`, `providers/*`, `runtimes/*`, `iac/*`, `build/*`, `data`, `events`, `contracts`, `policy`, `evals`, `training`, `hobo-code`, `agent-skills`) — created by the slices that ship their first real surface. The boundary lint's *generic* adapter rules must still be implemented now (the negative tests exercise them via temp fixtures).
- Biome, `tsup`/`unbuild`, and Changesets adoption (named in the design tooling line) — deferred to the release/lint tooling slice of this milestone; stubs build with `tsc` and record the deferral in their READMEs.

## Steps

1. Prepare the environment: `export NODE_OPTIONS="--max-old-space-size=8192"` (NOTE: if `NODE_OPTIONS` contains `--import tsx` the runner may reject it — set it exactly as shown first), then run `pnpm run setup` from the repo root.
2. Create a branch off `main` named `feat/s0-01-monorepo-skeleton` (conventional, scoped commits, e.g. `feat(monorepo): scaffold packages tree with boundary guard`). If the repo's working norms pin an active branch/PR (see `CLAUDE.md`), land there instead.
3. Write `tsconfig.base.json` at the repo root:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "module": "nodenext",
       "moduleResolution": "nodenext",
       "target": "es2022",
       "declaration": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     }
   }
   ```
4. Edit `pnpm-workspace.yaml`: append the five `packages/*` globs listed in Scope to the `packages:` list.
5. Create the seven package stubs. Template for `packages/<dir>` (replace `<dir>`; dependencies per the allowlist table in step 9 — e.g. `packages/cli/package.json` depends on `@hobo/core` and `@hobo/runtime` with version `"workspace:*"`; `packages/core` has no `@hobo/*` dependencies):
   - `package.json`:
     ```json
     {
       "name": "@hobo/<dir>",
       "private": true,
       "version": "0.0.0",
       "type": "module",
       "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
       "scripts": {
         "build": "tsc -p tsconfig.json",
         "typecheck": "tsc -p tsconfig.json --noEmit",
         "lint": "node -e \"process.exit(0)\"",
         "test": "node --import tsx --test test/*.test.ts"
       },
       "dependencies": {}
     }
     ```
   - `tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }`
   - `src/index.ts`: `packages/core` exports `export const CORE_PACKAGE = "@hobo/core" as const;` and `export interface PortDescriptor { readonly port: string; readonly version: string; }` (keep the surface provider-agnostic — no provider-specific names; the epic proof's negative case flags e.g. `accessKeyId` on core types). Every other package exports `export const PACKAGE_NAME = "@hobo/<dir>" as const;` and imports one allowed inner package to make the dependency graph real, e.g. `packages/cli/src/index.ts` starts with `import { CORE_PACKAGE } from "@hobo/core";` and re-exports it.
   - `test/index.test.ts`: node:test smoke test asserting the exported constant equals the package name.
   - `data-models/<dir>_boundary.proto` (snake_case dir in filename and proto package):
     ```proto
     syntax = "proto3";
     package hobo.<dir>.v1;
     message PackageBoundaryDeclaration {
       string package_name = 1;
       uint32 layer = 2;
       repeated string allowed_imports = 3;
     }
     ```
     For `packages/core` only, add `data-models/workspace_boundary.proto` with messages `WorkspaceBoundaryDeclaration`, `ImportEdge` (`string from = 1; string to = 2;`), `BoundaryViolation` (`string from = 1; string to = 2; string rule = 3;`).
   - `data-models/<dir>_boundary.cue`: one CUE definition per proto message **with the exact same type name** (the guard cross-checks names), e.g.:
     ```cue
     package <dir>
     #PackageBoundaryDeclaration: {
       package_name: =~"^@hobo/[a-z-]+$"
       layer: uint & <=4
       allowed_imports: [...=~"^@hobo/[a-z-]+$"]
     }
     ```
     (`packages/core` also defines `#WorkspaceBoundaryDeclaration`, `#ImportEdge`, `#BoundaryViolation` in a matching `workspace_boundary.cue`.)
   - `data-models/pacts/<dir>-boundary.pact.json`, modeled on the epic-proof fixture:
     ```json
     {
       "consumer": { "name": "@hobo/<dir>" },
       "provider": { "name": "WorkspaceSkeletonBoundary" },
       "interactions": [
         {
           "description": "declare package boundary and deny outward imports",
           "request": { "method": "POST", "path": "/workspace/validate" },
           "response": { "status": 200, "body": { "status": "valid", "boundaryViolation": { "effect": "deny" } } }
         }
       ],
       "metadata": { "pactSpecification": { "version": "3.0.0" } }
     }
     ```
   - `architecture.md` — must contain this evidence text verbatim (the guard greps for these phrases): "Parse, don't validate: raw workspace metadata crosses one parser boundary and becomes derived types (`PackageBoundaryDeclaration`); functions accept parsed domain types, not raw DTOs. Event architecture: boundary changes are modeled as commands that actors turn into events appended to the event store; materialized views (projections) serve queries; snapshots persist current state to the read store."
   - `README.md`: one paragraph — package purpose from the design tree in `docs/design/architecture.md`, plus a note that Biome/tsup/Changesets adoption is deferred to the release-tooling slice.
6. Run `pnpm install` (NOT frozen) to register the new workspace packages and update `pnpm-lock.yaml`; commit the lockfile.
7. Edit `turbo.json`: add `"dependsOn": ["^build"]` to the `build` and `typecheck` tasks.
8. Edit root `package.json`: add `"build": "turbo run build"` and `"typecheck": "turbo run typecheck"` scripts.
9. Write `scripts/check-package-boundaries.mts` implementing the API in Scope. Encode this exact allowlist (workspace dir → allowed `@hobo/*` imports):
   | package | allowed imports |
   |---|---|
   | `packages/core` | *(none)* |
   | `packages/wit` | `@hobo/core` |
   | `packages/bindles` | `@hobo/core`, `@hobo/wit` |
   | `packages/runtime` | `@hobo/core` |
   | `packages/componentize` | `@hobo/core`, `@hobo/wit` |
   | `packages/conformance` | `@hobo/core` |
   | `packages/cli` | `@hobo/core`, `@hobo/wit`, `@hobo/bindles`, `@hobo/runtime`, `@hobo/componentize`, `@hobo/conformance` |

   Generic rules evaluated for any package not in the table: `packages/providers/*`, `packages/runtimes/*`, `packages/iac/*`, `packages/build/*` are adapters and may import **only** `@hobo/core` (rule text `adapters depend only on core ports`); adapter→adapter is `adapters must not import each other`; any import *into* `packages/core` sources is impossible, but any import *from* `packages/core` to an `@hobo/*` package is `core must not import HoBo packages`; an `@hobo/*` specifier with no workspace package is `unknown import target (fail closed)`; cycles are `workspace dependency cycle: a -> b -> a`. Port `detectWorkspaceCycles` and the deny-rule shapes from `src/draft/technical-proofs/hobo-monorepo-skeleton-contract/src/monorepo-skeleton-contract.ts` (keep its error-message phrasing so the proof's assertions stay recognizable). Non-`@hobo` externals are always allowed.
10. Rewire the guard scripts in root `package.json`. Order matters: `pnpm run architecture:guard -- --base=X` appends args to the **end** of the script string, so the legacy `.mjs` (which consumes `--base`/`--staged`) must come last:
    - `"architecture:guard": "node --import tsx scripts/check-package-boundaries.mts && node scripts/check-architecture-guardrails.mjs"`
    - `"architecture:guard:staged": "node --import tsx scripts/check-package-boundaries.mts && node scripts/check-architecture-guardrails.mjs --staged"`
11. Extend `scripts/check-architecture-guardrails.mjs` `implementationPackageRoot()`: before the existing `src/draft` logic, return `parts.slice(0, 3).join("/")` for paths matching `packages/(providers|runtimes|iac|build)/<name>/...`, `parts.slice(0, 2).join("/")` for other `packages/<name>/...` paths, and `examples/<name>` for `examples/<name>/...` paths. Do not change the five evidence checks.
12. Extend `scripts/relevant-check-policy.ts`: change `const sourceChanged = touched(["src", "contracts", "test", "tests"])` to also include `"packages"` and `"examples"`.
13. Write `test/package-boundaries.test.ts`: (a) real tree passes with zero errors; (b) build a temp fixture via `fs.mkdtemp` containing `packages/core/package.json` (`"@hobo/core"`, dependency `"@hobo/provider-aws": "workspace:*"`), `packages/core/src/index.ts` containing `import "@hobo/provider-aws";`, and `packages/providers/provider-aws/package.json` — assert `validateBoundaryImports(await collectWorkspaceImportEdges(tmp))` yields an error matching `/core must not import/`; (c) adapter→adapter fixture (`provider-aws` importing `@hobo/provider-azure`) yields `/adapters must not import each other/`; (d) unknown specifier yields `/unknown import target/`; (e) `detectWorkspaceCycles` on `cli→runtime→cli` yields the cycle error. Extend `test/relevant-check-policy.test.ts` per Scope.
14. Build and test in order: `pnpm exec turbo run build --filter "./packages/*"`, then `pnpm exec turbo run typecheck test --filter "./packages/*"`, then `pnpm run architecture:guard`, then `pnpm run test:file test/package-boundaries.test.ts`.
15. Update docs in the same change (docs-freshness gate): `README.md` "Current state" blockquote (production `packages/` skeleton now exists), the stale "No HoBo product implementation code yet" claim in `CLAUDE.md`, and add a "Promoted by S0-01" note to `src/draft/technical-proofs/hobo-monorepo-skeleton-contract/README.md` and `src/draft/epic-proofs/foundations-build-conformance-harness/README.md` (workspace slice only — the proofs stay in place as contract fixtures).
16. Stage everything and run `pnpm run fetch:pr-base && pnpm agent:check -- --staged`; fix any failure (failed validation is not an acceptable completion state), commit, and open the PR.

## Acceptance criteria

- [ ] `pnpm run setup` completes (after `export NODE_OPTIONS="--max-old-space-size=8192"`), and a follow-up `pnpm install --frozen-lockfile` is clean (lockfile committed with the new workspace packages).
- [ ] `pnpm exec turbo run build` is green on the whole tree; `pnpm exec turbo run build typecheck test --filter "./packages/*"` runs 7 packages each with zero failures, and Turbo schedules `@hobo/core` before its dependents (visible in task ordering).
- [ ] `pnpm run architecture:guard` passes, printing the boundary OK line (`Package boundaries OK: 7 package(s), ...`) followed by `Architecture guardrails OK: ...`.
- [ ] `pnpm run test:file test/package-boundaries.test.ts` passes, including the seeded-fixture assertions: core→provider import produces `core must not import HoBo packages`, adapter→adapter produces `adapters must not import each other`, unknown `@hobo/*` fails closed, cycle detection fires. Behavioral assertion: a seeded `packages/core → @hobo/provider-aws` fixture makes the boundary CLI exit non-zero.
- [ ] `pnpm exec turbo run test --filter ./src/draft/technical-proofs/hobo-monorepo-skeleton-contract` still passes (promotion does not break the source proof).
- [ ] `pnpm run test:root` passes (root `test/` suite including the extended `relevant-check-policy` cases).
- [ ] `pnpm run standards:check -- --base=origin/main` passes (new script is `.mts`, no new `.js`/`.mjs`/`.cjs` files anywhere).
- [ ] `pnpm agent:check -- --staged` passes end-to-end before commit (routes install-check, case-check, architecture:guard:staged, test:root, standards, docs lanes).
- [ ] Guardrail evidence check: temporarily `touch packages/core/src/probe.ts`, stage it, and confirm `pnpm run architecture:guard:staged` treats `packages/core` as an implementation package (passes because evidence exists); revert the probe. 
- [ ] Known pre-existing failures on `main` are not made worse and must not be "fixed" here: 2/477 failing tests in `closure-builder-v1-finalization-contract` and 4 `docs/design/proofs/*/README.md` OKF frontmatter failures are documented pre-existing issues (see `AGENTS.md` §Cursor Cloud). Do not chase them.

## Guardrails

- PACT contracts at every service boundary — each new package ships `data-models/pacts/<dir>-boundary.pact.json` with real `consumer`/`provider`/`interactions` fields (the guard validates the shape).
- Protobuf + CUE for all records — every record/message shape introduced here (`PackageBoundaryDeclaration`, `WorkspaceBoundaryDeclaration`, `ImportEdge`, `BoundaryViolation`) is defined in `.proto` first with a same-named CUE definition in the owning package's local `data-models/` folder; no repo-wide catalog.
- Parse, don't validate — the boundary script parses raw `package.json`/import-specifier input once into typed `ImportEdge`/`BoundaryViolation` values; rule functions accept only the parsed types, never raw strings-plus-boolean-checks.
- CQRS/event-sourced state — no runtime state in this slice; the stub `architecture.md` files name the command/event/actor/event-store/projection/snapshot/read-store expectations so later slices inherit them. Actors emit events; nothing mutates read models directly.
- TypeScript only — all new source is `.ts`/`.mts` (`scripts/check-package-boundaries.mts`, `test/package-boundaries.test.ts`); no new `.js`/`.mjs`/`.cjs`; the only permitted edit to a legacy `.mjs` file is the `implementationPackageRoot` extension in the existing `scripts/check-architecture-guardrails.mjs`.
- Production code does NOT live under `src/draft/` — the `packages/` tree is created at the repo root; the draft proofs are left in place untouched except for their README promotion notes.
- Never edit generated files by hand (`pnpm-lock.yaml` changes only via `pnpm install`; `dist/` is never committed — it is a Turbo output).

## Definition of done

- PR merged to `main` with green CI (`.github/workflows/hobo-ci.yml` runs `pnpm agent:check -- --base=origin/<base>`, which now includes the extended architecture:guard for `packages/` changes).
- Docs freshness satisfied in the same PR: `README.md` "Current state", `CLAUDE.md` implementation-status sentence, and the two proof READMEs (`src/draft/technical-proofs/hobo-monorepo-skeleton-contract/README.md`, `src/draft/epic-proofs/foundations-build-conformance-harness/README.md`) updated with the promotion note; `docs/design/architecture.md` needs no change unless the landed tree deviates from its §"Monorepo & package architecture" — if it deviates, update the doc and say why in the PR.
- Depends on: **none** — this is the first slice of Build S0; S0-02 (core contract surface), S0-03 (WIT toolchain), S0-04 (hello-bindle componentize), and S0-05 (CI fabric & artifact trust) all build on this tree and guard.

---

### S0-02 — @hobo/core: port interfaces, EventEnvelope, Capability Manifest schema, DI container (packages/core/)

> **Path corrections vs the architect brief (verified against the repo on branch `claude/charming-volta-lzlf0m`):**
> 1. `src/draft/epic-proofs/foundations-build-conformance-harness/contracts/` exists, but it holds only the Pact fixtures (`pacts/core-contract-boundary.pact.json`) and a consumer test. The actual HOBO-2 source being promoted is the technical proof **`src/draft/technical-proofs/hobo-core-contract/`** (its README opens: "HOBO-2 pins the shared contract surface that other packages compile against").
> 2. Draft proofs keep their protobuf/CUE evidence under an `architecture/` folder, not `data-models/`. The brief's target `packages/core/data-models/` is nevertheless correct for the production package — AGENTS.md mandates "each project/package that defines a CUE-constrained type owns its own local `data-models/` folder". Do not go looking for a `data-models/` folder in the drafts.
> 3. `packages/` does not exist yet, and `pnpm-workspace.yaml` currently lists only `src/draft/*` globs. Registration of `packages/*` is S0-01's deliverable; see Steps for the fallback if it is missing.
> 4. The architecture guard (`scripts/check-architecture-guardrails.mjs`) currently only derives package roots from `src/draft/**`; extending root detection to `packages/**` is toolchain (S0-01) scope. Ship the evidence layout described below regardless, so the package passes the guard the moment `packages/**` is tracked.

## Why

Build S0 ("Toolchain & Contracts Bootstrap") exists to make the contracts every later slice compiles against real: a pnpm/Turborepo workspace, a protobuf+CUE codegen toolchain, and the `@hobo/core` contract package. This issue delivers the middle of that stack — `packages/core/` with the port-interface surface, `EventEnvelope`, the Capability Manifest schema, and the DI container — promoted from the HOBO-2 draft proof into production code. The design's layering rule makes this the keystone: "Packages are layered; dependencies point **inward only** (`apps → adapters → sdk/runtime → core`). `@hobo/core` depends on nothing HoBo." Nothing in S1+ (runtime, providers, IaC, CLI) can start until this package's types exist and are generated from protobuf. The S0 stage gate is: core contracts published in the workspace, `cue vet` green, and the round-trip `EventEnvelope` fixture test green in CI.

## Context & references

- `docs/design/architecture.md` — §"Monorepo & package architecture" (the `packages/core` row: "`@hobo/core` — types, port interfaces, Capability Manifest schema, event envelope, DI/container"), §"Layering & dependency rule", §"Conventions", and the component table (Registry "Catalog providers + their Capability Manifest (capabilities, auth, cost)"; Identity "broker provider tokens via Capability Manifest").
- `docs/design/data-plane.md` — §"The event envelope" (Plan 11): the canonical `EventEnvelope<T>` interface and its ordering/concurrency/idempotency semantics. This is the single source shape this issue turns into protobuf.
- `docs/design/event-families.md` — "the canonical event-family inventory for design docs. Add a family here before using a new backticked event name elsewhere." Families like `deployment.*`, `resource.*`, `identity.*`, `token.*` constrain what `EventEnvelope.type` values look like.
- `docs/design/adr/02-identity-security.md#adr-0046` — "Boundary standards: CloudEvents, OCSF & OTLP" (governs the envelope's boundary mappings; see quote below).
- `docs/design/adr/01-architecture-core.md#adr-0026` — scope nesting `Bindle ⊂ Camp ⊂ Yard ⊂ Junction` (context only; no code impact here).
- Draft proof being promoted (HOBO-2): `src/draft/technical-proofs/hobo-core-contract/` — `src/core-contract.ts` (reference implementation of every constructor/mapping below), `src/core-contract.d.ts` (the exact public type surface), `schema/capability-manifest-bundle.v1.schema.json`, `architecture/hobo_core_contract.{proto,cue}`, `test/core-contract.test.ts`.
- Draft proof context (epic rollup): `src/draft/epic-proofs/foundations-build-conformance-harness/` — `contracts/pacts/core-contract-boundary.pact.json` (the PACT to promote), `contracts/pact-inventory.md` (row "Core contract surface", consumer `FoundationsReferenceApp`, provider `CoreContractBoundary`), `poc-rollup-ledger.md` (HOBO-2 row, status `verified` / `implemented_in_reference_impl`), `scope-review.md`.
- `AGENTS.md` — §"HoBo implementation architecture rules", §"Technical standards for code and contracts", §"JavaScript-family implementation file policy", §"Testing policy".

**Key design decisions you must honor (spelled out, no link-following needed).** (1) The canonical event envelope is one shape across control plane and data plane, quoted verbatim from `data-plane.md` Plan 11:

```ts
export interface EventEnvelope<T = unknown> {
  id: string;            // globally unique (ULID — sortable by time)
  type: string;          // "deployment.Provisioned", "run.StepCompleted", ...
  v: number;             // schema version of `type` (for upcasting)
  streamId: string;      // aggregate/run/actor key, e.g. "deployment:01H..."
  seq: number;           // per-stream monotonic sequence (optimistic concurrency)
  ts: string;            // ISO8601, set by the Camp's runtime Clock (deterministic on replay)
  actor: PrincipalRef;   // who/what caused it (user, agent SVID, system)
  tenant: string;        // isolation boundary (Plan 12)
  project?: string;      // rollup/ownership dimension, NOT a containment scope (ADR-0077)
  causationId?: string;  // the command/event that directly caused this
  correlationId?: string;// the saga / deploy / run this belongs to
  data: T;               // typed payload
  lane?: string;         // sandbox-lane id; absent = baseline — dispatch filters deny-by-default (ADR-0076)
  meta?: Record<string, unknown>; // tracing (traceparent), idempotency keys
}
```

with semantics: "Ordering: total order within a stream by `seq` … Concurrency: appends are conditional on expected `seq` (optimistic locking) … Idempotency: producers attach an idempotency key in `meta`". (2) ADR-0046: "Internal envelope stays native; export is CloudEvents-compatible … a deterministic mapping (`type`→`type`, `id`→`id`, `streamId`→`source`+`subject`, `ts`→`time`, `data`→`data`, with HoBo-specific fields as CloudEvents extensions) … Conformance asserts a HoBo→CloudEvents→HoBo round-trip preserves `seq`/`causationId`." OCSF is the audit-export mapping, OTLP the telemetry mapping — "all three are boundary mappings behind exporters, not model changes." (3) Event naming: "`aggregate.PastTenseFact`. Commands (imperative) are not stored; only the facts they produce are." Core validates the *shape* of `type`, never hardcodes the family catalog (that stays in `event-families.md`). (4) The Capability Manifest is a signed four-file bundle — `index.json` (schemaVersion `hobo.core/v1`, issuer, manifestDigest, signature, files), `capabilities.json` (ports/regions/equivalenceClasses), `auth.json` (issuer must equal index issuer; flows ordered `oidc-federation` > `oauth2-xaa` > `oauth2-obo` > `device-code` > `api-key`; least-privilege scope model; tokenLifetimeSec ≤ 86400), `cost.json` (ISO-4217 currency, positive unit prices) — exactly as pinned by the HOBO-2 proof and its JSON Schema. (5) `@hobo/core` must contain zero provider-specific symbols; the proof ships a public-declaration guard that rejects `Aws|Azure|Gcp|Cloudflare|…` and credential field names (`accessKeyId`, `secretAccessKey`, `subscriptionId`, `serviceAccountJson`) in the public surface — keep it. (6) AGENTS.md: protobuf-first ("Generated or handwritten runtime types must derive from those protobuf definitions instead of inventing parallel interfaces"), CUE constraints co-located in the package's own `data-models/`, parse-don't-validate ("Introduce derived parsed types whose constructors apply protobuf and CUE constraints so invalid values are unrepresentable beyond the boundary"), PACT at every boundary.

## Scope

### In

Deliver `packages/core/` (npm name `@hobo/core`, `"private": true` until the publishing slice) containing:

1. **Protobuf sources (the single source of truth)** — `packages/core/data-models/`:
   - `event_envelope.proto` — package `hobo.core.v1`; `enum PrincipalKind` (UNSPECIFIED/USER/AGENT/SERVICE/SYSTEM), `message PrincipalRef` (kind, id, optional delegated_by), `message EventEnvelope` (id, type, v, stream_id, seq, ts, actor, tenant, optional project/causation_id/correlation_id/lane, `google.protobuf.Struct data`, `google.protobuf.Struct meta`).
   - `capability_manifest.proto` — `enum PortKind` (RUNTIME/PROVIDER/PORT), `enum InterfaceStability` (STABLE/PREVIEW/EXPERIMENTAL), `enum AuthFlowType` (OIDC_FEDERATION/OAUTH2_XAA/OAUTH2_OBO/DEVICE_CODE/API_KEY), `message PortDescriptor` (kind, name, interface, stability), `message ManifestSignature`, `message ManifestIndex`, `message CapabilityPort`, `message CapabilitySet`, `message AuthFlow`, `message AuthDoc`, `message UnitPrice`, `message CostDoc`, `message CapabilityManifestBundle` (index, capabilities, auth, cost). Field shapes must match `src/draft/technical-proofs/hobo-core-contract/schema/capability-manifest-bundle.v1.schema.json`.
2. **CUE constraints** — `packages/core/data-models/event_envelope.cue` and `capability_manifest.cue`: one `#TypeName` definition per protobuf message/enum above, with the invariants the proof enforces (non-empty strings; `seq`/`v` ≥ 0; `manifestDigest`/`signature.digest` matching `^sha256:[a-f0-9]{64}$`; issuers as https URLs; `index.files` ⊇ {`capabilities.json`,`auth.json`,`cost.json`}; `auth.issuer == index.issuer` expressed at bundle level; `tokenLifetimeSec: >0 & <=86400`; `stability: "stable" | "preview" | "experimental"`; `type` matching `^[a-z][a-zA-Z0-9]*\.[A-Za-z][A-Za-z0-9]*$`). Note the architecture guard greps the package for a CUE definition per proto type name — name the CUE defs exactly after the proto messages/enums.
3. **CUE fixtures** — `packages/core/data-models/fixtures/event-envelope.fixture.json` (a valid envelope, e.g. type `deployment.Planned`) and `capability-manifest.fixture.json` (port the `providerManifest()` fixture from the proof test), so `cue vet` has concrete data.
4. **PACT contract** — `packages/core/data-models/pacts/core-contract-boundary.pact.json`: promote (copy, keep the draft in place) `src/draft/epic-proofs/foundations-build-conformance-harness/contracts/pacts/core-contract-boundary.pact.json` (consumer `FoundationsReferenceApp`, provider `CoreContractBoundary`, response body `schemaVersion: "hobo.core/v1"`, `eventMappings.cloudEventSpecversion: "1.0"`, `publicSurface.ok: true`), plus a consumer test in `packages/core/test/` that loads it and asserts the package satisfies those interactions.
5. **Generated TypeScript** — `packages/core/src/generated/` produced by the S0-03 codegen toolchain from the `.proto` files. Never hand-edited; committed with a "generated" header.
6. **Public API (strict TypeScript, `packages/core/src/index.ts`)** — port `src/draft/technical-proofs/hobo-core-contract/src/core-contract.ts` + `.d.ts` to fully typed code whose types derive from `src/generated/`:
   - Types: `PrincipalKind`, `PrincipalRef`, `PortKind`, `InterfaceStability`, `PortDescriptor`, `RuntimePort`, `ProviderPort`, `EventEnvelope<T>`, `CapabilityManifestBundle`, `Container`.
   - Constants: `CORE_SCHEMA_VERSION = "hobo.core/v1"`, `CAPABILITY_MANIFEST_SCHEMA_ID = "https://hobo.dev/schemas/core/capability-manifest-bundle.v1.json"`, `CORE_API_SNAPSHOT` (exports list: `CapabilityManifestBundle`, `Container`, `EventEnvelope`, `PortDescriptor`, `ProviderPort`, `RuntimePort`).
   - Parse-don't-validate constructors (each takes `unknown`, throws on invalid, returns a deep-frozen refined type): `parseEventEnvelope(input: unknown): EventEnvelope`, `createEventEnvelope(input: unknown): EventEnvelope` (defaults `v` to 1, accepts `time` alias for `ts`), `parseCapabilityManifestBundle(input: unknown, options?: { trustedIssuer?: string; trustedOidcDiscoveryHost?: string }): CapabilityManifestBundle`, `createPortDescriptor(input: unknown): PortDescriptor` (interface must be a WIT-style ref, e.g. `hobo:runtime/event-store@1.0.0`).
   - DI container: `createContainer(): Container` with `register<T>(descriptor, impl)` / `resolve<T>(descriptor)`, keyed `kind:interface:name`, throwing on duplicate registration and on unregistered resolve.
   - Boundary mappings (ADR-0046): `toCloudEvent(envelope)`, `fromCloudEvent(input)` (HoBo fields ride as `hobov`/`hoboseq`/`hoboactor`/`hobostreamid`/`hobotenant`/`hoboproject`/`hobocausationid`/`hobocorrelationid`/`hobolane`/`hobometa` extensions; `source` = `hobo://<tenant>/<streamId>`), `toOcsfAuditEvent(envelope)` (`identity.*`/`token.*`/`session.*` → Authentication, `policy.*` → Authorization, else Application Activity; redacts `token|secret|svid|jwt|password|value`-named fields), `toOtlpSpan(envelope)` (traceparent from `meta`, else deterministic sha256-derived ids).
   - Guards: `assertCoreApiSnapshot(snapshot)` (throws on public-API drift) and `validatePublicTypeSurface(declarationText): { ok: boolean; errors: string[] }` (provider-symbol + credential-field leak detection; every `CORE_API_SNAPSHOT` export present).
7. **Package plumbing** — `packages/core/package.json` (name `@hobo/core`, `"type": "module"`, scripts `test` = `node --import tsx --test test/*.test.ts` and `typecheck` = `tsc --noEmit`), `packages/core/tsconfig.json` extending the root strict config, `packages/core/README.md`.
8. **Architecture-guard evidence** — `packages/core/ADR.md` mirroring `src/draft/technical-proofs/hobo-core-contract/ADR.md`: names the parse-don't-validate derived types and the command/event/actor/event-store/projection/snapshot/read-store vocabulary (the guard greps for those words plus "parse, don't validate" + "derived types").
9. **Tests** — `packages/core/test/`: `event-envelope-roundtrip.test.ts` (the CI gate: envelope → `toCloudEvent` → `fromCloudEvent` deep-equals the original, explicitly asserting `seq` and `causationId` survive), `capability-manifest.test.ts` (accept the fixture; reject issuer mismatch, missing required file, extra properties, out-of-range `tokenLifetimeSec`), `container.test.ts` (register/resolve, duplicate rejection, unknown-port rejection), `public-surface.test.ts` (snapshot guard + provider-leak guard over the package's emitted/hand-checked declaration text), `pact-boundary.test.ts` (loads the promoted pact file, asserts consumer expectations hold). Port assertions from `src/draft/technical-proofs/hobo-core-contract/test/core-contract.test.ts` rather than inventing new ones.

### Out

- `@hobo/wit` / WIT interfaces / `hobo:sdk` bindings — a separate Build S0/S1 slice (WIT toolchain boundary), not S0-02.
- Workspace/toolchain bootstrap: `pnpm-workspace.yaml` `packages/*` registration, root tsconfig/turbo/CI lanes — **S0-01**.
- Protobuf/CUE codegen toolchain itself (buf/protobufjs wiring, `cue` binary availability, root codegen scripts) — **S0-03**. This issue *consumes* that toolchain.
- Runtime behavior behind the ports (event store engines, actor hosts, providers, `@hobo/runtime`, `@hobo/conformance` suites) — later slices; the proof README is explicit: "It does not implement runtime behavior, provider adapters, or the WIT package."
- Deleting or restructuring the draft proofs — they stay under `src/draft/` as evidence; this issue only adds promotion notes.

## Steps

1. Export a clean runner env first: `export NODE_OPTIONS="--max-old-space-size=8192"` (if `NODE_OPTIONS` contains `--import tsx` the runner may reject it), then run `pnpm run setup` at the repo root.
2. Verify dependencies landed: confirm `pnpm-workspace.yaml` contains a `packages/*` glob (S0-01) and the codegen + CUE toolchain works (`cue version` succeeds; a root codegen script from S0-03 exists — expect something like `codegen:proto` in root `package.json` scripts; check S0-03's PR for the exact name). If `packages/*` is missing but S0-01 is Done, add the single line `- "packages/*"` to `pnpm-workspace.yaml` (the only shared-file edit this issue permits). If S0-01 or S0-03 is not Done, stop and mark this issue blocked.
3. Create a branch: `git checkout -b feat/s0-02-hobo-core-contracts` (conventional, scoped commits, e.g. `feat(core): …`).
4. Scaffold `packages/core/` with `package.json`, `tsconfig.json`, `README.md`, and empty `src/`, `test/`, `data-models/`, `data-models/fixtures/`, `data-models/pacts/` folders; run `pnpm install` to link the workspace.
5. Write `packages/core/data-models/event_envelope.proto` and `capability_manifest.proto` per Scope item 1, translating the Plan 11 interface and the proof's JSON Schema field-for-field.
6. Write `packages/core/data-models/event_envelope.cue` and `capability_manifest.cue` per Scope item 2 — one `#Name` per proto message/enum, constraints matching the proof's parser rules.
7. Add the two JSON fixtures under `packages/core/data-models/fixtures/` and make `cue vet` pass against them (commands in Acceptance criteria).
8. Run the S0-03 protobuf codegen into `packages/core/src/generated/`; commit the output unmodified.
9. Implement `packages/core/src/index.ts` (plus internal modules as needed, e.g. `src/envelope.ts`, `src/manifest.ts`, `src/container.ts`, `src/mappings.ts`, `src/surface.ts`) per Scope item 6, porting logic from `src/draft/technical-proofs/hobo-core-contract/src/core-contract.ts` into strict TypeScript whose exported types derive from `src/generated/` (no parallel hand-written duplicates of generated shapes).
10. Copy `src/draft/epic-proofs/foundations-build-conformance-harness/contracts/pacts/core-contract-boundary.pact.json` to `packages/core/data-models/pacts/core-contract-boundary.pact.json`.
11. Write the five test files per Scope item 9, porting assertions from the proof's `test/core-contract.test.ts` and adding the explicit `seq`/`causationId` round-trip assertions from ADR-0046.
12. Write `packages/core/ADR.md` (architecture-guard evidence) and `packages/core/README.md` (what the package is, provenance note pointing at the HOBO-2 proof).
13. Update docs in the same change: add a "Promoted to `packages/core/` (S0-02)" note to `src/draft/technical-proofs/hobo-core-contract/README.md`, and update the HOBO-2 row disposition in `src/draft/epic-proofs/foundations-build-conformance-harness/poc-rollup-ledger.md`. Leave `docs/design/architecture.md` untouched unless you had to deviate from its `packages/core` surface — if you deviated, update it and say why in the PR.
14. Validate in this order: `cue vet` commands → `pnpm --prefix packages/core run typecheck` → `pnpm run test:file packages/core/test/event-envelope-roundtrip.test.ts` → `pnpm --prefix packages/core test` → `pnpm run architecture:guard` → `pnpm run standards:check -- --base=origin/main` → stage everything and `pnpm agent:check -- --staged`.
15. Commit (conventional, scoped), push, open a PR onto the repo's PR flow; before finalizing run `git fetch origin && git rebase origin/main && pnpm agent:check -- --base=origin/main`.

## Acceptance criteria

- [ ] `export NODE_OPTIONS="--max-old-space-size=8192" && pnpm run setup` — completes without error.
- [ ] `cue vet packages/core/data-models/event_envelope.cue packages/core/data-models/fixtures/event-envelope.fixture.json -d '#EventEnvelope'` — exit 0, no output.
- [ ] `cue vet packages/core/data-models/capability_manifest.cue packages/core/data-models/fixtures/capability-manifest.fixture.json -d '#CapabilityManifestBundle'` — exit 0, no output.
- [ ] Re-running the S0-03 codegen then `git diff --exit-code packages/core/src/generated` — exit 0 (generated TS is committed, current, and derived only from the `.proto` sources).
- [ ] `pnpm run test:file packages/core/test/event-envelope-roundtrip.test.ts` — green; the test asserts `fromCloudEvent(toCloudEvent(envelope))` deep-equals the parsed original and that `seq` and `causationId` are preserved (ADR-0046's round-trip conformance clause).
- [ ] `pnpm --prefix packages/core test` — all package tests green, including: `parseEventEnvelope` throws on `seq: -1`, empty `tenant`, and non-ISO `ts`; `parseCapabilityManifestBundle` throws when `auth.issuer !== index.issuer`, when `index.files` omits `cost.json`, and on unexpected extra properties; `createContainer()` throws on duplicate `register` and on `resolve` of an unregistered port; `validatePublicTypeSurface` returns `ok: false` for declaration text containing `AwsS3Client` or `accessKeyId`.
- [ ] `pnpm --prefix packages/core run typecheck` — exit 0 under strict TypeScript.
- [ ] `pnpm run architecture:guard` — prints `Architecture guardrails OK` (PACT + protobuf + CUE + parse-don't-validate + event-architecture evidence all present in the package).
- [ ] `pnpm run standards:check -- --base=origin/main` — exit 0 (all new files are `.ts`/`.mts`/`.proto`/`.cue`/`.json`; zero new `.js`).
- [ ] `pnpm agent:check -- --staged` — exit 0 before each commit; `pnpm agent:check -- --base=origin/main` exit 0 before finalizing the PR.
- [ ] Behavioral: `packages/core/data-models/pacts/core-contract-boundary.pact.json` parses with `consumer`, `provider`, and a non-empty `interactions` array, and `pact-boundary.test.ts` proves the package returns `schemaVersion: "hobo.core/v1"`, CloudEvents `specversion: "1.0"` mapping, and `publicSurface.ok: true` for the pact's interaction.
- [ ] `@hobo/core`'s `package.json` has zero `dependencies` on other `@hobo/*` packages ("`@hobo/core` depends on nothing HoBo").

## Guardrails

- **PACT at every service boundary** — the core-contract boundary ships an executable pact under `packages/core/data-models/pacts/` and a consumer test; do not declare the boundary done without it.
- **Protobuf + CUE for all records** — `EventEnvelope`, `PrincipalRef`, `PortDescriptor`, and the Capability Manifest bundle are defined protobuf-first in `packages/core/data-models/`; every proto message/enum has a matching CUE `#Definition` in the same folder. No repo-wide contracts catalog — the package owns its `data-models/`.
- **Parse, don't validate** — every refined type has a constructor (`parseEventEnvelope`, `parseCapabilityManifestBundle`, `createPortDescriptor`, …) that takes `unknown`, applies the protobuf+CUE constraints, and returns a frozen derived type; core functions accept only those derived types, never raw DTOs plus boolean checks.
- **CQRS/event-sourced state** — this package defines the envelope for events; it must not add any API that mutates read models. Event `type` naming follows `aggregate.PastTenseFact`; new event families belong in `docs/design/event-families.md`, not hardcoded in core.
- **TypeScript only** — no new `.js`/`.mjs`/`.cjs`/`.jsx` files; use `.ts` (or `.mts` for explicit-ESM scripts).
- **Production code does NOT live under `src/draft/`** — the deliverable is `packages/core/`; the drafts are read-only provenance and only receive promotion notes.
- **Never edit generated files by hand** — `packages/core/src/generated/` comes only from the codegen toolchain; `scripts/no-hand-edited-generated-files.mts` and CI will reject manual edits.
- **No provider leakage** — `@hobo/core` exports no provider-specific symbols or credential-shaped fields; keep the `validatePublicTypeSurface` guard wired into the test suite so leaks fail CI.

## Definition of done

- PR merged with green CI (all Acceptance-criteria commands passing in the pipeline, including the round-trip `EventEnvelope` fixture test).
- Docs freshness satisfied in the same PR: promotion note in `src/draft/technical-proofs/hobo-core-contract/README.md`, updated HOBO-2 row in `src/draft/epic-proofs/foundations-build-conformance-harness/poc-rollup-ledger.md`, `packages/core/README.md` + `ADR.md` present, and `docs/design/architecture.md` amended only if the shipped surface deviates from its `packages/core` description.
- Depends on (must be Done first): **S0-01** (workspace/toolchain bootstrap — `packages/*` registration, root TS/turbo/CI lanes) and **S0-03** (protobuf/CUE codegen toolchain — the generator this package's `src/generated/` derives from, plus `cue` availability in CI).

---

### S0-03 — Protobuf+CUE contract toolchain: buf codegen + cue vet lanes wired through Turborepo

> **Path corrections after reading the repo (2026-07-01):**
> 1. The "no-hand-edit guard" already exists: `scripts/no-hand-edited-generated-files.mts`, exposed as `pnpm run generated:guard` and invoked unconditionally by `.githooks/pre-commit`. Its path regex matches `generated/` and `src/gen/` but **not** `_generated/` or `.hobo/generated/`. This issue **extends** that guard; it does not create a new one.
> 2. A root `test:schema` script already exists in `package.json` (it runs `scripts/validate-sdk-contracts.ts` and `scripts/validate-deployment-set-delta.ts`), and a Turborepo `test:schema` task already exists in `turbo.json` (inputs: `**/*.proto`, `**/*.cue`, `contracts/**`, `architecture/**`, `cue.mod/**`). This issue **extends** both (append the new buf/CUE lanes; add `data-models/**` and `src/_generated/**` to the turbo inputs); it does not create them.
> 3. `packages/core/` does not exist on `main` at authoring time — it is delivered by **S0-01**. If S0-01 landed `@hobo/core` at a different path, substitute that path everywhere below and say so in the PR description.

## Why

Stage S0 ("Toolchain & Contracts Bootstrap") turns HoBo's design-phase repo into a production monorepo whose contract discipline is enforced by machines, not by review vigilance. This slice stands up the shared protobuf+CUE contract toolchain — buf-based codegen into checked-in `_generated/` trees, `cue vet` over each package's local `data-models/`, and a `test:schema` lane wired through Turborepo — seeded with `@hobo/core`'s first real contract (the `EventEnvelope`). It is the substrate every later contract-bearing slice builds on: without it, "protobuf+CUE for all records" (AGENTS.md) is an honor-system rule. The stage gate this slice must satisfy: **hand-editing a generated file fails the guard, and a breaking proto change fails buf breaking-change detection in CI.**

## Context & references

- **Design docs (read before implementing):**
  - `docs/design/technical-standards.md` — canonical protobuf/CUE/parse-don't-validate/PACT standards and the `data-models/` ownership rule.
  - `docs/design/adr/01-architecture-core.md#adr-0037` — SDK codegen surface & policy (checked-in `_generated/`, drift gate).
  - `docs/design/adr/01-architecture-core.md#adr-0087` and `docs/design/package-namespaces.md` — `@hobo/core` is "the shared type substrate for generated bindings and package internals"; "shared schemas and branded IDs" live in `@hobo/core`.
  - `docs/design/architecture.md` — packages table (`packages/core/` = `@hobo/core`: "types, port interfaces, Capability Manifest schema, event envelope, DI/container") and the layering rule ("dependencies point inward only (`apps → adapters → sdk/runtime → core`). `@hobo/core` depends on nothing HoBo.").
  - `docs/design/data-plane.md` — section "The event envelope" (the `EventEnvelope<T>` shape used as this slice's seed contract) and ADR-0051 context ("WIT records as the canonical domain schema (TS + protobuf + Zod generated)").
  - `docs/design/contract-first-testing.md` — the test-lane table (`test:schema` = "Protobuf/CUE/generated-contract compatibility") and targeted routing ("root protobuf/CUE changes run schema checks by default").
  - `AGENTS.md` — sections "Technical standards for code and contracts", "HoBo implementation architecture rules", "JavaScript-family implementation file policy", "Parallel work rule" ("Do not hand-edit generated files.").
- **Draft proofs being promoted (contract semantics only; their code stays in draft):**
  - `src/draft/technical-proofs/sdk-codegen-surface-contract/` (HOBO-88) — proves the checked-in `_generated/` policy: deterministic output, "stale, added, and deleted generated files are reported deterministically", check mode "does not mutate on failure".
  - `src/draft/technical-proofs/hobo-codegen-cli-contract/` (HOBO-152) — proves the `--check` drift protocol: "compares an in-memory regeneration against the working tree, reports path-level drift, and never mutates files".
  - `src/draft/technical-proofs/hobo-monorepo-skeleton-contract/` (HOBO-1) — the workspace skeleton this sits on; promoted by **S0-01**, referenced here only as the layout authority.
- **Relevant ADR ids:** ADR-0037, ADR-0051, ADR-0087 (plus ADR-0003 for why the event envelope is the seed record).
- **Key design decisions you must honor (spelled out):** Data contracts are modeled in protobuf at integration and persistence boundaries — "Protobuf descriptors are the canonical interchange artifact"; CUE carries the invariants protobuf cannot express ("ranges, formats, cross-field relationships, state-transition preconditions … compatibility rules"). Generated artifacts live in a **checked-in** `_generated/` directory because per ADR-0037 that is "reviewable in diffs, gives editors types with no build step, and is offline/air-gap-friendly", and codegen is "a deterministic pure function" of its sources with a `--check` CI gate that "regenerates and fails on drift". Per `docs/design/technical-standards.md`: "Repository-wide data-model catalogs are forbidden. Each project/package that owns a CUE-constrained type must keep its own `data-models/` folder beside the protobuf contract or proof package that owns that type" — so the proto and CUE for `EventEnvelope` go under `packages/core/data-models/`, never a root `contracts/` catalog. Per ADR-0037 point 5, "protobuf is an encoding, not an authoring source" — this slice ships the encoding toolchain only, not the WIT-driven authoring pipeline. All new scripts must be TypeScript (`.mts`, run via `node --import tsx`), per the JavaScript-family file policy.

## Scope

**In (exact deliverables):**

1. **Root buf config** — `buf.yaml` (v2) declaring module `packages/core/data-models/proto` with `lint.use: [STANDARD]` and `breaking.use: [FILE]`; `buf.gen.yaml` (v2) generating with local plugin `protoc-gen-es` (`opt: target=ts`) from input directory `packages/core/data-models/proto` into `packages/core/src/_generated/proto`.
2. **Root devDependencies** (root `package.json`): `@bufbuild/buf`, `@bufbuild/protobuf`, `@bufbuild/protoc-gen-es` — pin the current stable (buf 1.x, protobuf-es 2.x). If pnpm blocks a build script for `@bufbuild/buf`, add it under `allowBuilds` in `pnpm-workspace.yaml`.
3. **Toolchain scripts** (all new, all `.mts`, all under `scripts/contracts/`):
   - `scripts/contracts/ensure-cue.mts` — resolves a pinned CUE binary: use `cue` from PATH if `cue version` matches the pin, else download `https://github.com/cue-lang/cue/releases/download/v${CUE_VERSION}/cue_v${CUE_VERSION}_${os}_${arch}.tar.gz` into `.cache/tools/cue/${CUE_VERSION}/` and use that. Pin `CUE_VERSION` as a single exported constant (use the latest stable from github.com/cue-lang/cue/releases, e.g. `0.13.2`; if that exact version 404s, take the newest stable listed and keep the pin exact). Add `.cache/` to `.gitignore` if not present.
   - `scripts/contracts/codegen.mts` — runs `buf lint`, then `buf generate`. With `--check`: snapshot `packages/core/src/_generated/` to the temp dir, run `buf generate`, diff against the snapshot; on drift **restore the snapshot**, print the drifted paths, exit 1 (the HOBO-152 protocol: check never mutates the tree it reports on).
   - `scripts/contracts/vet-cue.mts` — for every tracked `*/data-models/*.cue` file (discover with `git ls-files '*data-models/*.cue'`): derive the CUE definition name from the filename (`event_envelope.cue` → `#EventEnvelope`: strip `.cue`, split on `_`, PascalCase-join), then run `cue vet -d '#Name' <file> <dir>/fixtures/<base>.valid.json` (must exit 0) and `cue vet -d '#Name' <file> <dir>/fixtures/<base>.invalid.json` (must exit non-zero — the script fails if the invalid fixture vets clean or is missing). Accepts `--package <dir>` to scope to one package.
   - `scripts/contracts/check-breaking.mts` — runs `buf breaking --against ".git#ref=${BASE}"` where `BASE` is `--against`'s value, else `HOBO_CHECK_BASE`, else `origin/main`. **Bootstrap skip:** if `git cat-file -e ${BASE}:buf.yaml` fails (no buf config at the base ref yet), print `skipping buf breaking: no buf.yaml at ${BASE}` and exit 0.
4. **Root script wiring** (root `package.json`): new scripts `contracts:generate` (`node --import tsx scripts/contracts/codegen.mts`), `contracts:check` (`… codegen.mts --check`), `contracts:vet` (`… vet-cue.mts`), `contracts:breaking` (`… check-breaking.mts`); **append** `&& pnpm run contracts:check && pnpm run contracts:vet && pnpm run contracts:breaking` to the existing `test:schema` script (keep the two existing validators first). This gives CI enforcement for free: `scripts/relevant-check-policy.ts` already routes any root `.proto`/`.cue` change to `pnpm run test:schema`, and `.github/workflows/hobo-ci.yml` runs `pnpm agent:check -- --base=origin/<base>` on every PR.
5. **Turborepo lane** (`turbo.json`): extend the existing `test:schema` task's `inputs` with `"data-models/**"` and `"src/_generated/**"`; add `"buf.yaml"` and `"buf.gen.yaml"` to `globalDependencies`.
6. **No-hand-edit guard** (`scripts/no-hand-edited-generated-files.mts`): extend the two existing regexes —
   - line 6 `const generated = files.filter((file) => /(^|\/)(generated|src\/gen)(\/|$)/.test(file));` → also match `_generated` and `.hobo/generated`: `/(^|\/)(_generated|generated|src\/gen|\.hobo\/generated)(\/|$)/`
   - line 8 `const schema = files.some((file) => /\.(proto|cue)$/.test(file));` → also treat generator/config changes as legitimate sources: `/\.(proto|cue)$/.test(file) || /^(buf\.yaml|buf\.gen\.yaml)$/.test(file) || /^scripts\/contracts\//.test(file)`
7. **Seed contract in `packages/core/`** (extend what S0-01 created; do not overwrite):
   - `packages/core/data-models/proto/hobo/core/v1/event_envelope.proto` — `syntax = "proto3"; package hobo.core.v1;` with `message EventEnvelope` mirroring `docs/design/data-plane.md#the-event-envelope`: `string id = 1; string type = 2; uint32 v = 3; string stream_id = 4; uint64 seq = 5; string ts = 6; string actor = 7; string tenant = 8; optional string project = 9; optional string causation_id = 10; optional string correlation_id = 11; google.protobuf.Struct data = 12; optional string lane = 13; map<string, string> meta = 14;` (import `google/protobuf/struct.proto`; `actor` stays a string here — the `PrincipalRef` message belongs to the identity slice, add a comment saying so).
   - `packages/core/data-models/event_envelope.cue` — `package core` defining `#EventEnvelope` with the invariants protobuf cannot express, using the **proto snake_case field names**: `id: string & =~"^[0-9A-HJKMNP-TV-Z]{26}$"` (ULID), `type: string & =~"^[a-z][a-zA-Z0-9]*\\.[A-Z][a-zA-Z0-9]*$"` (`aggregate.PastTenseFact`), `v: int & >=1`, `stream_id: string & !=""`, `seq: int & >=0`, `ts: string & =~"^\\d{4}-\\d{2}-\\d{2}T"`, `actor: string & !=""`, `tenant: string & !=""`, optional `project?/causation_id?/correlation_id?/lane?: string`, `data: _`, `meta?: {[string]: string}`. Add a header comment naming the owning proto file.
   - `packages/core/data-models/fixtures/event_envelope.valid.json` (all required fields, e.g. `"id": "01HZXW8B2M3N4P5Q6R7S8T9V0A"`, `"type": "deployment.Provisioned"`, `"v": 1`, `"stream_id": "deployment:01HZXW8B2M3N4P5Q6R7S8T9V0A"`, `"seq": 0`, `"ts": "2026-07-01T00:00:00Z"`, `"actor": "user:demo"`, `"tenant": "tenant-a"`, `"data": {}`) and `event_envelope.invalid.json` (violate at least two constraints, e.g. `"id": "not-a-ulid"`, `"v": 0`).
   - `packages/core/src/_generated/proto/hobo/core/v1/event_envelope_pb.ts` — **produced by `pnpm run contracts:generate`, committed, never hand-edited.**
   - `packages/core/src/contracts/event-envelope.ts` — the parse-don't-validate seed. Public API: `export type ParsedEventEnvelope = EventEnvelope & { readonly __parsed: "EventEnvelope" }`, `export class EventEnvelopeParseError extends Error`, `export function parseEventEnvelope(input: unknown): ParsedEventEnvelope` — decode via the generated schema (`fromJson(EventEnvelopeSchema, …)` from `@bufbuild/protobuf`), re-assert the CUE invariants listed above in TS, throw `EventEnvelopeParseError` on any failure. Re-export from `packages/core/src/index.ts`. Add `@bufbuild/protobuf` to `packages/core/package.json` `dependencies`.
   - `packages/core/package.json`: add script `"test:schema": "node --import tsx ../../scripts/contracts/codegen.mts --check && node --import tsx ../../scripts/contracts/vet-cue.mts --package ."` so the Turborepo lane has a package target.
8. **Docs (required by `docs:freshness`):** add a "Contract toolchain (buf + CUE)" subsection to `docs/design/contract-first-testing.md` documenting the four `contracts:*` commands, the `data-models/` + `_generated/` conventions, and the guard; create/extend `packages/core/README.md` describing contract source → generated views → gates (this satisfies the `technical-standards.md` agent-checklist item 6).

**Out (explicitly excluded — do not touch):**

- The real SDK codegen **engine** (WIT records + Zod + `.allow()` + bindle graph → typed bindings, ADR-0037 points 1/5) — owned by the production promotion of HOBO-88 in a later stage; this slice only ships the protobuf→TS encoding lane.
- The `hobo codegen` / `hobo codegen --check` **CLI verb** — owned by the production promotion of HOBO-152 (CLI stage); here the check protocol lives in `scripts/contracts/codegen.mts` only.
- PACT consumer/provider lanes (`test:contract:*`) — they already exist repo-wide; a PACT contract for `@hobo/core` boundaries lands with the first slice that gives core a service boundary, not here (core has no runtime boundary yet — it "depends on nothing HoBo").
- WIT toolchain pins and `@hobo/wit` (ADR-0085 / HOBO-3 successor) — separate S0/S1 slice.
- Extending `scripts/check-architecture-guardrails.mjs` to scan `packages/**` (today it only treats `src/draft/**` as implementation packages) — leave that script unchanged; it is owned by the monorepo-skeleton line (S0-01 and its hardening follow-up).
- Monorepo/workspace creation itself (`pnpm-workspace.yaml` `packages/*` glob, `packages/core` skeleton) — **S0-01**. Only verify it; if the glob is missing, stop and report S0-03 blocked on S0-01 rather than recreating it.

## Steps

1. Run `export NODE_OPTIONS="--max-old-space-size=8192"` first (if `NODE_OPTIONS` contains `--import tsx` the runner may reject it), then `pnpm run setup` (repo setup: corepack + frozen-lockfile install) and `pnpm run prepare-hooks`.
2. Verify S0-01 landed: `packages/core/package.json` exists and `pnpm-workspace.yaml` contains a `packages/*` glob. If not, stop — this issue is blocked on S0-01.
3. Create branch: `git checkout -b feat/s0-03-contract-toolchain`.
4. Add devDependencies to the root `package.json` (`pnpm add -D -w @bufbuild/buf @bufbuild/protobuf @bufbuild/protoc-gen-es`); if pnpm reports a blocked build script for `@bufbuild/buf`, add it to `allowBuilds` in `pnpm-workspace.yaml` and re-run install.
5. Write `buf.yaml` and `buf.gen.yaml` at the repo root exactly as specified in Scope item 1.
6. Write `packages/core/data-models/proto/hobo/core/v1/event_envelope.proto`, `packages/core/data-models/event_envelope.cue`, and both fixtures per Scope item 7.
7. Write `scripts/contracts/ensure-cue.mts`, `scripts/contracts/codegen.mts`, `scripts/contracts/vet-cue.mts`, `scripts/contracts/check-breaking.mts` per Scope item 3 (TypeScript only; invoke via `node --import tsx …`; no new `.js`/`.mjs`).
8. Add the four `contracts:*` scripts to the root `package.json` and append them to the existing `test:schema` script (Scope item 4) — do not remove the two existing `test:schema` validators.
9. Run `pnpm exec buf lint` and fix any naming violations in the proto, then run `pnpm run contracts:generate` and commit the emitted `packages/core/src/_generated/proto/hobo/core/v1/event_envelope_pb.ts`.
10. Write `packages/core/src/contracts/event-envelope.ts` (+ `index.ts` re-export, `@bufbuild/protobuf` dep, package `test:schema` script) per Scope item 7.
11. Edit `scripts/no-hand-edited-generated-files.mts` (the two regex lines quoted in Scope item 6).
12. Edit `turbo.json`: extend `test:schema` inputs with `data-models/**` and `src/_generated/**`; add `buf.yaml`/`buf.gen.yaml` to `globalDependencies`.
13. Update `docs/design/contract-first-testing.md` and `packages/core/README.md` per Scope item 8.
14. Build/test in this order: `pnpm run contracts:generate` (idempotent — second run produces no diff) → `pnpm run contracts:check` → `pnpm run contracts:vet` → `pnpm run contracts:breaking` (expect the bootstrap skip message) → `pnpm run test:schema` → `pnpm exec turbo run test:schema --filter @hobo/core`.
15. Run the adversarial checks from Acceptance criteria (tamper test, guard test, breaking test) and revert their scratch edits.
16. Stage everything, run `pnpm agent:check -- --staged` and `pnpm run standards:check -- --base=origin/main` (required: this change touches scripts, Turbo config, and package config), commit with conventional scoped messages (e.g. `feat(contracts): buf+cue contract toolchain with test:schema lane`), push, open the PR.

## Acceptance criteria

- [ ] `pnpm run setup` completes; `pnpm exec buf --version` and the pinned `cue` (via `node --import tsx scripts/contracts/ensure-cue.mts`) both resolve.
- [ ] `pnpm exec buf lint` exits 0.
- [ ] `pnpm run contracts:generate` twice in a row → `git status --porcelain packages/core/src/_generated` is empty after the second run (deterministic, per ADR-0037).
- [ ] `pnpm run contracts:check` exits 0 on a clean tree. Then append `// tamper` to `packages/core/src/_generated/proto/hobo/core/v1/event_envelope_pb.ts` → `pnpm run contracts:check` exits non-zero, names the drifted path, and leaves the tampered file byte-identical (check never mutates); restore with `git checkout -- packages/core/src/_generated`.
- [ ] **Guard gate:** stage only a hand edit to the generated file (`git add packages/core/src/_generated/...`) with no `.proto`/`.cue`/generator change staged → `pnpm run generated:guard` exits 1 with the "Generated outputs changed without matching protobuf/CUE source" message; staging `event_envelope.proto` alongside it makes the guard pass. Unstage/revert afterwards.
- [ ] `pnpm run contracts:vet` exits 0; deleting `event_envelope.invalid.json` or making it valid causes `contracts:vet` to exit non-zero (revert after checking).
- [ ] **Breaking gate:** commit the branch baseline, then change `string stream_id = 4;` to `string stream_id = 15;` → `pnpm run contracts:breaking -- --against .git#ref=HEAD` exits non-zero with a buf `FILE`-category breaking error; revert the edit. Against `origin/main` (no `buf.yaml` there yet) the script prints the bootstrap-skip message and exits 0 — after this PR merges, the same breaking edit on any later PR fails `pnpm run test:schema` in the CI PR gate (`.github/workflows/hobo-ci.yml` → `pnpm agent:check` → schema routing).
- [ ] `pnpm run test:schema` exits 0 and its output shows the two pre-existing validators **plus** contracts:check, contracts:vet, contracts:breaking.
- [ ] `pnpm exec turbo run test:schema --filter @hobo/core` exits 0.
- [ ] `pnpm run architecture:guard` exits 0 (no regressions in draft-proof scanning).
- [ ] `pnpm agent:check -- --staged` exits 0 with all changes staged; `pnpm run standards:check -- --base=origin/main` exits 0 (no new `.js`/`.mjs`, TypeScript pins intact).
- [ ] `pnpm run docs:freshness` exits 0 (design doc + package README updated in the same change).
- [ ] Behavioral: `parseEventEnvelope` on the valid fixture returns a `ParsedEventEnvelope`; on the invalid fixture it throws `EventEnvelopeParseError` — assert both in a small `packages/core/test/` unit test if a test harness exists in the package, otherwise via a `node --import tsx` smoke invocation recorded in the PR description.

## Guardrails

- PACT contracts at every service boundary — `@hobo/core` has no service boundary in this slice; do not invent one, and do not add PACT fixtures here (see Scope out).
- Protobuf+CUE for **all** records: any new record shape must be a `.proto` message in the owning package's `data-models/` with matching CUE constraints beside it. No root-level `contracts/data-models` catalog — that pattern is explicitly forbidden by `docs/design/technical-standards.md`.
- Parse-don't-validate: downstream code takes `ParsedEventEnvelope`, never a raw DTO plus ad-hoc boolean checks; the only parser boundary is `parseEventEnvelope`.
- CQRS/event-sourced state: this slice ships contracts and tooling only — it must not add any code that mutates read models or bypasses the event-envelope shape defined in `docs/design/data-plane.md`.
- TypeScript only: every new script is `.mts`/`.ts` run via `node --import tsx`; no new `.js`, `.jsx`, `.mjs`, or `.cjs` files anywhere.
- Production code does **not** live under `src/draft/` — everything in this slice goes under `packages/core/`, `scripts/contracts/`, and root config. Do not modify the three referenced draft proofs.
- Never edit generated files by hand: `packages/core/src/_generated/**` changes only via `pnpm run contracts:generate`, and the extended guard + `contracts:check` are the enforcement, not a convention.

## Definition of done

- PR merged to `main` with green CI (the `pr-gate` job in `.github/workflows/hobo-ci.yml` passing `pnpm agent:check -- --base=origin/main`).
- All Acceptance-criteria boxes checked, including the tamper, guard, and breaking demonstrations (record command output in the PR description).
- Docs fresh in the same PR: `docs/design/contract-first-testing.md` documents the contract toolchain commands and conventions; `packages/core/README.md` names the contract source (`data-models/`), generated views (`src/_generated/`), and protecting gates; `pnpm run docs:freshness` green.
- Depends on: **S0-01** (monorepo skeleton with `packages/core` and the `packages/*` workspace glob) must be **Done** and merged before this branch starts.

---

