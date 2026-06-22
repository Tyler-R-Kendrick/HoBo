# Plan 9 — Verification, testing & open questions

> Part of the [HoBo Design Plan Suite](./README.md). How we prove each plan works when implemented, and the cross-cutting questions still open.

> **v3 (Humanitec):** add **Driver** conformance suites ([Plan 27](./27-drivers-packs-profiles.md)) and a **matching test** (given context + a set of Resource Definitions, assert the expected one wins and a `match.Decided` event records the score, [Plan 25](./25-resource-definitions-matching.md)) and a **Delta→Set** test (a delta applied yields the expected immutable Set, [Plan 26](./26-environments-deltas.md)).

> **v4 (gates):** **conformance** here is the *provider* contract (does an impl satisfy a port); the *consumer-driven* compatibility check (`can-deploy`, [Plan 29](./29-contracts-compatibility.md)) is distinct — add a **compatibility test** (producer/consumer version skew → `compat.GateFailed`), a **policy-decision test** ([Plan 30](./30-policy-plane.md): assert effect + obligations for a given request), and an **eval-gate test** ([Plan 23](./23-stubbable-ai-implementations.md)). `hobo verify` composes all of these.

> **v2 update.** Conformance is now **per WIT world** ([Plan 20](./20-wasm-wasi-runtime.md)) and is the gate for both human- and Forge-generated **providers and implementations** ([Plan 23](./23-stubbable-ai-implementations.md)). Add: a **stub/replay test** (run with stubs, then assert an AI-generated impl reproduces recorded traces + passes conformance) and an **IfC-collection test** (collected manifest matches a fixture). New open questions: wasm host of record, `hobo:*` WIT versioning, IfC fidelity for non-TS languages, and the "low-risk auto live-fix" threshold.

## Testing strategy (the pyramid)
1. **Unit** — pure functions (the Planner, upcasters, capability negotiation) tested in isolation. The Planner being pure ([Plan 3](./03-providers-iac.md)) makes provider-resolution fully unit-testable without a cloud.
2. **Conformance (contract) tests** — `@hobo/conformance` is the centerpiece (below).
3. **Integration** — SDK + built-in runtime + a real-but-local provider (containers) exercise deploy→run→inspect.
4. **E2E** — full Yard + one real cloud provider, gated and periodic (cost-aware).
5. **Determinism/replay** — every durable run asserts `replay == live state`.

## `@hobo/conformance` — the trust boundary
A shared, executable contract test suite per **port** (runtime ports and Provider capability ports). It is what lets human- *and* Forge-generated adapters be trusted ([Plan 6](./06-ai-native-agent-auth.md)).
- **Per runtime port:** EventStore (append/read/optimistic-concurrency/idempotent-dedup), Queue (at-least-once + dedup), Streamer, ActorHost (lease + fencing under contention), Clock (durable timers, deterministic replay).
- **Per Provider capability:** e.g. `database` must provision, accept connections via the agnostic client, honor `require`/`prefer`, `refresh()` report drift, and `destroy()` cleanly — same assertions whether AWS, Azure, or a Forge-generated provider.
- **Gate:** an adapter may only claim a port/capability it passes; CI blocks publishing otherwise; the Forge runs this suite sandboxed before certifying.

## Per-plan verification
- **SDK ([2](./02-sdk-api.md))** — `examples/hello-bindle` runs on `runtime-local`: a workflow + actor + saga execute; killing/restarting resumes; **replay reproduces identical state** (determinism test); types compile with provider options.
- **Providers/IaC ([3](./03-providers-iac.md))** — `examples/multi-cloud-shop` deploys the *same* Bindle to two providers via mapping rules; assert provider-specific `.with(...)` options only affect the resolved provider; Planner rejects an unsatisfiable `require` with a precise reason.
- **Control plane/HA ([4](./04-control-plane.md),[5](./05-reliability-ha.md))** — kill the Yard mid-deploy → resumes from the log; inject a provisioning failure past the no-go threshold → saga compensation rolls back in reverse-dependency order; partition an actor owner → fencing rejects its stale writes; canary regression → auto-rollback.
- **Event model ([11](./11-event-model.md))** — rebuild every projection from zero == live projection (proves the log is authoritative); old events replay through upcasters.
- **Agent auth ([6](./06-ai-native-agent-auth.md))** — an agent obtains a short-lived provider token via OIDC federation (no static secrets), provisions a resource, and the `token.*` events exist + the run is replayable; a high-risk action blocks on a policy gate.
- **Security ([12](./12-security-multitenancy.md))** — cross-tenant read attempts fail at the Gateway and the store; an Executor has no egress beyond its scoped target; an unsigned plugin is refused by the Registry.
- **Networking ([13](./13-networking-connectivity.md))** — cross-provider services connect over mTLS keyed by SVIDs; the topology graph reports the correct connectivity tier + egress.
- **Cost ([16](./16-cost-finops.md))** — `hobo plan` estimate is within tolerance of a known fixture; a budget breach blocks or requires approval.
- **MCP/DX ([15](./15-cli-dx.md))** — a real agent drives `plan`→`deploy`→`inspect_run` through `@hobo/mcp`; `hobo dev` runs the agnostic path with zero cloud.
- **WASM/WASI runtime ([20](./20-wasm-wasi-runtime.md),[24](./24-wit-worlds-reference.md))** — a TS service builds to a component via jco; conformance runs **per WIT world**; swapping a provider behind a port is a link change (no recompile); deny-by-default holds (an un-linked capability call fails).
- **Resources/IfC ([21](./21-resources-catalog.md),[22](./22-wiring-manifest.md))** — `hobo collect` emits a **manifest** matching a fixture; `.allow()` produces exactly the expected IAM + link + token-scope triple; a missing verb is denied on all three.
- **Stubbable/AI ([23](./23-stubbable-ai-implementations.md))** — run with a `stub()` behind a port, record traces, then assert a Forge-generated implementation **passes conformance and reproduces the recorded traces**; a simulated SLO regression drives a **gated** live-fix that auto-rolls-back on failure.

## CI/CD for HoBo itself
- Monorepo CI ([Plan 1](./01-monorepo.md)): typecheck, unit, conformance (built-in adapters), determinism; Changesets-driven publishing; SBOM + vuln scan gate ([Plan 12](./12-security-multitenancy.md)).
- A SessionStart hook ensures web sessions can run tests/linters (project setup).

## Open questions to resolve in iteration
1. **Hobo Code standard:** open spec aligned with MCP-auth / OAuth-OBO / SPIFFE, or HoBo-proprietary first then standardize? ([6](./06-ai-native-agent-auth.md))
2. **Compiler magic:** depth of a build-time transform for `"use workflow"`/`"use step"` vs pure runtime wrappers? ([2](./02-sdk-api.md))
3. **Planner intelligence:** rules vs cost/constraint solver vs LLM-assisted selection, and the default objective. ([3](./03-providers-iac.md),[16](./16-cost-finops.md))
4. **Default first provider** for P2 (Cloudflare vs Fly vs a local Docker provider). ([8](./08-roadmap.md))
5. **Built-in engine scope:** how much of Temporal/Restate we reimplement in `runtime-local` vs always recommending an external runtime in prod. ([2](./02-sdk-api.md),[5](./05-reliability-ha.md))
6. **Consensus / multi-region:** own Raft vs delegate; active-active vs active-passive. ([5](./05-reliability-ha.md))
7. **Overlay-mesh tech** for cross-provider connectivity. ([13](./13-networking-connectivity.md))
8. **Policy language** for guardrails/ABAC (typed TS vs Rego/CEL). ([12](./12-security-multitenancy.md))
9. **Governance/license** for OSS core + the hosted Yard business model. ([0](./00-vision.md),[17](./17-positioning-competitive.md))
10. ~~**Wasm host of record**~~ — **RESOLVED by [ADR-0031](./adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)** ([Plan 20](./20-wasm-wasi-runtime.md) §Hosts): **Wasmtime** for `runtime-local`/dev, and a **`component-host` port** whose **v1 prod default is wasm-in-container** (reuses the OCI pipeline → zero new infra), with **SpinKube / wasmCloud-lattice / provider-native** as opt-in **per-Camp** adapters certified by the host conformance suite. (Remaining sub-items: the host conformance assertions + the lattice cross-host link semantics — tracked as Plan 20 iteration hooks.)
11. **`hobo:*` WIT world naming/versioning** + how aggressively to track upstream `wasi:*` draft churn; which `hobo:*` worlds to upstream as `wasi:*` proposals. ([24](./24-wit-worlds-reference.md))
12. **IfC-by-default fidelity for non-TS languages** — run-to-collect vs static analysis. ([21](./21-resources-catalog.md))
13. **"Low-risk auto" threshold** for AI live-fix, shared with the HA/security policy. ([23](./23-stubbable-ai-implementations.md),[5](./05-reliability-ha.md),[12](./12-security-multitenancy.md))
14. **Competitor-docs home** (`competitors/` top-level vs `docs/competitors/`) and the pattern for future competitors. ([competitors/nitric](../../competitors/nitric/README.md))

### Surfaced by the scope-refactor review (gaps to design next — [`plans/0001-scope-refactor-review.md`](../../plans/0001-scope-refactor-review.md))
15. **App-data schema evolution & cross-cloud migration** — the multi-cloud premise needs *data* portability, not just infra: versioned, event-sourced migrations declared in the Bindle and gated by `hobo verify` against the version running per Camp. Likely a new plan. ([26](./26-environments-deltas.md)/[21](./21-resources-catalog.md))
16. **Stateful storage consistency across Camps** — when a Bindle spans Camps (ADR-0028), is cross-Camp state a HoBo guarantee (event replication) or an app responsibility (CQRS-per-Camp + eventual consistency)? ([11](./11-event-model.md)/[12](./12-security-multitenancy.md)/[13](./13-networking-connectivity.md))
17. **Local-dev fidelity** — which prod behaviors `hobo dev` must *simulate* (networking tiers, mTLS, auth/ABAC, quotas, secret availability) vs *mock* vs *must-test-in-a-Camp*, so "works locally" predicts "works in prod". ([15](./15-cli-dx.md)/[13](./13-networking-connectivity.md))
18. **Billing, quota enforcement & cost attribution** — quota gates + runaway-spend circuit-breaker + chargeback/billing integration for the hosted Yard (go/no-go for the SaaS). ([16](./16-cost-finops.md))
19. **Migration / onboarding** from Lakebed (Capsule→Bindle), Terraform/Pulumi (import), and FaaS — bridge strategies so HoBo isn't greenfield-only. ([8](./08-roadmap.md)/[17](./17-positioning-competitive.md))
20. **Yard federation** — v1 assumes one Yard per tenant boundary; multi-Yard (multi-region/regulatory) federation of identity/policy/registry is deferred. ([4](./04-control-plane.md)/[12](./12-security-multitenancy.md))

### Surfaced by the competitor gap analysis ([`competitors/gap-analysis.md`](../../competitors/gap-analysis.md))
21. ~~**Reactive / live-query data model**~~ — **RESOLVED by [Plan 32](./32-reactive-live-queries.md)** ([ADR-0029](./adr/ADR-0029-reactive-live-query-model.md)): a `query()`/`"use query"` primitive + event-log reactor (hybrid source: native projections + opt-in DB change-feed), per-query consistent snapshot @ `seq` + reads-your-writes, client `useQuery()`. (Remaining sub-item: cross-Camp reactive queries, tracked under #16.)
22. **Search surface (vector + full-text)** — the `vector`/`search` ports exist ([21](./21-resources-catalog.md)) but indexing strategy, similarity operators, and filter syntax are undetailed (Convex ships this first-class).
23. **Custom domains & ingress depth** — custom-domain provisioning + multi-cloud DNS/CNAME under the `gateway` model is unspecified ([13](./13-networking-connectivity.md)); Nitric supports custom domains. (The **Forge generation pipeline** sub-item is now **RESOLVED by [Plan 33](./33-forge-generation-pipeline.md)** / [ADR-0030](./adr/ADR-0030-forge-generation-inputs-and-algorithm.md) — the candidate-generation/repair loop is specified end-to-end.)
