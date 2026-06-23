# Plan 43 — Patchability & extensibility (derivative implementations)

> Part of the [HoBo Design Plan Suite](./README.md). HoBo's promise is **not just portability — it's patchability**: the ability to **fork, extend, and patch the platform itself** (and the code it generates) and **persist** those changes safely. Where [portability](./adr/07-portability-extensibility.md#adr-0024) means *the same artifact runs on N backends*, **patchability** means *you can derive your own HoBo and keep it*. Decision record: [ADR-0057](./adr/07-portability-extensibility.md#adr-0057).

> **Why it's a distinct goal.** Portability protects the *user's app* from lock-in. Patchability protects the *platform itself* from being a black box: every engine is swappable, every seam is an extension point, and every AI/human edit persists as a reviewable, round-trippable, conformance-gated diff. Closed PaaS gives you neither; raw IaC gives you patchability but no portability. HoBo commits to both.

## Three pillars

### 1. Derivative implementations (fork & extend behind the same ports)
Every HoBo component is an **adapter behind a WIT port** — so you can ship your *own* implementation without forking the core:
- **Providers / IaC / build** ([Plan 3](./03-providers-iac.md)), **runtimes** ([ADR-0026](./adr/01-architecture-core.md#adr-0026)), **capability providers** ([Plan 20](./20-wasm-wasi-runtime.md)/[Plan 24](./24-wit-interfaces-reference.md)), **`component-host`** ([ADR-0031](./adr/01-architecture-core.md#adr-0031)), **projection sinks** ([Plan 39](./39-data-plane-projections.md)).
- **Engines behind ports** — `contract`/`policy`/`training`/operator-agent engines ([Plan 29](./29-contracts-compatibility.md)/[Plan 30](./30-policy-plane.md)/[ADR-0025](./adr/06-ai-generation-operators.md#adr-0025)/[Plan 40](./40-operator-agents.md)) all have a built-in default + optional external providers; swap any without touching app code.
- **The Yard itself** is a Bindle ([Plan 4](./04-control-plane.md)) — a derivative control plane is a HoBo deployment, not a hostile fork.
- Derivatives are distributed as **signed Resource Packs / plugins** ([Plan 27](./27-drivers-packs-profiles.md)) and **certified by the same `@hobo/conformance` trust boundary** ([Plan 9](./09-verification-open-questions.md)) — a derivative that passes conformance is a first-class citizen, human- or **Forge-generated** ([Plan 33](./33-forge-generation-pipeline.md)).

### 2. Enumerated plugin extension points (the seams)
Patchability is only real if the seams are *named and stable*. The extension points:
| Seam | Port / mechanism | Plan |
|---|---|---|
| Cloud / IaC / build adapters | `CloudProvider`/`IacProvider`/`BuildProvider` | [3](./03-providers-iac.md) |
| Capability providers | any `wasi:*`/`hobo:*` WIT export | [20](./20-wasm-wasi-runtime.md)/[24](./24-wit-interfaces-reference.md) |
| Runtimes / `component-host` | `Runtime` / `component-host` ports | [ADR-0026](./adr/01-architecture-core.md#adr-0026)/[ADR-0031](./adr/01-architecture-core.md#adr-0031) |
| Durable-store `runtime` port | `EventStore`/`Queue`/`Streamer`/`ActorHost`/`Clock` (conformance: replay fidelity, exactly-once, lease/fencing, ordering) | [ADR-0026](./adr/01-architecture-core.md#adr-0026)/[9](./09-verification-open-questions.md)/[11](./11-event-model.md) |
| Drivers | `terraform`/`template`/`echo`/`container`/`custom-webhook` | [27](./27-drivers-packs-profiles.md) |
| Engines | `contract`/`policy`/`training`/operator engines | [29](./29-contracts-compatibility.md)/[30](./30-policy-plane.md)/[ADR-0025](./adr/06-ai-generation-operators.md#adr-0025)/[40](./40-operator-agents.md) |
| Resource Definitions / Packs / Profiles | platform-rule layer | [25](./25-resource-definitions-matching.md)/[27](./27-drivers-packs-profiles.md) |
| Agent skills | `@hobo/agent-skills` (operator + external agents) | [1](./01-monorepo.md)/[40](./40-operator-agents.md) |
| Projection sinks | `projection-sink` paradigms | [39](./39-data-plane-projections.md) |
| Projection-sink paradigm adapters | add a new paradigm (relational/document/kv/graph/vector/OLAP/…): author driver → certify (`@hobo/conformance`) → signed Pack → Matching-select | [39](./39-data-plane-projections.md)/[ADR-0052](./adr/03-data-plane.md#adr-0052)/[27](./27-drivers-packs-profiles.md) |
Each seam: a typed contract (WIT/conformance), a registry entry (signed + provenance), and Matching/selection per Camp ([Plan 25](./25-resource-definitions-matching.md)). Adding a seam implementation never requires editing the core.

### 3. Persisted patches (safe, round-trippable mutation)
AI- or human-authored changes to generated code persist via **region-scoped, format-preserving AST mutation with signed provenance** ([ADR-0048](./adr/06-ai-generation-operators.md#adr-0048)): generated regions are demarcated, hand-written intent is never clobbered, every patch is a minimal reviewable diff, round-trippable, and gated (`hobo codegen --check`, [ADR-0037](./adr/05-config-matching-environments.md#adr-0037); low-risk → auto-commit, prod → PR/Delta for approval). This is what makes "self-healing, persisted code" ([Plan 41](./41-generated-stack.md)) a *durable derivative*, not an ephemeral runtime hack.

## Patchability vs portability (the two guarantees, side by side)
- **Portability ([ADR-0024](./adr/07-portability-extensibility.md#adr-0024)):** the *same* Bindle + `src/` run byte-identical on N clouds; you don't get locked into a backend.
- **Patchability ([ADR-0057](./adr/07-portability-extensibility.md#adr-0057)):** you can *change* HoBo — swap any engine, add any adapter, fork the Yard, and persist AI/human patches — and still ride the same conformance/signing/Matching machinery, so a derivative stays trustworthy and upgradable. **Conformance is the bridge:** it's what makes both a swapped backend *and* a derived implementation safe to trust.

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

## Derivative upgrade paths ([ADR-0068](./adr/07-portability-extensibility.md#adr-0068))
Patchability is only durable if long-lived derivatives can **track core upgrades** instead of rotting or forking permanently — so derivatives get a **versioned, conformance-gated upgrade path** (closing the deferral below).
- **Seams are independently semver-versioned.** Each extension seam (a WIT port: `policy-engine`, `contract-engine`, `component-host`, a provider/driver/runtime/projection-sink — the seams enumerated above) carries a semver; a Yard pins the seam versions it requires, and the manifest IR records which seam versions a Bindle uses (proven by its conformance run).
- **A signed `derivative.json` descriptor** ([Plan 12](./12-security-multitenancy.md)): the **core version range** it targets (`core@^1.0.0 <1.1.0`), its **seam implementations + versions** (`policy-engine@2.3.0`, `custom-aws-driver@1.0.0`), and **pinned upcasters** for any persisted mutations ([ADR-0048](./adr/06-ai-generation-operators.md#adr-0048)) — codemods that repair the hand-written/generated regions on a core upgrade.
- **An `hobo derivative upgrade <from> <to>` ceremony.** In a derivative Yard it: **checks `derivative.json` compatibility** (warns on any seam/mutation incompatibility) → **runs the pinned upcasters** → **re-runs seam conformance** (proves the upgrade didn't regress a guarantee) → **emits an upgrade report**. Events: `derivative.UpgradeStarted` · `derivative.UpgradeSucceeded` · `derivative.UpgradeFailed`.
- **Core releases ship a breaking-change manifest** — the seam/port changes with upcaster hints (*"`policy-engine` gained decision field X — here's the migration"*), so a derivative author writes targeted upcasters instead of reverse-engineering the diff. **Conformance is the bridge:** a derivative that re-passes the suite post-upgrade is a trusted, upgradable first-class citizen ([ADR-0057](./adr/07-portability-extensibility.md#adr-0057)).

## Verification
- A custom engine (e.g. a bespoke `policy-engine`) shipped as a signed plugin passes conformance and is selected per Camp via Matching — no core edit; portability of user apps is unaffected.
- A persisted patch to a generated region survives regeneration (round-trip), shows as a minimal diff, and `hobo codegen --check` distinguishes it from drift.
- A derivative Yard (forked control plane) deploys as a Bindle and self-hosts with the same control-plane features ([ADR-0024 §self-host=hosted](./adr/07-portability-extensibility.md#adr-0024)).

## Scope (v1) & YAGNI
- **v1:** name patchability as a guarantee + enumerate the seams (all already exist as ports); the persisted-patch mechanism ([ADR-0048](./adr/06-ai-generation-operators.md#adr-0048)); conformance/signing as the trust bridge.
- **Now designed (was deferred):** the upgrade story for long-lived derivatives — seam semver + signed `derivative.json` + the `hobo derivative upgrade` ceremony + core breaking-change manifests ([ADR-0068](./adr/07-portability-extensibility.md#adr-0068)).
- **Deferred:** an upstream-merge/rebase story beyond the upgrade ceremony; a public derivative/plugin marketplace beyond Resource Packs.

## Iteration hooks
- ~~How a derivative tracks core upgrades (semver + conformance-pinned + codemod-assisted migration).~~ **Resolved ([ADR-0068](./adr/07-portability-extensibility.md#adr-0068)):** seam semver + signed `derivative.json` + the `hobo derivative upgrade` ceremony (check compat → run upcasters → re-run conformance → report) + core breaking-change manifests.
- Whether "patchability" needs its own CLI surface (`hobo extend`/`hobo fork`) or rides existing pack/registry commands.
- Provenance/trust for third-party derivatives (signing chain, attestation) beyond [Plan 12](./12-security-multitenancy.md).
