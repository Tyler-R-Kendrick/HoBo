# Portability, extensibility & deployment topology — consolidated decisions

> Consolidated ADR decisions for **portability, extensibility & deployment topology**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0024
**Portability conformance guarantee ("same Bindle, N clouds").**

- **Origin:** the requirements portability review (see [`plans/README.md`](../../../plans/README.md), findings P-01…07).

### Context
HoBo's core promise — *"write once, deploy to N clouds, unedited; self-host = hosted"* — needs **defensive mechanisms** that keep it from silently eroding: "unedited" needs a formal meaning, the agnostic-core layering invariant needs an enforced check, runtime portability must be proven across ≥2 runtime backends, lock-in must be detectable, runtime/upstream versions need a policy, and self-host/hosted parity must be explicit. A promise without a conformance mechanism degrades to marketing.

### Decision
Make portability a **conformance guarantee** with verifiable mechanisms (each lands as an `NFR`/`FR`/`TR`):
1. **Define "unedited" precisely** — across cloud targets the **`bindle()` definition and** application source (`src/`) are **byte-identical**; only the **`camp()`/`yard()` mapping** and CLI/env parameters may change. The `multi-cloud-shop` E2E proves it by deploying an unchanged Bindle to ≥2 providers and asserting identical resource topology + bindings. (NFR-001, TRD §5.1)
2. **Enforce the layering invariant in CI** — a dependency-graph lint gate (e.g. `depcheck`/`madge`) fails the build if `@hobo/core` (or any agnostic package) imports a provider/iac/build package, or if an adapter imports another adapter. The agnostic core cannot leak provider detail. (TR-006, NFR-020)
3. **Prove runtime portability** — at least one example runs unchanged on ≥2 runtime backends (e.g. `runtime-local` and `runtime-postgres`) with only a runtime override, asserting identical lifecycle (replay==live). (TR-012) **Component-host portability is conformance-gated + version-pinned per [ADR-0031](01-architecture-core.md#adr-0031):** the `component-host` is itself a per-Camp port whose claimed hosts must pass the `@hobo/conformance/component-host` suite (deterministic-clock replay, `wasi:*` round-trip, link semantics, capability-handle isolation) and whose kind+version is pinned in the manifest IR, so a component proven on Wasmtime behaves identically on wasm-in-container/SpinKube.
4. **Detect lock-in** — `hobo doctor` warns (non-blocking, explained) when a resource has provider-specific `.with()` for only one provider, or uses a static key where federation is available. (FR-014) **Data portability is paradigm-class-scoped:** `hobo doctor` additionally warns on `.raw(driver => …)` dialect leaks and cross-paradigm-only features — a Bindle is portable *within* a projection-sink paradigm class (relational↔relational, document↔document, …), not across classes ([Plan 32](../data-plane.md#plan-32)/[ADR-0052](03-data-plane.md#adr-0052)). These lock-in sources are surfaced with severity in the **PortabilityReport** ([Plan 21](../authoring-resources-wiring.md#plan-21), below) emitted with `deployment.Planned`.
5. **Pin upstream + define a version policy** — exact pins for Pulumi Automation API / WASI-WIT / MCP; runtime-port versions are recorded in the manifest IR and are immutable for a Bindle version; upgrades go through an explicit, gated `hobo upgrade` path with a compat/upgrade test in CI. A version-mismatch fails planning with a precise reason. (TR-013) `hobo:*` versioning is pin-and-gate.
6. **State self-host/hosted parity** — self-host and hosted ship the **same code and the same control-plane features** (identity, policy, audit, conformance, observability); the **only** differences are operational (managed multi-region HA, org SSO/RBAC, support). A hosted-gated feature must be explicitly documented and must not silently weaken self-host security. (NFR-013)
7. **The intended provider set is documented but non-limiting.** HoBo names a *seed* set of intended providers/hosts — self-hosted **wasmCloud** (default host, [ADR-0031](01-architecture-core.md#adr-0031)), **Hetzner**, **Cloudflare**, **Vercel**, **AWS/Azure/GCP**, **Fly**, and self-host targets (**Coolify**/k8s/bare-metal) — in the [providers & deploy-targets matrix](../control-plane.md#plan-04). The set is **open**: each is a swappable adapter behind the `CloudProvider`/`component-host`/`IacProvider` ports, the **Forge** generates new adapters on demand ([ADR-0010](06-ai-generation-operators.md#adr-0010)), unsupported configs are caught at author time with remediation ([ADR-0033](05-config-matching-environments.md#adr-0033)), and any backend that passes conformance is first-class. Documenting the seed set names where portability is *validated*; it never caps it.

### Alternatives considered
- **Keep portability as vision + NFR-001 only** — rejected: the promise erodes the first time someone imports a provider into the core or ships a Bindle that only runs on one cloud, with nothing to catch it.
- **Block on lock-in (hard fail) instead of warn** — rejected: provider-specific optimization is a *feature* (`.with()`); a warning preserves intent while surfacing risk.

### Consequences
- **(+)** "Same Bindle, N clouds" and "self-host = hosted" become testable gates (CI lint, ≥2-runtime E2E, multi-cloud E2E, parity tests), not slogans.
- **(+)** Lock-in and upstream churn — the two ways portability quietly dies — now have explicit detection/isolation requirements.
- **(−)** The CI dep-graph lint and the ≥2-runtime E2E add engineering cost and require a second mature runtime backend.
- **(−)** The version-pinning policy adds an upgrade ceremony; mitigated by making it explicit and gated rather than implicit.

## ADR-0057
**Patchability as a first-class guarantee (distinct from portability).**

- **Origin:** the vision states "**Patchable** — allowing derivative implementations and extensible plugin capabilities; **not just portability**."

### Context
**Portability** ([ADR-0024](#adr-0024)) means the same artifact runs unmodified on N backends. The architecture also affords something portability does not: you can **change HoBo itself** — every engine is behind a port, every seam is an adapter, the Yard is a Bindle, and AI/human edits persist via region-scoped AST mutation ([ADR-0048](06-ai-generation-operators.md#adr-0048)). Naming this a guarantee makes the extension seams a *contract* and keeps derivatives trustworthy via the same conformance/signing machinery. **Portability = same artifact runs on N backends; patchability = derive/extend/patch the platform itself, persisted OR ephemeral.**

### Decision
1. **Adopt patchability as a first-class guarantee, distinct from portability.** Definition: *you can derive your own HoBo (swap any engine, add any adapter, fork the Yard) and apply AI/human patches, and a conforming derivative is a trusted, upgradable first-class citizen.* Portability = the user's app isn't locked to a backend; patchability = the platform isn't a black box.
2. **Three pillars** ([Plan 23](../forge-generated-stack.md#plan-23)): **(a) derivative implementations** behind the same WIT ports, distributed as signed Resource Packs/plugins, human- or Forge-generated; **(b) enumerated extension seams** (providers/IaC/build, capability providers, runtimes/`component-host`, drivers, engines, Resource Defs/Packs/Profiles, agent-skills, projection sinks, **integration ports** — auth/artifact-repo/issue-tracker/knowledge, [ADR-0073](#adr-0073)) — adding an implementation never edits the core; **(c) patches** in two distinct kinds (below), both region-scoped and provenance-tracked.
3. **Two kinds of patch (inspired by npm `patch-package`).** A patch derives or extends behavior without editing the upstream source outright; HoBo distinguishes *where the change lives*:
   - **Persisted patches** — changes captured into source/artifacts via the region-scoped, format-preserving AST mutation mechanism + signed provenance ([ADR-0048](06-ai-generation-operators.md#adr-0048)), conformance-gated and round-trippable + drift-gated ([ADR-0037](05-config-matching-environments.md#adr-0037)). Durable, reviewable, version-controlled — the patch becomes part of the derivative.
   - **Runtime-instance patches (ephemeral)** — at runtime, agents may apply changes that affect **only the running runtime instance** and are **not** persisted to source control (the way `patch-package` overlays a dependency locally without committing to upstream). Each is **scoped to the instance**, **audited as an event**, and **discarded / garbage-collected** unless explicitly **promoted to a persisted patch** (which re-enters the [ADR-0048](06-ai-generation-operators.md#adr-0048) region/provenance + conformance path). An ephemeral patch never silently mutates source.
4. **Conformance is the trust bridge for both guarantees.** The same `@hobo/conformance` suite ([Plan 9](../verification.md#plan-09)) + signing/provenance ([Plan 12](../security-networking.md#plan-12)) that make a *swapped backend* safe (portability) make a *derived implementation* and a *persisted patch* safe (patchability). A persisted patch or derivative that passes conformance is trusted; one that doesn't is rejected. An ephemeral patch is gated by instance-scope + audit, and must pass conformance to be promoted.
5. **Seams are versioned so derivatives survive upstream upgrades.** A long-lived derivative (swapped engine, custom drivers, persisted patches) needs a defined answer for "core ships a breaking WIT-port change" — without one, forks rot or fork permanently. So:
   - **Each extension seam is independently semver-versioned.** Every enumerated seam (a WIT port: `policy-engine`, `contract-engine`, `component-host`, a provider/driver/runtime/projection-sink) carries a semver; a Yard pins the seam versions it requires, and the manifest IR records which seam versions a Bindle uses (proven by its conformance run).
   - **A signed `derivative.json` descriptor** ([Plan 12](../security-networking.md#plan-12)) declares the **core version range** it targets (`core@^1.0.0 <1.1.0`), its **seam implementations + versions** (`policy-engine@2.3.0`, `custom-aws-driver@1.0.0`), and **pinned upcasters** for any persisted patches ([ADR-0048](06-ai-generation-operators.md#adr-0048)) — codemods that repair the hand-written/generated regions on a core upgrade.
   - **An `hobo derivative upgrade <from> <to>` ceremony** checks `derivative.json` compatibility (warns on any seam/patch incompatibility), runs the pinned upcasters, **re-runs seam conformance** to prove the upgrade didn't regress a guarantee, and emits an upgrade report. Events: `derivative.UpgradeStarted` · `derivative.UpgradeSucceeded` · `derivative.UpgradeFailed`.
   - **Core releases ship a breaking-change manifest** of the seam/port changes with upcaster hints (*"`policy-engine` gained decision field X — here's the migration"*), so derivative authors write targeted upcasters instead of reverse-engineering the diff. The upgrade is explicit + gated — never a silent auto-rebase of a fork's swapped engines/patches, which is exactly the un-auditable mutation [ADR-0048](06-ai-generation-operators.md#adr-0048) rejects. A derivative that re-passes conformance post-upgrade stays a trusted, upgradable first-class citizen.
6. **Never gate patchability behind a paid tier** — consistent with the never-gate-portability stance ([ADR-0024](#adr-0024)); the core is self-hostable and forkable.

### Alternatives considered
- **Leave it under "portability" / "extensibility" (don't name it).** Rejected: the vision explicitly distinguishes them ("not just portability"); conflating them hides that HoBo lets you change the *platform*, not just move the *app*.
- **Allow arbitrary core forks without conformance.** Rejected: an unconformant derivative isn't trustworthy or upgradable; conformance is the price of first-class-citizen status.
- **Only persisted patches (no ephemeral kind).** Rejected: agents need to overlay a fix on the running instance fast, without a commit ceremony; the ephemeral kind gives that safely (instance-scoped + audited + GC'd) while promotion is the path to durability.
- **Free-form ephemeral mutation (no instance scope / no audit / silent persistence).** Rejected: an unscoped, unaudited, or silently-persisted runtime mutation is exactly the un-auditable change [ADR-0048](06-ai-generation-operators.md#adr-0048) rejects; scope + audit-event + explicit promotion is what keeps it honest.
- **Leave derivative upgrades undefined, or forbid breaking seam changes.** Both rejected: long-lived forks are the point of patchability, so an undefined upgrade path lets them rot, while forbidding breakage is unrealistic over the platform's life. Semver + signed descriptor + pinned upcasters + re-run conformance handle breakage honestly.

### Consequences
- **(+)** Names a real differentiator (closed PaaS has neither portability nor patchability; raw IaC lacks portability) and turns the extension seams into a stable, enumerated contract.
- **(+)** Reuses existing machinery (ports, conformance, signing, packs, ADR-0048) — naming + enumeration + the ephemeral/persisted split, not new mechanism.
- **(+)** Derivatives, persisted patches, ephemeral patches, and swapped engines all ride one trust bridge (conformance + provenance + audit), so the platform stays open *and* safe.
- **(+)** Derivatives are maintainable across core releases, not abandon-ware: semver + signed descriptor + re-run conformance + [ADR-0048](06-ai-generation-operators.md#adr-0048) upcasters + the drift gate ([ADR-0037](05-config-matching-environments.md#adr-0037)) give a long-lived fork a gated upgrade path — a descriptor + a ceremony + events, not new runtime.
- **(−)** Ephemeral patches add an instance-scoped lifecycle (audit + GC + promotion) and a clear "this is not in source" contract operators must understand.
- **(−)** A compatibility commitment: the enumerated, now-semver-versioned seams become a public surface the core must evolve carefully (offset by WIT/conformance versioning), and upcaster-authoring burden falls partly on derivative authors — core breaking-change manifests + hints reduce but don't remove it.
- **(−)** Trust for third-party derivatives needs a signing/attestation chain beyond the basics ([Plan 12](../security-networking.md#plan-12)).

## ADR-0035
**Custom domains & multi-cloud ingress.**

- **Origin:** the gap analysis flagged custom-domain provisioning + multi-cloud DNS/CNAME as under-specified against the `gateway` model (Q23/G4). Designed via brainstorming + grill-with-docs.

### Context
[Plan 12](../security-networking.md#plan-12) specifies the `gateway` port (TLS termination, routing, traffic-split) and HoBo-managed DNS for *internal* logical endpoints. Custom domains need full treatment, and the genuinely hard, HoBo-specific part is provider-global routing: a Yard is **provider-specific** and holds provider-global networking + global gateways ([ADR-0026](01-architecture-core.md#adr-0026)), so a domain that fronts **multiple Camps** (e.g. `prod-eu`, `prod-us` under one provider's Yard, [ADR-0028](05-config-matching-environments.md#adr-0028)) — and, across providers, multiple Yards under a Junction ([ADR-0043](#adr-0043)) — raises **who owns `shop.com`, how does traffic route across Camps/clouds, and who issues the cert?** DNS / custom domains belong at the **Yard level (provider-global), with per-Camp overrides** — *not* at the app/Bindle level, since a Bindle is provider-agnostic and carries no provider-global zone. **DNS is high-blast-radius and slow to recover** (propagation/TTL, cache poisoning of a bad change), so every DNS change is treated as a guarded, tested, reversible rollout — never a fire-and-forget write.

### Decision
1. **A custom domain is a Yard-level resource (provider-global), with per-Camp overrides — never app/Bindle-level.** `domain("shop.com").routes(api)` is owned at the **Yard**, which holds the provider-global networking + global gateway and runs the provider's control plane ([ADR-0026](01-architecture-core.md#adr-0026)). It is declared IfC-style, **fronts the Yard's Camps**, and lets a Camp **override** the provider-global record set (e.g. a region-specific target or cert adapter). It is backed by a **`dns` capability** + the **`gateway`** port ([Plan 12](../security-networking.md#plan-12)). One provider-global domain, N Camps with per-Camp overrides. Cross-cloud, a domain fronting Camps in **different providers' Yards** is federated by the Junction ([ADR-0043](#adr-0043)); the zone is never pushed down to the agnostic Bindle.
2. **Routing across Camps is policy-driven DNS.** The domain carries a routing policy — **`failover`** (active-passive, health-checked), **`weighted`** (canary/split), **`latency`/`geo`** (nearest Camp), or **`cost`** (cheapest healthy backend by effective marginal cost, driven by the **Dispatcher** [ADR-0071](05-config-matching-environments.md#adr-0071) — **stateless/replicable workloads only**, with dwell-time so it never thrashes) — programmed through a **provider-agnostic `dns` capability** at the Yard, with per-Camp overrides. It reuses the env-group saga ([ADR-0028](05-config-matching-environments.md#adr-0028)), the blue/green gateway flip + health signals ([Plan 5](../reliability-observability-cost.md#plan-05)), and records each routing decision as an event (auditable "why did traffic go to `prod-eu`"). HoBo does **not** operate a global data-plane LB.
3. **No DNS change promotes without passing an automated validation gate (mandatory).** Every DNS/custom-domain change is **tested and validated *before* promotion** — the planner stages the record set and a gate must pass: **resolve checks** (the new records resolve to the intended targets from multiple resolvers/vantage points), **propagation checks** (TTL-aware confirmation the change is visible, not just written), **ACME/challenge validation** (the cert challenge passes for the new state), and **endpoint health checks** (each target Camp's gateway answers healthy through the new path). A failed check **blocks promotion**, emits the failure, and leaves the live zone untouched. There is no path that mutates the live record set ahead of these checks.
4. **Failover/cutover rollouts are health-checked, staged, and auto-rolling-back (best practice).** A routing/cutover change is rolled out **staged / canary** — shift a small weight or a single resolver class first, watch health + error/latency signals against the pre-cutover baseline, then widen only on green. **Automatic rollback on regression**: if post-cutover health or SLOs regress past threshold, HoBo reverts to the last-known-good record set without operator intervention and emits the rollback. Active-passive `failover` is itself health-gated (traffic moves only to a target proven healthy). This reuses the blue/green gateway flip + health signals ([Plan 5](../reliability-observability-cost.md#plan-05)).
5. **Certs are ACME DNS-01 by default, issued + rotated by Identity (secretless).** Because HoBo controls the zone, **DNS-01** works across any cloud, including wildcards and multi-Camp; certs are issued + auto-rotated by Identity ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 21](../authoring-resources-wiring.md#plan-21)) with **no static cert secret** ([ADR-0027](02-identity-security.md#adr-0027)). **Provider-managed certs** (ACM / App Service / Google-managed) are an **opt-in per-Camp adapter** when a provider's LB requires its own.
6. **Ingress depth stays layered:** the `gateway` does TLS termination + routing + traffic-split + provider `.with()` WAF/rate-limit/DDoS; the Yard-level `domain` sits above it (provider-global, with per-Camp overrides), routing across the Yard's Camps.
7. **Events:** `domain.Registered` · `domain.ValidationStarted` · `domain.Validated` (resolve + propagation + ACME + health gate passed) · `domain.ValidationFailed` (which check failed) · `domain.CertIssued` · `domain.CertRotated` · `domain.CutoverStarted` · `domain.RoutingChanged` (policy decision + chosen target Camps) · `domain.RolledBack` (auto-revert to last-known-good + reason).

### Alternatives considered
- **App/Bindle-level custom domains.** Rejected: a Bindle is provider-agnostic ([ADR-0026](01-architecture-core.md#adr-0026)) and carries no provider-global zone, so DNS/cert ownership has no home there; the domain lives at the Yard (provider-global) with per-Camp overrides. (A single-Camp domain is just the degenerate case of the Yard-level resource.)
- **Promote DNS changes without a validation gate (write-then-hope).** Rejected: DNS is high-blast-radius and slow to recover; an unvalidated change can blackhole a domain for a TTL window. Resolve/propagation/ACME/health checks must pass before promotion.
- **Big-bang cutover (flip all traffic at once).** Rejected: a regression hits 100% of users before anyone notices; staged/canary cutover with automatic rollback contains blast radius and recovers without an operator.
- **BYO DNS (HoBo only outputs the CNAME/A target).** Rejected as the default: HoBo wouldn't own routing or the validation gate, so cross-Camp failover/weighted routing and pre-promotion testing become the user's problem; kept as a fallback for users who insist on managing their own zone.
- **HoBo-operated global anycast LB.** Rejected: makes HoBo operate a global data-plane tier (cost, latency, ops, a new SPOF). Noted as an opt-in adapter; DNS-based routing covers failover/weighted/geo without it.
- **Provider-managed certs as the default.** Rejected: per-provider, not portable across the equivalence class, inconsistent for wildcard/multi-Camp; kept as an adapter.
- **BYO uploaded cert.** Rejected: manual renewal + a static secret to custody, against the secretless posture ([ADR-0027](02-identity-security.md#adr-0027)).

### Consequences
- **(+)** Closes G4/Q23 with a genuine **multi-cloud ingress** story — one domain routes across clouds with failover/weighted/geo policies, which no single-cloud competitor offers.
- **(+)** DNS changes are **safe by construction**: nothing promotes until resolve/propagation/ACME/health checks pass, and cutovers are staged with automatic rollback — the high-blast-radius footgun is gated, not trusted to operator care.
- **(+)** Reuses the provider-global Yard topology ([ADR-0026](01-architecture-core.md#adr-0026)), env-group saga ([ADR-0028](05-config-matching-environments.md#adr-0028)), gateway flip + health ([Plan 5](../reliability-observability-cost.md#plan-05)), and secretless Identity ([Plan 21](../authoring-resources-wiring.md#plan-21)); the new surface is a `dns` capability + a Yard-level `domain` resource (with per-Camp overrides) + a `domain.*` event group with validation/cutover/rollback facts.
- **(+)** ACME DNS-01 gives portable, wildcard-capable, auto-rotated certs with no static secret — consistent with the keyless ethos.
- **(−)** DNS-based routing has propagation/TTL latency on failover (seconds–minutes) vs an anycast LB's instant flip; the staged/health-checked cutover + auto-rollback bound the risk, and the anycast adapter is the path for stricter RTO.
- **(−)** The pre-promotion validation gate (multi-vantage resolve + propagation wait) adds latency to a domain change and is itself ongoing equivalence-class work (record types, health-check hooks, ALIAS/ANAME quirks, resolver coverage) the `dns` capability must be conformance-covered for per provider.

## ADR-0036
**Air-gapped / sovereign Yard mode.**

- **Origin:** the gap analysis (G6) called for a fully **disconnected / sovereign (zero-egress)** mode alongside the connected-private HoBo Relay — offline registry, in-boundary key custody. Designed via brainstorming + grill-with-docs.

### Context
The **HoBo Relay** ([Plan 25](../platform-engineering.md#plan-25)) dials a hosted Yard over outbound 443 and keeps credentials + Executors inside the customer network — but it **assumes a reachable hosted Yard**. A classified/regulated/sovereign environment has no such path: no egress to a hosted control plane, the public Registry, public ACME, or hosted AI models. HoBo is self-hostable (the Yard is a Bindle, [Plan 4](../control-plane.md#plan-04)), the Forge runs no-egress ([ADR-0023](02-identity-security.md#adr-0023)), and the in-boundary pieces exist (local `embed` — [ADR-0034](03-data-plane.md#adr-0034); private-ACME-capable certs — [ADR-0035](#adr-0035); in-boundary KMS — [ADR-0027](02-identity-security.md#adr-0027)). This ADR adds the **profile that ties them together** and the **honest matrix** of what works, degrades, or needs a substitute with zero egress.

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
- **Leave full air-gap out of scope.** Rejected: leaves a regulated/sovereign-market gap; most of the substrate exists, so the marginal cost is a profile + a matrix + bundle import.
- **Live caching mirror/proxy for the Registry.** Rejected: requires egress to the public Registry — not air-gap (fine for connected-private).
- **Bake everything into the Yard image.** Rejected: inflexible (rebuild to add a provider/pack), bloated images, no clean incremental-provenance story.
- **Disable all AI in air-gap / require an in-boundary model.** Rejected (both extremes): the chosen "local-or-degrade" keeps AI when a model is present without making it a hard blocker, and never blocks the deterministic deploy path.

### Consequences
- **(+)** HoBo has a real **sovereign/regulated** story: a zero-egress Yard with a documented substitute for every external dependency; deploys work fully without any model or network.
- **(+)** Reuses self-host ([Plan 4](../control-plane.md#plan-04)), the no-egress Forge sandbox ([ADR-0023](02-identity-security.md#adr-0023)), in-boundary KMS ([ADR-0027](02-identity-security.md#adr-0027)), local `embed` ([ADR-0034](03-data-plane.md#adr-0034)), and private ACME ([ADR-0035](#adr-0035)); the new surface is a profile + signed bundle import + one event.
- **(+)** Bundle import keeps the **same supply-chain trust boundary** (signature + provenance + conformance), so air-gap doesn't weaken trust — a tampered bundle is refused.
- **(−)** Operating an air-gapped install adds toil: producing/curating signed bundles, running an internal CA + in-boundary model, and a manual update cadence (no auto-pull).
- **(−)** AI features are reduced unless the operator provisions a capable local model; this is explicit in the matrix, not a silent surprise.
- **(↔)** Air-gap is a **single in-boundary Yard**; multi-Yard **federation** is the Junction's concern ([ADR-0043](#adr-0043)).

## ADR-0041
**Migration & onboarding (adopt-in-place).**

- **Origin:** open question #19 — bridges from Lakebed (Capsule→Bindle), Terraform/Pulumi (import), and FaaS so HoBo isn't greenfield-only. Designed via brainstorming + grill-with-docs.

### Context
HoBo has the *primitives* for adoption — the **Pulumi Automation API** as primary IaC ([ADR-0006](./README.md)), **CDKTF import-only** ("read existing stacks, don't author new", [Plan 4](../control-plane.md#plan-04) §IaC adapters), and OpenTofu state backends. This ADR defines the **onboarding journey** on top of them: how an existing app/infra estate moves onto HoBo *incrementally*, without a greenfield rewrite. This is adoption-critical: teams have Terraform/Pulumi estates, Lakebed Capsules, and FaaS deployments; HoBo must meet them where they are.

### Decision
1. **`hobo import` adopts existing infra/code in place.** A command family reads an existing estate into HoBo's resource graph: `hobo import terraform|pulumi|opentofu <state>` (via the existing CDKTF import-only + Pulumi Automation API), `hobo import lakebed` (Capsule→Bindle mapping), `hobo import faas` (wrap existing functions). Imported resources become **`adopted` existing nodes** in the Planner DAG — managed by id/state, **never destroyed/recreated on import** (drift-detect only, [Plan 5](../reliability-observability-cost.md#plan-05)).
2. **Brownfield coexistence (strangler-fig).** HoBo can **reference un-managed external resources** via an **`external` resource kind**, so a half-migrated app works (a HoBo-managed `api` binds to a `db` still living in Terraform). Teams migrate incrementally and strangle the old stack over time; nothing is big-bang.
3. **Importer breadth via the Forge.** Ship **reference importers** (Terraform/Pulumi/OpenTofu state, Lakebed Capsule, generic FaaS) with documented mappings; an importer is a transform the **Forge can generate** ([Plan 23](../forge-generated-stack.md#plan-23)) for a new source, gated by a **round-trip/idempotence conformance test** (import → plan → no-op diff) — so onboarding breadth isn't human-bottlenecked, exactly like provider generation.
4. **Event:** `resource.Adopted` (an existing resource brought under management + its source/provenance), distinct from `resource.Provisioned`.

### Alternatives considered
- **Source codemod / transpile to the HoBo SDK.** Rejected as the strategy: brittle across languages/frameworks, hard to keep correct, and forces a big-bang rewrite before any value. (HoBo may still *suggest* SDK code, but adoption doesn't depend on it.)
- **Greenfield only (docs/patterns, no tooling).** Rejected: leaves HoBo greenfield-only — the exact adoption gap #19 names.
- **All-or-nothing import.** Rejected: high friction; a large estate becomes a stalled all-or-nothing project. Incremental adopt + coexist is the lower-risk path.
- **Hand-written importers only.** Rejected as the ceiling (kept as the reference set): caps breadth at team capacity; Forge-generated importers cover the long tail under the same conformance trust boundary.

### Consequences
- **(+)** Closes #19: existing TF/Pulumi/Lakebed/FaaS estates move onto HoBo **incrementally**, adopting in place and coexisting with un-migrated infra — a real migration story, not greenfield-only.
- **(+)** Reuses the Pulumi Automation API + CDKTF import-only ([Plan 4](../control-plane.md#plan-04)), drift detection ([Plan 5](../reliability-observability-cost.md#plan-05)), and the Forge + conformance boundary ([Plan 23](../forge-generated-stack.md#plan-23)/[Plan 9](../verification.md#plan-09)) — the new surface is the `import` command family, an `external`/`adopted` resource kind, and one event.
- **(+)** Strengthens positioning vs Lakebed (no incremental migration) and raw IaC ([Plan 17](../positioning.md#plan-17)).
- **(−)** Adopting heterogeneous estates means importer mapping fidelity is ongoing work; a Forge-generated importer is only as trusted as its round-trip conformance test.
- **(−)** `external` references span a trust/lifecycle boundary HoBo doesn't fully control (the un-managed resource can drift outside HoBo); `hobo doctor` should flag long-lived `external` deps as migration debt.

## ADR-0043
**The Junction: cross-cloud / hybrid federation of provider-specific Yards.**

- **Origin:** open question #20 ("Yard federation"). The scope re-cut ([ADR-0026](01-architecture-core.md#adr-0026)) makes the **Yard provider-specific** (Camps under one provider + cross-Camp policy, provider-global networking like vWAN, global gateways like Azure Front Door), so cross-cloud / hybrid is the aggregate *above* the Yard — the Junction. Designed via brainstorming + grill-with-docs.

### Context
A **Yard is provider-specific** ([ADR-0026](01-architecture-core.md#adr-0026)): it groups Camps under **one** provider and owns that provider's cross-Camp policy, provider-global networking (vWAN), and global gateways (Azure Front Door). Multi-region *within a provider* is several Camps under one Yard ([ADR-0028](05-config-matching-environments.md#adr-0028)) — no second Yard. But the moment an app spans **more than one provider** (or mixes cloud + on-prem), it spans **more than one Yard**, and something has to connect those provider-specific Yards across the cloud boundary. That is the **Junction**: the first-class, primary mechanism for cross-cloud / hybrid. The Junction is the **broadest scope** — `Bindle ⊂ Camp ⊂ Yard ⊂ Junction` — and a multi-cloud app is, by definition, **several Yards under one Junction**. Cross-cloud is a normal, expected scenario, so the connective tissue is a named first-class concept, not an afterthought smuggled into a control plane.

### Decision
1. **The Junction is the cross-cloud / hybrid scope — the broadest scope.** `Bindle ⊂ Camp ⊂ Yard ⊂ Junction` ([ADR-0026](01-architecture-core.md#adr-0026)). A Yard is one provider's stack; a **Junction connects provider-specific Yards** so an app can span clouds and on-prem. **A multi-cloud / hybrid app = several Yards under one Junction** — the ordinary shape of a cross-provider deployment, not an edge case.
2. **The Junction federates trust + signed artifacts + cross-cloud policy across Yards — it is not a shared-state controller.** Thematically, a junction is where independent rail lines meet: provider-specific Yards interconnect as peers, no line subordinate to another. A Junction federates exactly three things, reusing mechanisms HoBo already has:
   - **Identity trust** — cross-Yard SVID/OIDC trust under an agreed root (the same OIDC federation HoBo does for providers, [Plan 6](../ai-native-agent-auth.md#plan-06)), so a principal authenticated in the AWS Yard is recognized by the Azure Yard.
   - **Cross-cloud policy** — shareable **signed policy packs** ([Plan 29](../contracts-policy-flags.md#plan-29)) propagate across the Junction, so policy spanning the provider boundary is expressed once and enforced by each Yard. This is also how **org governance guardrails** ([ADR-0074](02-identity-security.md#adr-0074)) — RBAC + the mandatory deny-ceiling over HoBo's own control-plane surface — stay consistent across an estate's Yards without a new top-level scope noun.
   - **Registry / signed artifacts** — certified providers/packs flow between Yards via the **signed-bundle/mirror** mechanism ([ADR-0036](#adr-0036)).
   Each Yard keeps its **own event log + control plane + data** — the Junction is **trust + signed-artifact + cross-cloud-policy federation, never shared mutable state and never a super-controller**. A cross-Yard operation is a *federated request* (authn via federated identity, authz by the **target** Yard's own policy), with **data residency preserved** (nothing centralizes).
3. **The Junction is peer federation, not a hierarchy.** No assumption of a single global trust root: identity/policy/registry are federation-ready by construction — policy packs + registry bundles signed/portable, events `tenant`-scoped. A cross-cloud app declares its member Yards (e.g. an AWS Yard + an Azure Yard + an on-prem Yard) under one Junction; the Junction wires their trust, shares the cross-cloud policy, and brokers federated requests, but never reaches into a Yard's state. The Junction's events are `junction.YardJoined` · `junction.TrustEstablished` · `junction.ArtifactShared` · `junction.PolicyPropagated` · `junction.YardLeft`.

### Alternatives considered
- **A central super-Yard (hierarchy) over provider Yards.** Rejected: a global SPOF + a data-residency problem (the central plane would see every cloud) + it would put one provider's Yard above another's. The Junction is peer, not hierarchical.
- **Overload the Yard to span clouds.** Rejected per the scope model — a Yard is **provider-specific** ([ADR-0026](01-architecture-core.md#adr-0026)); the cross-cloud aggregate must be a distinct concept (the Junction), not a Yard stretched across providers.
- **Make cross-cloud a property of the control plane (no named scope).** Rejected: cross-cloud / hybrid is a normal, expected scenario and deserves a first-class scope; burying it in control-plane wiring hides the residency/peer guarantees and the "several Yards, one Junction" shape.
- **No Junction (independent Yards wired by hand).** Rejected: leaves a multi-cloud app's Yards as disconnected islands when they must share identity/policy/providers across the cloud boundary; the Junction gives a thin, trust-only bridge that preserves residency.

### Consequences
- **(+)** Cross-cloud / hybrid has a clean first-class home: a multi-cloud app is **several provider-specific Yards under one Junction**, with the Junction (not the Yard) as the broadest scope — resolving #20.
- **(+)** The Junction reuses OIDC federation ([Plan 6](../ai-native-agent-auth.md#plan-06)), signed policy packs ([Plan 29](../contracts-policy-flags.md#plan-29)), and the signed-bundle mechanism ([ADR-0036](#adr-0036)) — no new control-plane machinery, and data residency is preserved (peer, not central).
- **(+)** Each provider's Yard stays self-contained and the cross-cloud concern is isolated to the Junction, so single-provider deployments carry zero federation overhead while multi-cloud composes cleanly.
- **(−)** A peer federation has no single global view/governance point — cross-cloud policy conflicts between Yards must be reconciled by agreement, not a central authority (acceptable, and the point, for residency + sovereignty).

## ADR-0062
**Registry distribution: publish/discover/install/trust over signed, certified artifacts.**

- **Origin:** Plans 40/42/43 each reference "a marketplace of X." The primitives exist (Registry, signed Packs, conformance, provenance); this ADR defines the distribution lifecycle that ties them together.

### Context
HoBo has every primitive distribution needs — a Registry, signed Resource Packs, `@hobo/conformance`, provenance, and MCP — across several plans. A unifying lifecycle keeps third-party/community distribution from staying ad-hoc. The risk to avoid: distribution that becomes a lock-in lever, contradicting the portability guarantee that is HoBo's core promise. **Monetization is out of scope** — HoBo is an AI-native meta-cloud, not a commerce product ([ADR-0064](08-scope-and-requirements.md#adr-0064)); this is **Registry distribution**, not a storefront.

### Decision
1. **Registry distribution is a governed index + lifecycle over existing signed/certified artifacts**, not new infrastructure or new artifact types. Listings = providers / Resource Packs / policy packs / agent-skills / runbooks / Hobo-Code modules / guardrails+model cards.
2. **Publish = sign + conformance-certify + provenance** ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 12](../security-networking.md#plan-12)/[Plan 9](../verification.md#plan-09)/[Plan 23](../forge-generated-stack.md#plan-23)) — the same trust boundary every adapter crosses; uncertified ⇒ unlisted (`listing.Published`/`Certified`).
3. **Discover is capability-indexed and agent-drivable** (WIT port + Matching criteria + region/classification), surfaced via MCP so the Forge/agents can install as part of planning.
4. **Install = `hobo add`, bound by Matching** ([Plan 25](../platform-engineering.md#plan-25)) — installing makes an artifact *available* to deterministic selection, never forces its use; air-gap installs via signed offline bundle ([ADR-0036](#adr-0036)).
5. **Trust = provenance tier + publisher identity + ratings** (a composite derived from facts; policy packs can require a minimum tier). **Portability is never gated** ([ADR-0024](#adr-0024)): conformance, ports, import/export, and the swap-for-an-equivalent escape hatch are always free and open; the Forge guarantees an equivalent can always be generated. **No monetization** — Registry distribution carries no commercial tiers and no `billing` port ([ADR-0064](08-scope-and-requirements.md#adr-0064)).

### Alternatives considered
- **A free-for-all upload marketplace (npm-style, trust-by-popularity).** Rejected: HoBo's value is the conformance/provenance trust boundary; bypassing it for distribution would import the supply-chain risks HoBo exists to remove.
- **Make the marketplace a new store with its own artifact format.** Rejected: duplicates the Registry/signing/conformance; listings are existing artifacts plus distribution metadata.
- **Monetize distribution (commercial tiers, a `billing` port).** Out of scope ([ADR-0064](08-scope-and-requirements.md#adr-0064)): HoBo is a meta-cloud, not a commerce product. Registry distribution carries no commercial tiers; portability/conformance/escape-hatch stay always-free regardless.
- **Force-bind on install.** Rejected: would make installing risky and break deterministic Matching; install adds a candidate, Matching decides.
- **Human-only web storefront.** Rejected as the *only* surface: agent-drivable MCP discovery is required for the AI-native thesis; a web UI is additive.

### Consequences
- **(+)** Operationalizes the marketplace with almost no new machinery — a `listing.*` lifecycle + capability index over already-signed/certified artifacts; turns the Forge + Crew into composable *community* surfaces.
- **(+)** Trust is fact-derived (provenance tier + conformance + identity), so enterprises can govern their own supply chain via policy; agents can safely self-serve dependencies.
- **(+)** The never-gate-portability invariant is enforced structurally (Forge guarantees an equivalent), so the marketplace can't become lock-in — a differentiator vs closed-PaaS app stores.
- **(−)** Curation/moderation and a polished storefront UX are real product work atop the CLI/MCP + listing kinds.
- **(−)** Yank propagation to already-deployed Sets is delicate (warn vs block vs forced migration); getting it wrong either breaks running apps or leaves vulns deployed.
- **(−)** A vibrant third-party ecosystem raises the stakes on conformance-suite quality — a weak suite would certify weak artifacts.

## ADR-0042
**Local-dev fidelity (simulate / mock / Camp-only).**

- **Origin:** open question #17 — which prod behaviors `hobo dev` must *simulate* vs *mock* vs *must-test-in-a-Camp*, so "works locally" predicts "works in prod." Designed via brainstorming + grill-with-docs.

### Context
HoBo's DX promise is a fast, offline inner loop (`npx hobo new` → `hobo dev`, no cloud — [Plan 7](../developer-experience.md#plan-07)) where the agnostic path runs locally. But "works locally" is only valuable if it *predicts* prod. Some behaviors can be reproduced faithfully on a laptop; some can't (real cloud IAM, cross-cloud mTLS, provider quotas); and conflating them turns a green local run into a false promise. #17 asks for the explicit classification + a way for developers to know which is which.

### Decision
1. **Classify each prod behavior by "does a wrong local answer hide a real bug?"** — **simulate** (high-fidelity local equivalent) the *correctness-determining* behaviors; **mock** (honest seam) the *environmental* ones that can't be real locally; **defer to a Camp** the *irreducibly-real* ones. (See the matrix below.)
2. **Fidelity is labeled, and `hobo verify` splits local vs Camp checks.** Each capability reports its local fidelity — `real | simulated | mocked | camp-only`; `hobo dev` surfaces it; the **conformance suite** ([Plan 9](../verification.md#plan-09)) tags every check `local` or `camp`. `hobo dev` runs the `local` checks (all simulate/real behaviors pass offline); a Camp run runs the `camp` checks. **`hobo verify` will not claim prod-readiness for behaviors that are mocked-only** — it reports coverage = `local ∪ camp` and flags "this needs a Camp test." The fidelity gap is explicit, never silent.

#### The fidelity matrix
| Prod behavior | Local fidelity | Why |
|---|---|---|
| Determinism / replay | **simulate (real)** | `runtime-local` runs the real engine; `replay == state` is the core test ([Plan 2](../sdk-api.md#plan-02)/[Plan 9](../verification.md#plan-09)) |
| `.allow()` capability denials | **simulate (real)** | wasm deny-by-default is real locally ([Plan 20](../wasm-runtime-wit.md#plan-20)) — an un-linked call fails identically |
| Auth/ABAC + policy decisions | **simulate (real)** | the policy engine + agent/end-user auth run locally ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 6](../ai-native-agent-auth.md#plan-06)) |
| `can-deploy` / contracts / evals | **simulate (real)** | the Gatekeeper runs locally over the same graph ([Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 23](../forge-generated-stack.md#plan-23)) |
| Resource interfaces (db/kv/bucket/queue) | **simulate** | local equivalents (containerized Postgres, in-mem queue, local object store) — same agnostic client ([Plan 7](../developer-experience.md#plan-07)) |
| Embedding / search | **simulate** | local embed model + pgvector/FTS ([ADR-0034](03-data-plane.md#adr-0034)) |
| Cloud IAM (real provider roles) | **mock** (honest seam) | can't mint real AWS/Azure IAM locally; the `.allow()`→IAM mapping is unit-tested ([Plan 9](../verification.md#plan-09)) |
| Provider latency / egress / cost | **mock** | environmental; the cost/latency *model* is exercised, real figures need a Camp ([Plan 5](../reliability-observability-cost.md#plan-05)) |
| Secrets backends (KMS / Key Vault) | **mock** | local secret stub; the real broker/KMS is Camp-only ([Plan 21](../authoring-resources-wiring.md#plan-21)) |
| Cross-cloud mTLS handshake | **camp-only** | needs two real providers + SVID federation ([Plan 12](../security-networking.md#plan-12)) |
| Real quotas / runaway-spend limits | **camp-only** | provider/plan limits are real-environment ([ADR-0039](04-governance-verification.md#adr-0039)) |
| Provider drift / failure modes | **camp-only** | only a real provider exhibits real drift ([Plan 5](../reliability-observability-cost.md#plan-05)) |

### Alternatives considered
- **Best-effort emulation, no formal matrix.** Rejected: silent fidelity gaps make "works locally" stop predicting prod — the footgun #17 names.
- **Camp-first (little local fidelity).** Rejected: destroys the fast offline inner loop ([Plan 7](../developer-experience.md#plan-07)) + zero-cloud onboarding.
- **Silent fidelity (no labels).** Rejected: a developer can't tell a real local pass from a mocked one; the label + `hobo verify` split is what makes a local pass trustworthy.
- **Make everything simulate-real (full local prod emulation).** Rejected: infeasible (real cloud IAM, cross-cloud mTLS, provider quotas can't be faithfully reproduced on a laptop) and would over-promise.

### Consequences
- **(+)** "Works locally" becomes a *bounded, honest* promise: correctness-determining behaviors are real locally, environmental ones are clearly mocked, and the rest is explicitly Camp-gated — with `hobo verify` enforcing the distinction.
- **(+)** Reuses the conformance suite + `hobo verify` ([Plan 9](../verification.md#plan-09)) — the only new surface is a per-check `local|camp` tag + a per-capability fidelity label.
- **(+)** Aligns local-fidelity with the air-gap work ([ADR-0036](#adr-0036)): the same local models/stubs power both dev and air-gap.
- **(−)** Maintaining the matrix + labels as capabilities evolve is ongoing discipline; a mislabeled capability re-introduces the false-promise risk.
- **(−)** Mocked behaviors (IAM, latency, secrets) still need a Camp run before prod confidence — `hobo verify` makes that explicit but doesn't remove the step.

## ADR-0073
**Swappable integration ports: identity, artifacts, work-tracking & knowledge.**

- **Origin:** the ask — make **auth providers swappable** (WorkOS / Auth0 / Supabase Auth / Entra by default), the **artifact repositories configurable** (npm / NuGet / PyPI / OCI…), and *consider* **issue trackers** (JIRA / GitHub Issues / Linear) and **project-knowledge** stores (Confluence / Obsidian / Wikis). Designed via brainstorming; decision: full ports for identity + artifacts, **named extension seams** for trackers + knowledge.

### Context
HoBo's whole model is **ports over platforms** — a capability is a WIT port, backends are swappable adapters, Matching/the Dispatcher consider **only the registered** ones ([ADR-0033](05-config-matching-environments.md#adr-0033)/[ADR-0071](05-config-matching-environments.md#adr-0071)), credentials are **secretless-brokered** ([ADR-0027](02-identity-security.md#adr-0027)), decisions are **policy-gated** ([Plan 29](../contracts-policy-flags.md#plan-29)), adapters are **conformance-gated + Forge-generatable** ([Plan 9](../verification.md#plan-09)/[ADR-0010](06-ai-generation-operators.md#adr-0010)), and **portability is never gated** by one backend ([ADR-0024](#adr-0024)). The meta-cloud's *external touchpoints* — who authenticates, where build artifacts live, where work is tracked, where knowledge lives — must follow the same pattern, not hard-wire a vendor. End-user **auth** is already such a port ([ADR-0038](02-identity-security.md#adr-0038)) but its default adapter set was unnamed; the others were undecided. The scope guard ([ADR-0064](08-scope-and-requirements.md#adr-0064)) applies: these are **operational integrations**, not app-business/SaaS functions — work-tracking/knowledge are framed as the surface the **Operator Agents** ([Plan 40](../operators-sre.md#plan-40)) drive (and that app code may also call, like `notify`), never a billing/CRM-style product feature.

### Decision
1. **Integration ports are a uniform category — port + default adapter set, only-registered-considered.** Each external touchpoint is a WIT port with a named default adapter set; Matching/the Dispatcher select among **only the adapters the developer/platform registered**; all are secretless-brokered ([ADR-0027](02-identity-security.md#adr-0027)), policy-gated ([Plan 29](../contracts-policy-flags.md#plan-29)), conformance-gated + Forge-generatable ([Plan 9](../verification.md#plan-09)/[ADR-0010](06-ai-generation-operators.md#adr-0010)), and **never gate portability** ([ADR-0024](#adr-0024)). Adding one never edits app code.
2. **Auth (`hobo:auth`) — default adapter set named.** The federate+verify port ([ADR-0038](02-identity-security.md#adr-0038)) ships default adapters for **WorkOS · Auth0 · Supabase Auth · Microsoft Entra ID**, alongside the existing Google/GitHub/Clerk/customJwt + the thin dev built-in. Provider choice is per-Camp/Yard Matching; the unified `PrincipalRef`/policy-plane authz path is unchanged.
3. **Artifact repository (`hobo:artifact-repo`) — new configurable port.** The package/artifact repositories HoBo **builds against and publishes to**: default adapters **npm · NuGet · PyPI · OCI** (+ Maven/cargo/RubyGems). It serves dependency **pulls** (build inputs) and **publishes** outputs — language packages and the **component OCI images** `@hobo/componentize` already produces ([Plan 20](../wasm-runtime-wit.md#plan-20)). Configurable per Camp/Yard; **mirrorable for air-gap** (generalizes the in-boundary OCI mirror, [ADR-0036](#adr-0036), to any artifact repo via signed bundle import); **SLSA provenance on publish** ([ADR-0010](06-ai-generation-operators.md#adr-0010)); creds brokered, never static. Where multiple equivalent mirrors are registered, the **Dispatcher** ([ADR-0071](05-config-matching-environments.md#adr-0071)) may cost/latency-route pulls/pushes across them.
4. **Issue trackers + project knowledge — named, Forge-generatable extension seams (operator-facing), not fully specified this round.**
   - **`issue-tracker`** — default adapters **JIRA · GitHub Issues · Linear**. The surface the **Crew** drives: the SRE syncs an **Incident** ([ADR-0058](06-ai-generation-operators.md#adr-0058)) → a ticket, postmortems-by-replay open tickets, the SWE files repair issues, GitOps links deploys.
   - **`knowledge`** — default adapters **Confluence · Obsidian · Wikis** (MediaWiki/etc.). Where operators/agents read & write project knowledge: runbooks + postmortems published, design notes, and the Forge reads docs as **material/oracle** inputs ([ADR-0010](06-ai-generation-operators.md#adr-0010)). *Distinct from gbrain (dev-time agent memory).*

   Both reuse the **`notify`/receiver-port pattern** ([ADR-0059](03-data-plane.md#adr-0059) — one port, swappable adapters, secretless, policy-gated); operator writes ride `crew.ActionApplied` + `policy.Decided` ([Plan 40](../operators-sre.md#plan-40)/[Plan 29](../contracts-policy-flags.md#plan-29)). They join the enumerated patchability seams ([ADR-0057](#adr-0057)); full surface/events are a later round.
5. **No new event families.** Auth rides `user.*`/`session.*` ([ADR-0038](02-identity-security.md#adr-0038)); artifact pulls/publishes ride `exec.*`/`pipeline.*` ([Plan 11](../event-model.md#plan-11)) with provenance on the artifact; tracker/knowledge writes ride `crew.*`/`policy.Decided`.

### Alternatives considered
- **Hard-wire a single vendor per concern** (only OCI, only GitHub Issues, etc.). Rejected: contradicts ports-over-platforms + non-limiting providers ([ADR-0024](#adr-0024)/[ADR-0033](05-config-matching-environments.md#adr-0033)); a user-controlled registered set is the whole point.
- **Fully specify issue-tracker + knowledge now** (events + full surface). Rejected this round: the category + default adapters + the reuse pattern make them real and Forge-generatable without adding surface to an already-consolidated suite before there's a concrete consumer beyond the Crew.
- **Model work-tracking/knowledge as app-business features.** Rejected: reopens the [ADR-0064](08-scope-and-requirements.md#adr-0064) business-scope cut; they are operational integrations the operators drive (and app code may call), like `notify` — not a product/CRM surface.
- **A bespoke integration framework per category.** Rejected: each is a port + adapters over the existing secretless/policy/conformance/Forge machinery; no new framework earns its keep.

### Consequences
- **(+)** The meta-cloud's external touchpoints are uniformly swappable and user-controlled: register WorkOS *or* Entra, npm *and* an internal mirror, JIRA *or* Linear — HoBo routes among only what you registered, with no app-code change and Forge-fillable gaps.
- **(+)** Reuses everything — the `auth` port ([ADR-0038](02-identity-security.md#adr-0038)), the `notify`/receiver pattern ([ADR-0059](03-data-plane.md#adr-0059)), secretless brokering ([ADR-0027](02-identity-security.md#adr-0027)), Matching/Dispatcher ([ADR-0033](05-config-matching-environments.md#adr-0033)/[ADR-0071](05-config-matching-environments.md#adr-0071)), air-gap mirroring ([ADR-0036](#adr-0036)), SLSA/Forge ([ADR-0010](06-ai-generation-operators.md#adr-0010)) — net-new is a `hobo:artifact-repo` port + two named seams, no new events.
- **(+)** Keeps the scope cut honest: trackers/knowledge are operator integrations, not business features ([ADR-0064](08-scope-and-requirements.md#adr-0064)).
- **(−)** Each registered adapter is a maintained, conformance-covered surface (auth/IdP quirks, artifact-repo auth + retention, eventual tracker/knowledge APIs); breadth is bounded by conformance + Forge generation, not free.
- **(−)** Naming issue-tracker + knowledge without full specs leaves their event/surface detail for a later round — a deliberate gap `hobo doctor` can flag where an operator path needs them.

## ADR-0075
**Interface stability tiers + a statically-evaluable provider Capability Spec (with the preview `wasi:websocket`).**

- **Origin:** WebSockets need support, but **no `wasi:websocket` standard is approved** — HoBo must ship a **preview** aligned with the likely-approved shape and migrate cleanly later. More generally, providers need a **capability spec HoBo can statically evaluate** to determine whether a capability (like the websocket preview) is available, before deploy. Designed via brainstorming; decisions: the **preview `wasi:websocket` is the core** interface (`hobo:websocket` shrinks to a thin extension), and preview/experimental usage is **advisory + org-guardrail-gateable**.

### Context
HoBo prefers standard `wasi:*` interfaces and authors `hobo:*` only for gaps ([Plan 20](../wasm-runtime-wit.md#plan-20)), pins exact `namespace:package@semver` versions, and absorbs upstream draft churn behind pins + compat shims ([Plan 20](../wasm-runtime-wit.md#plan-20)/[ADR-0024](#adr-0024)). It already has a **Capability Manifest** ([ADR-0009](02-identity-security.md#adr-0009): `capabilities/auth/cost.json` signs) and **static, compile-time capability feedback** ([ADR-0033](05-config-matching-environments.md#adr-0033) §6: an unsupported capability is flagged at author time with a remediation). Two gaps: (1) **WebSockets** are listed as a building block ([Plan 20](../wasm-runtime-wit.md#plan-20)) via a HoBo-authored `hobo:websocket`, but the *standard* `wasi:websocket` doesn't exist — WASI standardizes per-protocol sockets-family modules independently and 0.3 adds native async, so a websocket interface will most likely be a `wasi:`-namespaced, sockets-family interface over `wasi:io` streams; HoBo needs a preview now without forking from that future. (2) The Capability Manifest declares capabilities too coarsely to **statically determine availability of a specific `interface@version` and its stability** — exactly what a preview interface needs ("is `wasi:websocket@preview` available on a registered provider, and is it safe for prod?").

### Decision
1. **Every WIT interface carries a stability tier.** `stable · preview · experimental · deprecated`, declared alongside its `namespace:package@semver` ([Plan 20](../wasm-runtime-wit.md#plan-20)). `preview` = tracks an expected-but-unratified standard (pinned, breaking changes possible, migrated via upcaster); `experimental` = HoBo-incubated, may be withdrawn; `deprecated` = scheduled for removal with a migration. Stability + version are recorded in the **manifest IR** ([Plan 21](../authoring-resources-wiring.md#plan-21)) per import/export.
2. **A preview `wasi:websocket` is the core websocket interface; `hobo:websocket` shrinks to a thin extension.** HoBo vendors + pins **`wasi:websocket@0.0.x-draft`** (`preview`), modeled on the WASI **sockets-family** shape over **`wasi:io` streams** (0.3-async-ready), with server-accept (via `wasi:http` connection upgrade) + client-connect exchanging messages over input/output streams. `hobo:websocket` is reduced to the HoBo-specifics the bare interface won't carry — **principal/`ctx.user` binding** ([ADR-0038](02-identity-security.md#adr-0038)), **`.allow()` verbs** (`accept`/`connect`/`send`/`broadcast`/`subscribe`), connection **addressing + channel fan-out** (`send-to`/`join`/`broadcast`), and **event-sourced connection lifecycle** (the **`ws.*`** family — `Connected`/`Authenticated`/`Subscribed`/`Unsubscribed`/`Disconnected`, [Plan 11](../event-model.md#plan-11); per-frame messages ride the Streamer, not the log). The fuller interface reference is in [Plan 20](../wasm-runtime-wit.md#plan-20). Each ships a `@hobo/conformance` suite ([Plan 9](../verification.md#plan-09)). When the real `wasi:websocket` is ratified, HoBo tracks it and migrates via the existing **upcaster/compat-shim** ([ADR-0024](#adr-0024)) — apps don't rewrite. (Resolves the [Plan 20](../wasm-runtime-wit.md#plan-20) "upstream websocket as a `wasi:*` proposal" iteration hook.)
3. **The provider Capability Spec is the statically-evaluable declaration of implemented `interface@version@stability`.** The Capability Manifest's `capabilities` ([ADR-0009](02-identity-security.md#adr-0009)) is formalized to list, per provider, the **exact WIT `interface@semver` it implements, each with its stability tier and the `@hobo/conformance` suite version it passed** (+ the existing capability hints/`cost.json`). This is the spec HoBo "leverages to statically determine if things are available."
4. **Static availability resolution at author/compile time** ([ADR-0033](05-config-matching-environments.md#adr-0033) §6). Against the registered providers' Capability Specs, the SDK/Matching resolve each used interface: **available `stable`** → ok; **available only via `preview`/`experimental`** → a **compile-time warning** ("pinned, may change") surfaced through codegen ([ADR-0037](05-config-matching-environments.md#adr-0037)) + `hobo doctor`; **unavailable** → a **compile-time error + remediation** (use a registered provider that implements it, or Forge-generate the adapter, [Plan 23](../forge-generated-stack.md#plan-23)) — backed by the hard deploy-path `require`-miss `deployment.PlanRejected` ([ADR-0033](05-config-matching-environments.md#adr-0033)). Determinism is unchanged: this is a pure function of the catalog snapshot.
5. **Stability is governable** ([ADR-0074](02-identity-security.md#adr-0074)). An org may set a **mandatory guardrail** — e.g. *"no `preview`/`experimental` interfaces in prod"* — turning the advisory warning into a hard, audited deny at `can-deploy`; absent such a guardrail, preview usage is advisory (warn, don't block). The websocket preview is thus usable today, and lockable by orgs that require only `stable` interfaces in production.

### Alternatives considered
- **Author `hobo:websocket` as the permanent interface (ignore the future `wasi:websocket`).** Rejected: forks HoBo from the likely standard, so apps would need a real migration later; a pinned `preview` that *tracks* the expected shape migrates via upcaster instead.
- **Wait for the ratified `wasi:websocket`.** Rejected: WebSockets are needed now and the standard isn't close; the `preview` tier exists exactly so HoBo can ship ahead of ratification, honestly labeled.
- **A new capability-spec artifact separate from the Capability Manifest.** Rejected: the Manifest ([ADR-0009](02-identity-security.md#adr-0009)) already *is* the capability declaration; formalizing its `capabilities` to `interface@version@stability` reuses the Registry/discovery path rather than inventing a parallel spec.
- **Resolve availability only at deploy time.** Rejected: the value is catching "this provider can't do websockets" at *author* time with a remediation ([ADR-0033](05-config-matching-environments.md#adr-0033) §6); deploy-time `require`-miss remains the hard backstop.
- **Hard-block all preview/experimental in prod by default.** Rejected as the default: too much friction for teams that want preview features; the org-guardrail makes blocking an explicit, auditable choice, not a global default.

### Consequences
- **(+)** WebSockets are supported now via a preview that aligns with the likely-ratified `wasi:websocket`, with a clean upcaster migration and no app rewrite — and the catalog's websocket row is honestly labeled `preview`.
- **(+)** "Is capability X available?" is answerable **statically, before deploy**, for any interface — with preview-awareness + a remediation — reusing the Capability Manifest ([ADR-0009](02-identity-security.md#adr-0009)), static feedback ([ADR-0033](05-config-matching-environments.md#adr-0033)), versioning/conformance ([ADR-0024](#adr-0024)/[Plan 9](../verification.md#plan-09)), and codegen ([ADR-0037](05-config-matching-environments.md#adr-0037)); net-new is a stability tier per interface + the `interface@version@stability` precision in the manifest.
- **(+)** Stability composes with org governance ([ADR-0074](02-identity-security.md#adr-0074)): enterprises that allow only `stable` interfaces in prod express it as one mandatory guardrail.
- **(−)** Every interface now carries a maintained stability tier + per-version conformance suite; a mislabeled tier misleads the static check (mitigated: the tier is part of the conformance-gated published interface, not free-text).
- **(−)** A `preview` interface can break on a version bump; HoBo must ship the upcaster + bump the pin, and apps pinned to the preview accept that churn (the honest cost of shipping ahead of a standard).
- **(−)** Capability-Spec accuracy depends on providers declaring truthfully; conformance ([Plan 9](../verification.md#plan-09)) is the check — a provider claiming `wasi:websocket@preview` must pass its suite or the claim is rejected.
