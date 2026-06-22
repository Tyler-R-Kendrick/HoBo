# Plan 43 — Patchability & extensibility (derivative implementations)

> Part of the [HoBo Design Plan Suite](./README.md). HoBo's promise is **not just portability — it's patchability**: the ability to **fork, extend, and patch the platform itself** (and the code it generates) and **persist** those changes safely. Where [portability](./adr/ADR-0024-portability-conformance-guarantee.md) means *the same artifact runs on N backends*, **patchability** means *you can derive your own HoBo and keep it*. Decision record: [ADR-0057](./adr/ADR-0057-patchability-derivative-implementations.md).

> **Why it's a distinct goal.** Portability protects the *user's app* from lock-in. Patchability protects the *platform itself* from being a black box: every engine is swappable, every seam is an extension point, and every AI/human edit persists as a reviewable, round-trippable, conformance-gated diff. Closed PaaS gives you neither; raw IaC gives you patchability but no portability. HoBo commits to both.

## Three pillars

### 1. Derivative implementations (fork & extend behind the same ports)
Every HoBo component is an **adapter behind a WIT port** — so you can ship your *own* implementation without forking the core:
- **Providers / IaC / build** ([Plan 3](./03-providers-iac.md)), **runtimes** ([ADR-0026](./adr/ADR-0026-scope-model-yard-camp-bindle.md)), **capability providers** ([Plan 20](./20-wasm-wasi-runtime.md)/[Plan 24](./24-wit-interfaces-reference.md)), **`component-host`** ([ADR-0031](./adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)), **projection sinks** ([Plan 39](./39-data-plane-projections.md)).
- **Engines behind ports** — `contract`/`policy`/`training`/operator-agent engines ([Plan 29](./29-contracts-compatibility.md)/[Plan 30](./30-policy-plane.md)/[ADR-0025](./adr/ADR-0025-use-training-directive-and-training-engine.md)/[Plan 40](./40-operator-agents.md)) all have a built-in default + optional external providers; swap any without touching app code.
- **The Yard itself** is a Bindle ([Plan 4](./04-control-plane.md)) — a derivative control plane is a HoBo deployment, not a hostile fork.
- Derivatives are distributed as **signed Resource Packs / plugins** ([Plan 27](./27-drivers-packs-profiles.md)) and **certified by the same `@hobo/conformance` trust boundary** ([Plan 9](./09-verification-open-questions.md)) — a derivative that passes conformance is a first-class citizen, human- or **Forge-generated** ([Plan 33](./33-forge-generation-pipeline.md)).

### 2. Enumerated plugin extension points (the seams)
Patchability is only real if the seams are *named and stable*. The extension points:
| Seam | Port / mechanism | Plan |
|---|---|---|
| Cloud / IaC / build adapters | `CloudProvider`/`IacProvider`/`BuildProvider` | [3](./03-providers-iac.md) |
| Capability providers | any `wasi:*`/`hobo:*` WIT export | [20](./20-wasm-wasi-runtime.md)/[24](./24-wit-interfaces-reference.md) |
| Runtimes / `component-host` | `Runtime` / `component-host` ports | [ADR-0026](./adr/ADR-0026-scope-model-yard-camp-bindle.md)/[ADR-0031](./adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md) |
| Drivers | `terraform`/`template`/`echo`/`container`/`custom-webhook` | [27](./27-drivers-packs-profiles.md) |
| Engines | `contract`/`policy`/`training`/operator engines | [29](./29-contracts-compatibility.md)/[30](./30-policy-plane.md)/[ADR-0025](./adr/ADR-0025-use-training-directive-and-training-engine.md)/[40](./40-operator-agents.md) |
| Resource Definitions / Packs / Profiles | platform-rule layer | [25](./25-resource-definitions-matching.md)/[27](./27-drivers-packs-profiles.md) |
| Agent skills | `@hobo/agent-skills` (operator + external agents) | [1](./01-monorepo.md)/[40](./40-operator-agents.md) |
| Projection sinks | `projection-sink` paradigms | [39](./39-data-plane-projections.md) |
Each seam: a typed contract (WIT/conformance), a registry entry (signed + provenance), and Matching/selection per Camp ([Plan 25](./25-resource-definitions-matching.md)). Adding a seam implementation never requires editing the core.

### 3. Persisted patches (safe, round-trippable mutation)
AI- or human-authored changes to generated code persist via **region-scoped, format-preserving AST mutation with signed provenance** ([ADR-0048](./adr/ADR-0048-persisted-code-mutation-mechanism.md)): generated regions are demarcated, hand-written intent is never clobbered, every patch is a minimal reviewable diff, round-trippable, and gated (`hobo codegen --check`, [ADR-0037](./adr/ADR-0037-sdk-codegen-surface.md); low-risk → auto-commit, prod → PR/Delta for approval). This is what makes "self-healing, persisted code" ([Plan 41](./41-generated-stack.md)) a *durable derivative*, not an ephemeral runtime hack.

## Patchability vs portability (the two guarantees, side by side)
- **Portability ([ADR-0024](./adr/ADR-0024-portability-conformance-guarantee.md)):** the *same* Bindle + `src/` run byte-identical on N clouds; you don't get locked into a backend.
- **Patchability ([ADR-0057](./adr/ADR-0057-patchability-derivative-implementations.md)):** you can *change* HoBo — swap any engine, add any adapter, fork the Yard, and persist AI/human patches — and still ride the same conformance/signing/Matching machinery, so a derivative stays trustworthy and upgradable. **Conformance is the bridge:** it's what makes both a swapped backend *and* a derived implementation safe to trust.

```mermaid
flowchart LR
  CORE["HoBo core (ports + Yard)"]
  CORE -->|swap engine / add adapter| DERIV["derivative impls (signed Packs/plugins)"]
  CORE -->|extension seams| SEAMS["providers · drivers · runtimes · engines · skills · sinks"]
  GEN["AI/human edits"] -->|region-scoped AST + provenance (ADR-0048)| PATCH["persisted patches"]
  DERIV --> CONF["@hobo/conformance + signing (Plan 9/12)"]
  SEAMS --> CONF
  PATCH --> CONF
  CONF --> TRUST["trusted, upgradable derivative"]
```

## Verification
- A custom engine (e.g. a bespoke `policy-engine`) shipped as a signed plugin passes conformance and is selected per Camp via Matching — no core edit; portability of user apps is unaffected.
- A persisted patch to a generated region survives regeneration (round-trip), shows as a minimal diff, and `hobo codegen --check` distinguishes it from drift.
- A derivative Yard (forked control plane) deploys as a Bindle and self-hosts with the same control-plane features ([ADR-0024 §self-host=hosted](./adr/ADR-0024-portability-conformance-guarantee.md)).

## Scope (v1) & YAGNI
- **v1:** name patchability as a guarantee + enumerate the seams (all already exist as ports); the persisted-patch mechanism ([ADR-0048](./adr/ADR-0048-persisted-code-mutation-mechanism.md)); conformance/signing as the trust bridge.
- **Deferred:** an upstream-merge/rebase story for long-lived derivatives (how a fork tracks core upgrades); a public derivative/plugin marketplace beyond Resource Packs.

## Iteration hooks
- How a derivative tracks core upgrades (semver + conformance-pinned + codemod-assisted migration).
- Whether "patchability" needs its own CLI surface (`hobo extend`/`hobo fork`) or rides existing pack/registry commands.
- Provenance/trust for third-party derivatives (signing chain, attestation) beyond [Plan 12](./12-security-multitenancy.md).
