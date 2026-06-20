# Plan 8 — Roadmap / phasing

> Part of the [HoBo Design Plan Suite](./README.md). Phased so each milestone is independently demoable and de-risks the next. Each phase names its exit criterion ("done when…").

> **Stepwise breakdown:** each phase below is fully expanded — every workstream and step — under [`phases/`](./phases/README.md) ([P0](./phases/P0-foundations.md) · [P1](./phases/P1-sdk-local.md) · [P2](./phases/P2-first-deploy.md) · [P3](./phases/P3-ai-native.md) · [P4](./phases/P4-multi-provider.md) · [P5](./phases/P5-forge.md) · [P6](./phases/P6-ha-finops-ux.md)).

> **v3 (Humanitec) placement:** **Resource Definitions + Matching** + the **Driver** taxonomy land in **P2** (the Planner resolves via definitions; mapping is sugar) and deepen in **P4** (per-env definitions across clouds); **Deployment Sets/Deltas** + environment types/cloning/ephemeral land in **P2→P4**; the **Agent** + **GitOps publisher** in **P3/P4**; **Pipelines** + **Resource Packs** + **Workload Profiles** in **P4/P6**. See [Plan 25](./25-resource-definitions-matching.md)–[Plan 28](./28-agent-gitops-pipelines.md).

| Phase | Theme | Key deliverables | Done when… |
|---|---|---|---|
| **P0** | Foundations | monorepo ([1](./01-monorepo.md)); `@hobo/core` types + all port interfaces; event envelope + catalog ([11](./11-event-model.md)); Hobo Code schema ([6](./06-ai-native-agent-auth.md)); `@hobo/conformance` skeleton; `@hobo/world-local` built-in engine | local World passes World-port conformance; an event log replays |
| **P1** | SDK on local World | `bindle()` + resources + `workflow`/`step`/`actor`/`saga`/`agent`; `hobo dev`; `examples/hello-bindle` | example runs offline; `replay == state` determinism test green ([2](./02-sdk-api.md),[9](./09-verification-open-questions.md)) |
| **P2** | First real deploy | one provider (Cloudflare or Fly) via `@hobo/iac-pulumi`; `hobo plan`/`deploy`; Yard MVP (single-node, `world-postgres`); event-sourced deployment lifecycle ([4](./04-control-plane.md)) | a Bindle deploys to one real cloud and survives a Yard restart mid-deploy |
| **P3** | AI-native core | Identity (SVID/OIDC) + Registry + Hobo Code ingest; keyless token brokering; `@hobo/mcp` surface; durable `agent()` | an agent deploys via MCP using only brokered tokens; credential audit present ([6](./06-ai-native-agent-auth.md)) |
| **P4** | Multi-provider | AWS + Azure providers; mapping rules (whole-app / per-tier / per-boundary) + provider-specific `.with(...)`; cross-provider networking ([13](./13-networking-connectivity.md)) | `examples/multi-cloud-shop`: one Bindle on two clouds; cross-cloud mTLS works |
| **P5** | Forge | AI-generated providers gated by `@hobo/conformance`; signing + provenance ([6](./06-ai-native-agent-auth.md),[12](./12-security-multitenancy.md)) | `hobo forge <url>` produces a certified provider that passes conformance |
| **P6** | HA, FinOps & UX | reliability/HA algorithms ([5](./05-reliability-ha.md)); deployment strategies; cost model + budgets ([16](./16-cost-finops.md)); dashboard ([7](./07-ui-dashboard.md)); multi-region | canary auto-rollback works; plan-time cost estimate within tolerance; DR rebuild from log < target RTO |

## Success metrics (north-star signals)
- **Time-to-first-deploy** (scaffold → running on a real cloud) — target minutes, not hours.
- **"Same Bindle, N clouds"** — number of providers a single unedited example deploys to.
- **Zero-secret rate** — % of provider access via brokered/federated tokens vs static keys (target ~100%).
- **Agent-completable lifecycle** — % of deploy/operate tasks an agent can do via MCP unaided.
- **Forge yield** — % of requested providers auto-generated that pass conformance.
- **Recovery** — deploy resume time after node loss; projection-rebuild time.

## Sequencing rationale
P0–P2 prove the *agnostic deploy* thesis on one cloud; P3 proves the *AI-native* thesis; P4 proves *true multi-provider*; P5 proves *extensibility without a community*; P6 hardens for production. The risky/novel bets (Forge, multi-region HA) come after the core loop is demonstrably solid.
