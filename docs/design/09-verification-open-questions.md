# Plan 9 — Verification, testing & open questions

> Part of the [HoBo Design Plan Suite](./README.md). How we prove each plan works when implemented, and the cross-cutting questions still open.

> **v2 update.** Conformance is now **per WIT world** ([Plan 20](./20-wasm-wasi-runtime.md)) and is the gate for both human- and Forge-generated **providers and implementations** ([Plan 23](./23-stubbable-ai-implementations.md)). Add: a **stub/replay test** (run with stubs, then assert an AI-generated impl reproduces recorded traces + passes conformance) and an **IfC-collection test** (collected manifest matches a fixture). New open questions: wasm host of record, `hobo:*` WIT versioning, IfC fidelity for non-TS languages, and the "low-risk auto live-fix" threshold.

## Testing strategy (the pyramid)
1. **Unit** — pure functions (the Planner, upcasters, capability negotiation) tested in isolation. The Planner being pure ([Plan 3](./03-providers-iac.md)) makes provider-resolution fully unit-testable without a cloud.
2. **Conformance (contract) tests** — `@hobo/conformance` is the centerpiece (below).
3. **Integration** — SDK + built-in World + a real-but-local provider (containers) exercise deploy→run→inspect.
4. **E2E** — full Yard + one real cloud provider, gated and periodic (cost-aware).
5. **Determinism/replay** — every durable run asserts `replay == live state`.

## `@hobo/conformance` — the trust boundary
A shared, executable contract test suite per **port** (World ports and Provider capability ports). It is what lets human- *and* Forge-generated adapters be trusted ([Plan 6](./06-ai-native-agent-auth.md)).
- **Per World port:** EventStore (append/read/optimistic-concurrency/idempotent-dedup), Queue (at-least-once + dedup), Streamer, ActorHost (lease + fencing under contention), Clock (durable timers, deterministic replay).
- **Per Provider capability:** e.g. `database` must provision, accept connections via the agnostic client, honor `require`/`prefer`, `refresh()` report drift, and `destroy()` cleanly — same assertions whether AWS, Azure, or a Forge-generated provider.
- **Gate:** an adapter may only claim a port/capability it passes; CI blocks publishing otherwise; the Forge runs this suite sandboxed before certifying.

## Per-plan verification
- **SDK ([2](./02-sdk-api.md))** — `examples/hello-bindle` runs on `world-local`: a workflow + actor + saga execute; killing/restarting resumes; **replay reproduces identical state** (determinism test); types compile with provider options.
- **Providers/IaC ([3](./03-providers-iac.md))** — `examples/multi-cloud-shop` deploys the *same* Bindle to two providers via mapping rules; assert provider-specific `.with(...)` options only affect the resolved provider; Planner rejects an unsatisfiable `require` with a precise reason.
- **Control plane/HA ([4](./04-control-plane.md),[5](./05-reliability-ha.md))** — kill the Yard mid-deploy → resumes from the log; inject a provisioning failure past the no-go threshold → saga compensation rolls back in reverse-dependency order; partition an actor owner → fencing rejects its stale writes; canary regression → auto-rollback.
- **Event model ([11](./11-event-model.md))** — rebuild every projection from zero == live projection (proves the log is authoritative); old events replay through upcasters.
- **Agent auth ([6](./06-ai-native-agent-auth.md))** — an agent obtains a short-lived provider token via OIDC federation (no static secrets), provisions a resource, and the `token.*` events exist + the run is replayable; a high-risk action blocks on a policy gate.
- **Security ([12](./12-security-multitenancy.md))** — cross-tenant read attempts fail at the Gateway and the store; an Executor has no egress beyond its scoped target; an unsigned plugin is refused by the Registry.
- **Networking ([13](./13-networking-connectivity.md))** — cross-provider services connect over mTLS keyed by SVIDs; the topology graph reports the correct connectivity tier + egress.
- **Cost ([16](./16-cost-finops.md))** — `hobo plan` estimate is within tolerance of a known fixture; a budget breach blocks or requires approval.
- **MCP/DX ([15](./15-cli-dx.md))** — a real agent drives `plan`→`deploy`→`inspect_run` through `@hobo/mcp`; `hobo dev` runs the agnostic path with zero cloud.

## CI/CD for HoBo itself
- Monorepo CI ([Plan 1](./01-monorepo.md)): typecheck, unit, conformance (built-in adapters), determinism; Changesets-driven publishing; SBOM + vuln scan gate ([Plan 12](./12-security-multitenancy.md)).
- A SessionStart hook ensures web sessions can run tests/linters (project setup).

## Open questions to resolve in iteration
1. **Hobo Code standard:** open spec aligned with MCP-auth / OAuth-OBO / SPIFFE, or HoBo-proprietary first then standardize? ([6](./06-ai-native-agent-auth.md))
2. **Compiler magic:** depth of a build-time transform for `"use workflow"`/`"use step"` vs pure runtime wrappers? ([2](./02-sdk-api.md))
3. **Planner intelligence:** rules vs cost/constraint solver vs LLM-assisted selection, and the default objective. ([3](./03-providers-iac.md),[16](./16-cost-finops.md))
4. **Default first provider** for P2 (Cloudflare vs Fly vs a local Docker provider). ([8](./08-roadmap.md))
5. **Built-in engine scope:** how much of Temporal/Restate we reimplement in `world-local` vs always recommending an external World in prod. ([2](./02-sdk-api.md),[5](./05-reliability-ha.md))
6. **Consensus / multi-region:** own Raft vs delegate; active-active vs active-passive. ([5](./05-reliability-ha.md))
7. **Overlay-mesh tech** for cross-provider connectivity. ([13](./13-networking-connectivity.md))
8. **Policy language** for guardrails/ABAC (typed TS vs Rego/CEL). ([12](./12-security-multitenancy.md))
9. **Governance/license** for OSS core + the hosted Yard business model. ([0](./00-vision.md),[17](./17-positioning-competitive.md))
