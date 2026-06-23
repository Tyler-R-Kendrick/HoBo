# Portability, extensibility & deployment topology — consolidated decisions

> Consolidated ADR decisions for **portability, extensibility & deployment topology**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0024
**Portability conformance guarantee ("same Bindle, N clouds").**

- **Origin:** the requirements portability review (see [`plans/README.md`](../../../plans/README.md), findings P-01…07).

### Context
HoBo's core promise — *"write once, deploy to N clouds, unedited; self-host = hosted"* — was stated as vision and high-level NFRs (NFR-001/013), but the **defensive mechanisms** that keep it from silently eroding were missing or undefined: "unedited" had no formal meaning, the agnostic-core layering invariant had no enforced check, runtime portability wasn't proven across ≥2 runtime backends, there was no lock-in detection, no runtime/upstream version policy, and no explicit self-host/hosted parity statement. A promise without a conformance mechanism degrades to marketing.

### Decision
Make portability a **conformance guarantee** with verifiable mechanisms (each lands as an `NFR`/`FR`/`TR`):
1. **Define "unedited" precisely** — across cloud targets the `bindle.ts` **and** application source (`src/`) are **byte-identical**; only `hobo.config.ts` and CLI/env parameters may change. The `multi-cloud-shop` E2E proves it by deploying an unchanged `bindle.ts` to ≥2 providers and asserting identical resource topology + bindings. (NFR-001, TRD §5.1)
2. **Enforce the layering invariant in CI** — a dependency-graph lint gate (e.g. `depcheck`/`madge`) fails the build if `@hobo/core` (or any agnostic package) imports a provider/iac/build package, or if an adapter imports another adapter. The agnostic core cannot leak provider detail. (TR-006, NFR-020)
3. **Prove runtime portability** — at least one example runs unchanged on ≥2 runtime backends (e.g. `runtime-local` and `runtime-postgres`) with only a runtime override, asserting identical lifecycle (replay==live). (TR-012) **Component-host portability is conformance-gated + version-pinned per [ADR-0067](01-architecture-core.md#adr-0067):** the `component-host` is itself a per-Camp port whose claimed hosts must pass the `@hobo/conformance/component-host` suite (deterministic-clock replay, `wasi:*` round-trip, link semantics, capability-handle isolation) and whose kind+version is pinned in the manifest IR, so a component proven on Wasmtime behaves identically on wasm-in-container/SpinKube.
4. **Detect lock-in** — `hobo doctor` warns (non-blocking, explained) when a resource has provider-specific `.with()` for only one provider, or uses a static key where federation is available. (FR-014) **Data portability is paradigm-class-scoped:** `hobo doctor` additionally warns on `.raw(driver => …)` dialect leaks and cross-paradigm-only features — a Bindle is portable *within* a projection-sink paradigm class (relational↔relational, document↔document, …), not across classes ([Plan 39](../data-plane.md#plan-39)/[ADR-0052](03-data-plane.md#adr-0052)). These lock-in sources are surfaced with severity in the **PortabilityReport** ([Plan 22](../authoring-resources-wiring.md#plan-22), below) emitted with `deployment.Planned`.
5. **Pin upstream + define a version policy** — exact pins for Pulumi Automation API / WASI-WIT / MCP; runtime-port versions are recorded in the manifest IR and are immutable for a Bindle version; upgrades go through an explicit, gated `hobo upgrade` path with a compat/upgrade test in CI. A version-mismatch fails planning with a precise reason. (TR-013) The deeper `hobo:*` versioning question remains open (ADR-P/Q11); this is the v1 default.
6. **State self-host/hosted parity** — self-host and hosted ship the **same code and the same control-plane features** (identity, policy, audit, conformance, observability); the **only** differences are operational (managed multi-region HA, org SSO/RBAC, support). A hosted-gated feature must be explicitly documented and must not silently weaken self-host security. (NFR-013)

### Alternatives considered
- **Keep portability as vision + NFR-001 only** — rejected: the promise erodes the first time someone imports a provider into the core or ships a Bindle that only runs on one cloud, with nothing to catch it.
- **Block on lock-in (hard fail) instead of warn** — rejected for v1: provider-specific optimization is a *feature* (`.with()`); a warning preserves intent while surfacing risk. Revisit if drift proves common.
- **Resolve `hobo:*` versioning fully now** — deferred (ADR-P/Q11); this ADR commits the v1 pin-and-gate default without prejudging the long-term scheme.

### Consequences
- **(+)** "Same Bindle, N clouds" and "self-host = hosted" become testable gates (CI lint, ≥2-runtime E2E, multi-cloud E2E, parity tests), not slogans.
- **(+)** Lock-in and upstream churn — the two ways portability quietly dies — now have explicit detection/isolation requirements.
- **(−)** The CI dep-graph lint and the ≥2-runtime E2E add engineering cost and a second mature runtime backend earlier than strictly required for a single-cloud demo.
- **(−)** The version-pinning policy adds an upgrade ceremony; mitigated by making it explicit and gated rather than implicit.

## ADR-0057
**Patchability as a first-class guarantee (distinct from portability).**

- **Origin:** the vision states "**Patchable** — allowing derivative implementations and extensible plugin capabilities; **not just portability**." The capability existed (ports everywhere, Resource Packs, Forge, persisted mutation) but was never named as a goal distinct from portability (only [ADR-0024](#adr-0024) was stated).

### Context
HoBo's stated guarantee was **portability** ([ADR-0024](#adr-0024)): the same artifact runs unmodified on N backends. But the architecture also affords something portability does not: you can **change HoBo itself** — every engine is behind a port, every seam is an adapter, the Yard is a Bindle, and AI/human edits persist via region-scoped AST mutation ([ADR-0048](06-ai-generation-operators.md#adr-0048)). The vision elevates this to a named goal ("not just portability"). Naming it makes the extension seams a *contract* and clarifies that derivatives stay trustworthy via the same conformance/signing machinery.

### Decision
1. **Adopt patchability as a first-class guarantee, distinct from portability.** Definition: *you can derive your own HoBo (swap any engine, add any adapter, fork the Yard) and persist AI/human patches, and a conforming derivative is a trusted, upgradable first-class citizen.* Portability = the user's app isn't locked to a backend; patchability = the platform isn't a black box.
2. **Three pillars** ([Plan 43](../forge-generated-stack.md#plan-43)): **(a) derivative implementations** behind the same WIT ports, distributed as signed Resource Packs/plugins, human- or Forge-generated; **(b) enumerated extension seams** (providers/IaC/build, capability providers, runtimes/`component-host`, drivers, engines, Resource Defs/Packs/Profiles, agent-skills, projection sinks) — adding an implementation never edits the core; **(c) persisted patches** via region-scoped, format-preserving AST mutation + signed provenance ([ADR-0048](06-ai-generation-operators.md#adr-0048)), round-trippable + drift-gated ([ADR-0037](05-config-matching-environments.md#adr-0037)).
3. **Conformance is the trust bridge for both guarantees.** The same `@hobo/conformance` suite ([Plan 9](../verification.md#plan-09)) + signing/provenance ([Plan 12](../security-networking.md#plan-12)) that make a *swapped backend* safe (portability) make a *derived implementation* safe (patchability). A derivative that passes conformance is trusted; one that doesn't is rejected.
4. **Never gate patchability behind a paid tier** — consistent with the never-gate-portability stance ([ADR-0024](#adr-0024)); OSS core is self-hostable and forkable.

### Alternatives considered
- **Leave it under "portability" / "extensibility" (don't name it).** Rejected: the vision explicitly distinguishes them ("not just portability"); conflating them hides that HoBo lets you change the *platform*, not just move the *app*.
- **Allow arbitrary core forks without conformance.** Rejected: an unconformant derivative isn't trustworthy or upgradable; conformance is the price of first-class-citizen status.
- **Free-form runtime code mutation (no region/provenance discipline).** Rejected: that's an ephemeral hack, not a durable derivative; [ADR-0048](06-ai-generation-operators.md#adr-0048)'s region-scoping + provenance is what makes a patch maintainable.

### Consequences
- **(+)** Names a real differentiator (closed PaaS has neither portability nor patchability; raw IaC lacks portability) and turns the extension seams into a stable, enumerated contract.
- **(+)** Reuses existing machinery (ports, conformance, signing, packs, ADR-0048) — naming + enumeration, not new mechanism.
- **(+)** Derivatives, persisted patches, and swapped engines all ride one trust bridge (conformance), so the platform stays open *and* safe.
- **(−)** Long-lived derivatives need an upstream-tracking/upgrade story (how a fork follows core semver) — deferred, an iteration hook.
- **(−)** More public surface area to keep stable (the enumerated seams become a compatibility commitment); offset by WIT/conformance versioning.
- **(−)** Trust for third-party derivatives needs a signing/attestation chain beyond v1's basics ([Plan 12](../security-networking.md#plan-12)).

## ADR-0068
**Derivative upgrade paths: seam versioning & compat for forks/patches.**

### Context
[ADR-0057](#adr-0057) makes **patchability** a first-class guarantee: swap any engine, add any adapter, fork the Yard, persist AI/human patches ([ADR-0048](06-ai-generation-operators.md#adr-0048)) — all trusted via `@hobo/conformance`. But it explicitly **defers** the upgrade story: *"long-lived derivatives need an upstream-tracking/upgrade story — deferred, an iteration hook."* That deferral undermines the moat: a fork that swaps the policy engine, adds custom drivers, and persists patches has no defined answer for "core ships v1.1 with a breaking WIT-port change." Without it, derivatives rot or fork permanently.

### Decision
Give derivatives a **versioned, conformance-gated upgrade path**.

1. **Seams are independently semver-versioned.** Each extension seam (a WIT port: `policy-engine`, `contract-engine`, `component-host`, a provider/driver/runtime/projection-sink) carries a semver; a Yard pins the seam versions it requires, and the manifest IR records which seam versions a Bindle uses (proven by its conformance run).
2. **A signed `derivative.json` descriptor.** A derivative publishes (signed, [Plan 12](../security-networking.md#plan-12)): the **core version range** it targets (`core@^1.0.0 <1.1.0`), its **seam implementations + versions** (`policy-engine@2.3.0`, `custom-aws-driver@1.0.0`), and **pinned upcasters** for any persisted mutations ([ADR-0048](06-ai-generation-operators.md#adr-0048)) — codemods that repair the hand-written/generated regions on a core upgrade.
3. **An `hobo derivative upgrade <from> <to>` ceremony.** In a derivative Yard it: checks `derivative.json` compatibility (warns on any seam/mutation incompatibility), runs the pinned upcasters, **re-runs seam conformance** to prove the upgrade didn't regress a guarantee, and emits an upgrade report. Events: `derivative.UpgradeStarted` · `derivative.UpgradeSucceeded` · `derivative.UpgradeFailed`.
4. **Core releases ship a breaking-change manifest.** Each core release publishes the seam/port changes with upcaster hints (*"`policy-engine` gained decision field X — here's the migration"*), so a derivative author writes targeted upcasters instead of reverse-engineering the diff. Conformance is the bridge: a derivative that re-passes the suite post-upgrade is a trusted, upgradable first-class citizen ([ADR-0057](#adr-0057)).

### Alternatives considered
- **Leave upgrades undefined (status quo deferral).** Rejected: it's the documented blocker on the patchability moat; long-lived forks are the point.
- **Forbid breaking seam changes.** Rejected: unrealistic over the platform's life; semver + upcasters + conformance handle breakage honestly.
- **Auto-rebase derivatives on core (no descriptor/ceremony).** Rejected: silent rebasing of a fork's swapped engines/patches is exactly the un-auditable mutation [ADR-0048](06-ai-generation-operators.md#adr-0048) rejects; the ceremony is explicit + gated.

### Consequences
- **(+)** Closes the deferred patchability gap: derivatives are maintainable across core releases, not abandon-ware.
- **(+)** Reuses semver + conformance + signing + [ADR-0048](06-ai-generation-operators.md#adr-0048) upcasters + the drift gate ([ADR-0037](05-config-matching-environments.md#adr-0037)) — a descriptor + a ceremony + events, not new runtime.
- **(−)** A compatibility commitment: the enumerated seams ([Plan 43](../forge-generated-stack.md#plan-43)) become a versioned public surface the core must evolve carefully (offset by WIT/conformance versioning).
- **(−)** Upcaster authoring burden falls partly on derivative authors; core breaking-change manifests + hints reduce but don't remove it.

## ADR-0035
**Custom domains & multi-cloud ingress.**

- **Origin:** the gap analysis flagged that Nitric ships custom domains while HoBo's `gateway` model left custom-domain provisioning + multi-cloud DNS/CNAME a one-liner (Q23/G4). Designed via brainstorming + grill-with-docs.

### Context
[Plan 13](../security-networking.md#plan-13) specifies the `gateway` port (TLS termination, routing, traffic-split) and HoBo-managed DNS for *internal* logical endpoints, but custom domains were a single sentence ("a provider capability; bind to a gateway"). The genuinely hard, HoBo-specific part is unaddressed: when a Bindle spans **multiple Camps** (a multi-cloud `production` = {`prod-aws`,`prod-azure`}, [ADR-0028](05-config-matching-environments.md#adr-0028)), **which Camp owns `shop.com`, how does traffic route across clouds, and who issues the cert?** Single-cloud custom domains are well-understood; multi-cloud ingress is the differentiator HoBo must specify.

### Decision
1. **A custom domain is a first-class, Yard-level resource.** `domain("shop.com").routes(api)` is owned at the **Yard** (which already holds cross-provider topology, [ADR-0026](01-architecture-core.md#adr-0026)), declared IfC-style, and **fronts the member Camps** of an environment group ([ADR-0028](05-config-matching-environments.md#adr-0028)). It is backed by a new **`dns` capability** + the existing **`gateway`** port ([Plan 13](../security-networking.md#plan-13)). One domain, N Camps.
2. **Routing across Camps is policy-driven DNS.** The domain carries a routing policy — **`failover`** (active-passive, health-checked), **`weighted`** (canary/split), or **`latency`/`geo`** (nearest Camp) — programmed through a **provider-agnostic `dns` capability**. It reuses the env-group saga ([ADR-0028](05-config-matching-environments.md#adr-0028)), the blue/green gateway flip + health signals ([Plan 5](../reliability-observability-cost.md#plan-05)), and records each routing decision as an event (auditable "why did traffic go to `prod-aws`"). HoBo does **not** operate a global data-plane LB in v1.
3. **Certs are ACME DNS-01 by default, issued + rotated by Identity (secretless).** Because HoBo controls the zone, **DNS-01** works across any cloud, including wildcards and multi-Camp; certs are issued + auto-rotated by Identity ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 31](../authoring-resources-wiring.md#plan-31)) with **no static cert secret** ([ADR-0027](02-identity-security.md#adr-0027)). **Provider-managed certs** (ACM / App Service / Google-managed) are an **opt-in per-Camp adapter** when a provider's LB requires its own.
4. **Ingress depth stays layered:** the `gateway` does TLS termination + routing + traffic-split + provider `.with()` WAF/rate-limit/DDoS; the `domain` sits above it, routing across Camps.
5. **Events:** `domain.Registered` · `domain.Validated` (DNS/ACME challenge passed) · `domain.CertIssued` · `domain.CertRotated` · `domain.RoutingChanged` (policy decision + chosen target Camps).

### Alternatives considered
- **Per-Camp gateway attachment (single cloud).** Rejected as the model: punts the multi-cloud-ingress case that distinguishes HoBo. (A single-Camp domain is just the degenerate case of the Yard-level resource.)
- **BYO DNS (HoBo only outputs the CNAME/A target).** Rejected as the default: HoBo wouldn't own routing, so cross-Camp failover/weighted routing becomes the user's problem; kept as a fallback for users who insist on managing their own zone.
- **HoBo-operated global anycast LB.** Rejected for v1: makes HoBo operate a global data-plane tier (cost, latency, ops, a new SPOF). Noted as a future opt-in adapter; DNS-based routing covers failover/weighted/geo without it.
- **Provider-managed certs as the default.** Rejected: per-provider, not portable across the equivalence class, inconsistent for wildcard/multi-Camp; kept as an adapter.
- **BYO uploaded cert.** Rejected: manual renewal + a static secret to custody, against the secretless posture ([ADR-0027](02-identity-security.md#adr-0027)).

### Consequences
- **(+)** Closes G4/Q23 with a genuine **multi-cloud ingress** story — one domain routes across clouds with failover/weighted/geo policies, which no single-cloud competitor offers.
- **(+)** Reuses the Yard topology ([ADR-0026](01-architecture-core.md#adr-0026)), env-group saga ([ADR-0028](05-config-matching-environments.md#adr-0028)), gateway flip + health ([Plan 5](../reliability-observability-cost.md#plan-05)), and secretless Identity ([Plan 31](../authoring-resources-wiring.md#plan-31)); the new surface is a `dns` capability + a `domain` resource + a small `domain.*` event group.
- **(+)** ACME DNS-01 gives portable, wildcard-capable, auto-rotated certs with no static secret — consistent with the keyless ethos.
- **(−)** DNS-based routing has propagation/TTL latency on failover (seconds–minutes) vs an anycast LB's instant flip — acceptable for v1; the anycast adapter is the upgrade path for stricter RTO.
- **(−)** A provider-agnostic `dns` capability must be conformance-covered per provider (record types, health-check hooks, ALIAS/ANAME quirks) — ongoing equivalence-class work.

## ADR-0036
**Air-gapped / sovereign Yard mode.**

- **Origin:** the gap analysis (G6) found that while the HoBo Relay enables *connected-private* deploys, a fully **disconnected / sovereign (zero-egress)** mode — offline registry, in-boundary key custody — was unstated. Designed via brainstorming + grill-with-docs.

### Context
The **HoBo Relay** ([Plan 28](../platform-engineering.md#plan-28)) dials a hosted Yard over outbound 443 and keeps credentials + Executors inside the customer network — but it **assumes a reachable hosted Yard**. A classified/regulated/sovereign environment has no such path: no egress to a hosted control plane, the public Registry, public ACME, or hosted AI models. HoBo is already self-hostable (the Yard is a Bindle, [Plan 4](../control-plane.md#plan-04)) and the Forge already runs no-egress ([ADR-0023](02-identity-security.md#adr-0023)), and recent ADRs added the in-boundary pieces (local `embed` — [ADR-0034](03-data-plane.md#adr-0034); private-ACME-capable certs — [ADR-0035](#adr-0035); in-boundary KMS — [ADR-0027](02-identity-security.md#adr-0027)). What's missing is the **profile that ties them together** and the **honest matrix** of what works, degrades, or needs a substitute with zero egress.

### Decision
1. **Air-gap is a first-class self-hosted Yard profile** — the entire control plane (Yard + Registry + Identity + Executors + runtime + optional models) runs **inside the boundary with zero egress**. The HoBo Relay remains the *connected-private* answer; this profile is the *disconnected/sovereign* answer. The design ships a **capability-degradation matrix** (below).
2. **Artifacts enter via signed offline bundle import** (`hobo registry import <bundle>`): a curated bundle of provider plugins, Capability Manifest, Resource Packs, base images, and optional model weights, each carrying **SLSA-style provenance + conformance reports**, **verified in-boundary against the same trust boundary** as the live Registry (signature + provenance + conformance). Transfer is one-way-friendly (sneakernet / data diode); the in-boundary Registry serves the mirror — **no live crawl** of external `/.well-known/capability-manifest/`.
3. **In-boundary trust roots + local models, graceful degradation.** Identity issues SVIDs locally (already in-boundary); custom-domain certs use an **internal CA / private ACME** ([ADR-0035](#adr-0035)); secrets use **in-boundary KMS/HSM** ([ADR-0027](02-identity-security.md#adr-0027)); `embed`/Forge/`"use training"` use **local in-boundary models when provisioned, else degrade gracefully** (Forge → human-authored providers only; `"use training"` → static implementation; `embed` → BYO vectors). Telemetry/live-evals stay in-boundary (local OTel collector); **no phone-home**.
4. **The deterministic core never needs a model or egress.** Deploy, Matching ([ADR-0033](05-config-matching-environments.md#adr-0033)), migration ([ADR-0032](03-data-plane.md#adr-0032)), and routing ([ADR-0035](#adr-0035)) are pure/local, so an air-gapped deploy works fully regardless of AI availability.
5. **Event:** `registry.BundleImported` (signed-bundle import + verification result) — a supply-chain audit fact.

#### Capability-degradation matrix
| Capability | Normal (connected) | Air-gapped substitute |
|---|---|---|
| Registry (Capability Manifest / plugins / packs) | crawl `/.well-known/capability-manifest/` | **signed offline bundle import** → in-boundary mirror |
| Container/component images | public registry pull | mirrored into an in-boundary OCI registry (bundle) |
| TLS certs (custom domains) | ACME → Let's Encrypt | **internal CA / private ACME** (or provider-managed in-boundary) — [ADR-0035](#adr-0035) |
| Identity / SVID | issued by the Yard | unchanged — already in-boundary |
| Secrets | provider KMS | **in-boundary KMS/HSM** — [ADR-0027](02-identity-security.md#adr-0027) |
| `embed` (search) | hosted embedding API | **local embedding model**, else BYO vectors — [ADR-0034](03-data-plane.md#adr-0034) |
| Forge generation | hosted LLM | **local LLM**, else human-authored providers only |
| `"use training"` | hosted LLM + telemetry | **local LLM**, else static impl; live-evals in-boundary |
| Telemetry / live-evals | hosted/3p sinks | **in-boundary OTel collector**, no phone-home |
| Deploy / match / migrate / route | — | **zero egress, no model needed — always works** |

### Alternatives considered
- **"The HoBo Relay is enough."** Rejected: the Relay presumes a reachable hosted Yard over 443; a truly disconnected network has no such path.
- **Full air-gap out of scope for v1.** Rejected: leaves a known regulated/sovereign-market gap; most of the substrate already exists, so the marginal cost is a profile + a matrix + bundle import.
- **Live caching mirror/proxy for the Registry.** Rejected: requires egress to the public Registry — not air-gap (fine for connected-private).
- **Bake everything into the Yard image.** Rejected: inflexible (rebuild to add a provider/pack), bloated images, no clean incremental-provenance story.
- **Disable all AI in air-gap / require an in-boundary model.** Rejected (both extremes): the chosen "local-or-degrade" keeps AI when a model is present without making it a hard blocker, and never blocks the deterministic deploy path.

### Consequences
- **(+)** HoBo has a real **sovereign/regulated** story: a zero-egress Yard with a documented substitute for every external dependency; deploys work fully without any model or network.
- **(+)** Reuses self-host ([Plan 4](../control-plane.md#plan-04)), the no-egress Forge sandbox ([ADR-0023](02-identity-security.md#adr-0023)), in-boundary KMS ([ADR-0027](02-identity-security.md#adr-0027)), local `embed` ([ADR-0034](03-data-plane.md#adr-0034)), and private ACME ([ADR-0035](#adr-0035)); the new surface is a profile + signed bundle import + one event.
- **(+)** Bundle import keeps the **same supply-chain trust boundary** (signature + provenance + conformance), so air-gap doesn't weaken trust — a tampered bundle is refused.
- **(−)** Operating an air-gapped install adds toil: producing/curating signed bundles, running an internal CA + in-boundary model, and a manual update cadence (no auto-pull).
- **(−)** AI features are reduced unless the operator provisions a capable local model; this is explicit in the matrix, not a silent surprise.
- **(↔)** Air-gap is a **single in-boundary Yard**; multi-Yard **federation** ([Q20](../verification.md#plan-09)) remains separately deferred.

## ADR-0041
**Migration & onboarding (adopt-in-place).**

- **Origin:** open question #19 — bridges from Lakebed (Capsule→Bindle), Terraform/Pulumi (import), and FaaS so HoBo isn't greenfield-only. Designed via brainstorming + grill-with-docs.

### Context
HoBo already has the *primitives* for adoption — the **Pulumi Automation API** as primary IaC ([ADR-0006](./README.md)), **CDKTF import-only** ("read existing stacks, don't author new", [Plan 3](../control-plane.md#plan-03) §IaC adapters), and OpenTofu state backends — but no **onboarding journey**: how an existing app/infra estate moves onto HoBo *incrementally*, without a greenfield rewrite. This is adoption-critical: teams have Terraform/Pulumi estates, Lakebed Capsules, and FaaS deployments; HoBo must meet them where they are.

### Decision
1. **`hobo import` adopts existing infra/code in place.** A command family reads an existing estate into HoBo's resource graph: `hobo import terraform|pulumi|opentofu <state>` (via the existing CDKTF import-only + Pulumi Automation API), `hobo import lakebed` (Capsule→Bindle mapping), `hobo import faas` (wrap existing functions). Imported resources become **`adopted` existing nodes** in the Planner DAG — managed by id/state, **never destroyed/recreated on import** (drift-detect only, [Plan 5](../reliability-observability-cost.md#plan-05)).
2. **Brownfield coexistence (strangler-fig).** HoBo can **reference un-managed external resources** via an **`external` resource kind**, so a half-migrated app works (a HoBo-managed `api` binds to a `db` still living in Terraform). Teams migrate incrementally and strangle the old stack over time; nothing is big-bang.
3. **Importer breadth via the Forge.** Ship **reference importers** (Terraform/Pulumi/OpenTofu state, Lakebed Capsule, generic FaaS) with documented mappings; an importer is a transform the **Forge can generate** ([Plan 33](../forge-generated-stack.md#plan-33)) for a new source, gated by a **round-trip/idempotence conformance test** (import → plan → no-op diff) — so onboarding breadth isn't human-bottlenecked, exactly like provider generation.
4. **Event:** `resource.Adopted` (an existing resource brought under management + its source/provenance), distinct from `resource.Provisioned`.

### Alternatives considered
- **Source codemod / transpile to the HoBo SDK.** Rejected as the strategy: brittle across languages/frameworks, hard to keep correct, and forces a big-bang rewrite before any value. (HoBo may still *suggest* SDK code, but adoption doesn't depend on it.)
- **Greenfield only (docs/patterns, no tooling).** Rejected: leaves HoBo greenfield-only — the exact adoption gap #19 names.
- **All-or-nothing import.** Rejected: high friction; a large estate becomes a stalled all-or-nothing project. Incremental adopt + coexist is the lower-risk path.
- **Hand-written importers only.** Rejected as the ceiling (kept as the reference set): caps breadth at team capacity; Forge-generated importers cover the long tail under the same conformance trust boundary.

### Consequences
- **(+)** Closes #19: existing TF/Pulumi/Lakebed/FaaS estates move onto HoBo **incrementally**, adopting in place and coexisting with un-migrated infra — a real migration story, not greenfield-only.
- **(+)** Reuses the Pulumi Automation API + CDKTF import-only ([Plan 3](../control-plane.md#plan-03)), drift detection ([Plan 5](../reliability-observability-cost.md#plan-05)), and the Forge + conformance boundary ([Plan 33](../forge-generated-stack.md#plan-33)/[Plan 9](../verification.md#plan-09)) — the new surface is the `import` command family, an `external`/`adopted` resource kind, and one event.
- **(+)** Strengthens positioning vs Lakebed (no incremental migration) and raw IaC ([Plan 17](../positioning.md#plan-17)).
- **(−)** Adopting heterogeneous estates means importer mapping fidelity is ongoing work; a Forge-generated importer is only as trusted as its round-trip conformance test.
- **(−)** `external` references span a trust/lifecycle boundary HoBo doesn't fully control (the un-managed resource can drift outside HoBo); `hobo doctor` should flag long-lived `external` deps as migration debt.

## ADR-0043
**Multi-Yard federation: the Junction (and the Yard's scope, clarified).** Accepted (architecture); **v1 ships single-Yard, federation-ready** (the Junction itself is a later v1 iteration hook — [ADR-0063](08-scope-and-requirements.md#adr-0063))

- **Origin:** open question #20 ("Yard federation"). Brainstorm surfaced that the question conflated *multi-region* (already solved) with *true multi-Yard*; the Yard is the central cross-cloud orchestrator, so any aggregate above it needs its own concept.

### Context
#20 framed multi-region/regulatory as needing "multi-Yard federation." But a **Yard is the central cross-cloud / cross-region orchestrator** ([ADR-0026](01-architecture-core.md#adr-0026)) — a multi-region/multi-cloud deployment is already **one Yard ⊃ many Camps** ([ADR-0028](05-config-matching-environments.md#adr-0028)), where each Camp is a provider/region target. So multi-region needs **no** second Yard. A second Yard is warranted only for **extreme isolation**: a tenant/boundary that must have a **wholly separate control plane** (sovereign/regulated tenants, air-gapped boundaries, [ADR-0036](#adr-0036), or isolation beyond per-tenant streams). And because the Yard is itself the central orchestrator, an aggregate *over* Yards can't be a bigger Yard — it needs a distinct concept.

### Decision
1. **The Yard is the central cross-cloud orchestrator; one Yard per app/org by default.** Cross-region/cross-cloud = `Yard ⊃ Camp` ([ADR-0026](01-architecture-core.md#adr-0026)/[ADR-0028](05-config-matching-environments.md#adr-0028)). #20's "multi-Yard for multi-region" is corrected: **multi-region needs no second Yard.**
2. **True multi-Yard is for extreme isolation only** — a tenant/boundary requiring a wholly separate control plane (sovereignty/regulatory, air-gap, hard multi-tenant isolation). Otherwise: one Yard.
3. **Introduce the `Junction` — a peer federation of sovereign Yards (a new aggregate, *not* a controller).** Thematically, a junction is where independent rail lines meet — the point where otherwise-separate yards interconnect as peers, no line subordinate to another. When sovereign Yards must interoperate, a Junction federates exactly three things, reusing mechanisms HoBo already has:
   - **Identity trust** — cross-Yard SVID/OIDC trust under an agreed root (the same OIDC federation HoBo does for providers, [Plan 6](../ai-native-agent-auth.md#plan-06)), so a principal from Yard A can be authenticated by Yard B.
   - **Policy** — shareable **signed policy packs** ([Plan 30](../contracts-policy-flags.md#plan-30)) propagate across the Junction.
   - **Registry** — certified providers/packs flow via the **signed-bundle/mirror** mechanism ([ADR-0036](#adr-0036)).
   Each Yard keeps its **own event log + control plane + data** — the Junction is **trust + signed-artifact sharing, never shared mutable state and never a super-controller**. A cross-Yard operation is a *federated request* (authn via federated identity, authz by the **target** Yard's own policy), with **data residency preserved** (nothing centralizes). The scope model becomes, for the rare case: **`Junction` (optional, peer) ⊇ `Yard ⊃ Camp ⊃ Bindle`** — where `⊇` is federation, not control.
4. **v1 ships single-Yard, federation-ready.** v1 implements one Yard per boundary but makes identity/policy/registry **federation-ready**: no assumption of a single global trust root, policy packs + registry bundles already signed/portable, the event `tenant` already scoping. The Junction (and its future events `junction.YardJoined`/`junction.TrustEstablished`/`junction.ArtifactShared`/`junction.YardLeft`) is a **later v1 iteration hook** — an in-scope follow-up, not a separate release ([ADR-0063](08-scope-and-requirements.md#adr-0063)) — and the initial single-Yard design does not preclude it.

### Alternatives considered
- **A central super-Yard (hierarchy) over regional Yards.** Rejected: a global SPOF + a data-residency problem (the central plane would see all regions) + it contradicts "the Yard is the broadest orchestrator" ([ADR-0026](01-architecture-core.md#adr-0026)). The Junction is peer, not hierarchical.
- **Overload the Yard to nest under another Yard.** Rejected per the scope model — the Yard is the central orchestrator; an aggregate above it must be a distinct concept (the Junction), not a subordinated Yard.
- **Use multiple Yards for multi-region (the original #20 framing).** Rejected: multi-region is Camps under one Yard ([ADR-0028](05-config-matching-environments.md#adr-0028)); a second Yard there would duplicate control planes for no benefit.
- **No federation (independent Yards, manual).** Rejected for the extreme-isolation case: leaves sovereign tenants as disconnected islands when they legitimately need to share identity/policy/providers; the Junction gives a thin, trust-only bridge.
- **Build the Junction up front.** Rejected as an early-stage need: it's a late iteration hook (v1 ships one-Yard-per-boundary first); this decision is the *architecture* + forward-compat, not the initial implementation.

### Consequences
- **(+)** Resolves #20 honestly: clarifies that multi-region is already one-Yard-many-Camps, scopes true multi-Yard to extreme isolation, and gives that case a clean concept (the Junction) without distorting the Yard.
- **(+)** The Junction reuses OIDC federation ([Plan 6](../ai-native-agent-auth.md#plan-06)), signed policy packs ([Plan 30](../contracts-policy-flags.md#plan-30)), and the signed-bundle mechanism ([ADR-0036](#adr-0036)) — no new control-plane machinery, and data residency is preserved (peer, not central).
- **(+)** v1 stays simple (one Yard) while remaining federation-ready, so the design doesn't paint itself into a corner.
- **(−)** A peer federation has no single global view/governance point — cross-Junction policy conflicts must be reconciled by agreement, not a central authority (acceptable, and the point, for sovereignty).
- **(−)** The Junction is specified but deferred within v1; its event model + join/trust ceremony are a later iteration, so the multi-Yard story is architectural-only until then.

## ADR-0062
**Registry distribution: publish/discover/install/trust over signed, certified artifacts.** Accepted (reframed to **Registry distribution**; **monetization removed** — no free/paid/rev-share, no `billing` port — [ADR-0064](08-scope-and-requirements.md#adr-0064))

- **Origin:** Plans 40/42/43 each *deferred* "a marketplace of X" — a standing forward-reference the suite never resolved. The primitives all existed (Registry, signed Packs, conformance, provenance); the distribution lifecycle tying them together did not.

### Context
HoBo has every primitive distribution needs — a Registry, signed Resource Packs, `@hobo/conformance`, provenance, and MCP — and several plans explicitly punted "a marketplace of X" to later. Without a unifying lifecycle, third-party/community distribution stays ad-hoc. The risk to avoid: distribution that becomes a lock-in lever, contradicting the portability guarantee that is HoBo's core promise. **Monetization is explicitly out of scope** — HoBo is an AI-native meta-cloud, not a commerce product ([ADR-0064](08-scope-and-requirements.md#adr-0064)); this is **Registry distribution**, not a storefront.

### Decision
1. **Registry distribution is a governed index + lifecycle over existing signed/certified artifacts**, not new infrastructure or new artifact types. Listings = providers / Resource Packs / policy packs / agent-skills / runbooks / Hobo-Code modules / guardrails+model cards.
2. **Publish = sign + conformance-certify + provenance** ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 12](../security-networking.md#plan-12)/[Plan 9](../verification.md#plan-09)/[Plan 33](../forge-generated-stack.md#plan-33)) — the same trust boundary every adapter crosses; uncertified ⇒ unlisted (`listing.Published`/`Certified`).
3. **Discover is capability-indexed and agent-drivable** (WIT port + Matching criteria + region/classification), surfaced via MCP so the Forge/agents can install as part of planning.
4. **Install = `hobo add`, bound by Matching** ([Plan 25](../platform-engineering.md#plan-25)) — installing makes an artifact *available* to deterministic selection, never forces its use; air-gap installs via signed offline bundle ([ADR-0036](#adr-0036)).
5. **Trust = provenance tier + publisher identity + ratings** (a composite derived from facts; policy packs can require a minimum tier). **Portability is never gated** ([ADR-0024](#adr-0024)): conformance, ports, import/export, and the swap-for-an-equivalent escape hatch are always free and open; the Forge guarantees an equivalent can always be generated. **No monetization** — Registry distribution carries no free/paid/rev-share tiers and no `billing` port ([ADR-0064](08-scope-and-requirements.md#adr-0064)).

### Alternatives considered
- **A free-for-all upload marketplace (npm-style, trust-by-popularity).** Rejected: HoBo's value is the conformance/provenance trust boundary; bypassing it for distribution would import the supply-chain risks HoBo exists to remove.
- **Make the marketplace a new store with its own artifact format.** Rejected: duplicates the Registry/signing/conformance; listings are existing artifacts plus distribution metadata.
- **Monetize distribution (free/paid/rev-share, a `billing` port).** Removed — out of scope ([ADR-0064](08-scope-and-requirements.md#adr-0064)): HoBo is a meta-cloud, not a commerce product. Registry distribution carries no commercial tiers; portability/conformance/escape-hatch stay always-free regardless.
- **Force-bind on install.** Rejected: would make installing risky and break deterministic Matching; install adds a candidate, Matching decides.
- **Human-only web storefront.** Rejected as the *only* surface: agent-drivable MCP discovery is required for the AI-native thesis; a web UI is additive and deferred.

### Consequences
- **(+)** Operationalizes the long-deferred marketplace with almost no new machinery — a `listing.*` lifecycle + capability index over already-signed/certified artifacts; turns the Forge + Crew into composable *community* surfaces.
- **(+)** Trust is fact-derived (provenance tier + conformance + identity), so enterprises can govern their own supply chain via policy; agents can safely self-serve dependencies.
- **(+)** The never-gate-portability invariant is enforced structurally (Forge guarantees an equivalent), so the marketplace can't become lock-in — a differentiator vs closed-PaaS app stores.
- **(−)** Curation/moderation and a real storefront UX are real product work, deferred; v1 is CLI/MCP + a few listing kinds.
- **(−)** Yank propagation to already-deployed Sets is delicate (warn vs block vs forced migration) — an iteration hook; getting it wrong either breaks running apps or leaves vulns deployed.
- **(−)** A vibrant third-party ecosystem raises the stakes on conformance-suite quality — a weak suite would certify weak artifacts.

## ADR-0042
**Local-dev fidelity (simulate / mock / Camp-only).**

- **Origin:** open question #17 — which prod behaviors `hobo dev` must *simulate* vs *mock* vs *must-test-in-a-Camp*, so "works locally" predicts "works in prod." Designed via brainstorming + grill-with-docs.

### Context
HoBo's DX promise is a fast, offline inner loop (`npx hobo new` → `hobo dev`, no cloud — [Plan 15](../developer-experience.md#plan-15)) where the agnostic path runs locally. But "works locally" is only valuable if it *predicts* prod. Some behaviors can be reproduced faithfully on a laptop; some can't (real cloud IAM, cross-cloud mTLS, provider quotas); and conflating them turns a green local run into a false promise. #17 asks for the explicit classification + a way for developers to know which is which.

### Decision
1. **Classify each prod behavior by "does a wrong local answer hide a real bug?"** — **simulate** (high-fidelity local equivalent) the *correctness-determining* behaviors; **mock** (honest seam) the *environmental* ones that can't be real locally; **defer to a Camp** the *irreducibly-real* ones. (See the matrix below.)
2. **Fidelity is labeled, and `hobo verify` splits local vs Camp checks.** Each capability reports its local fidelity — `real | simulated | mocked | camp-only`; `hobo dev` surfaces it; the **conformance suite** ([Plan 9](../verification.md#plan-09)) tags every check `local` or `camp`. `hobo dev` runs the `local` checks (all simulate/real behaviors pass offline); a Camp run runs the `camp` checks. **`hobo verify` will not claim prod-readiness for behaviors that are mocked-only** — it reports coverage = `local ∪ camp` and flags "this needs a Camp test." The fidelity gap is explicit, never silent.

#### The fidelity matrix
| Prod behavior | Local fidelity | Why |
|---|---|---|
| Determinism / replay | **simulate (real)** | `runtime-local` runs the real engine; `replay == state` is the core test ([Plan 2](../sdk-api.md#plan-02)/[Plan 9](../verification.md#plan-09)) |
| `.allow()` capability denials | **simulate (real)** | wasm deny-by-default is real locally ([Plan 20](../wasm-runtime-wit.md#plan-20)) — an un-linked call fails identically |
| Auth/ABAC + policy decisions | **simulate (real)** | the policy engine + agent/end-user auth run locally ([Plan 30](../contracts-policy-flags.md#plan-30)/[Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 36](../ai-native-agent-auth.md#plan-36)) |
| `can-deploy` / contracts / evals | **simulate (real)** | the Gatekeeper runs locally over the same graph ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 23](../forge-generated-stack.md#plan-23)) |
| Resource interfaces (db/kv/bucket/queue) | **simulate** | local equivalents (containerized Postgres, in-mem queue, local object store) — same agnostic client ([Plan 15](../developer-experience.md#plan-15)) |
| Embedding / search | **simulate** | local embed model + pgvector/FTS ([ADR-0034](03-data-plane.md#adr-0034)) |
| Cloud IAM (real provider roles) | **mock** (honest seam) | can't mint real AWS/Azure IAM locally; the `.allow()`→IAM mapping is unit-tested ([Plan 9](../verification.md#plan-09)) |
| Provider latency / egress / cost | **mock** | environmental; the cost/latency *model* is exercised, real figures need a Camp ([Plan 16](../reliability-observability-cost.md#plan-16)) |
| Secrets backends (KMS / Key Vault) | **mock** | local secret stub; the real broker/KMS is Camp-only ([Plan 31](../authoring-resources-wiring.md#plan-31)) |
| Cross-cloud mTLS handshake | **camp-only** | needs two real providers + SVID federation ([Plan 13](../security-networking.md#plan-13)) |
| Real quotas / runaway-spend limits | **camp-only** | provider/plan limits are real-environment ([ADR-0039](04-governance-verification.md#adr-0039)) |
| Provider drift / failure modes | **camp-only** | only a real provider exhibits real drift ([Plan 5](../reliability-observability-cost.md#plan-05)) |

### Alternatives considered
- **Best-effort emulation, no formal matrix.** Rejected: silent fidelity gaps make "works locally" stop predicting prod — the footgun #17 names.
- **Camp-first (little local fidelity).** Rejected: destroys the fast offline inner loop ([Plan 15](../developer-experience.md#plan-15)) + zero-cloud onboarding.
- **Silent fidelity (no labels).** Rejected: a developer can't tell a real local pass from a mocked one; the label + `hobo verify` split is what makes a local pass trustworthy.
- **Make everything simulate-real (full local prod emulation).** Rejected: infeasible (real cloud IAM, cross-cloud mTLS, provider quotas can't be faithfully reproduced on a laptop) and would over-promise.

### Consequences
- **(+)** "Works locally" becomes a *bounded, honest* promise: correctness-determining behaviors are real locally, environmental ones are clearly mocked, and the rest is explicitly Camp-gated — with `hobo verify` enforcing the distinction.
- **(+)** Reuses the conformance suite + `hobo verify` ([Plan 9](../verification.md#plan-09)) — the only new surface is a per-check `local|camp` tag + a per-capability fidelity label.
- **(+)** Aligns local-fidelity with the air-gap work ([ADR-0036](#adr-0036)): the same local models/stubs power both dev and air-gap.
- **(−)** Maintaining the matrix + labels as capabilities evolve is ongoing discipline; a mislabeled capability re-introduces the false-promise risk.
- **(−)** Mocked behaviors (IAM, latency, secrets) still need a Camp run before prod confidence — `hobo verify` makes that explicit but doesn't remove the step.
