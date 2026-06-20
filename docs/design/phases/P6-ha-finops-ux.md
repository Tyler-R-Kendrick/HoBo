# Phase P6 — HA, FinOps & UX

> [Phases index](./README.md) · realizes [Plan 5](../05-reliability-ha.md), [Plan 16](../16-cost-finops.md), [Plan 7](../07-ui-dashboard.md), [Plan 14](../14-observability.md).

**Objective.** Production hardening: the reliability/HA algorithms, deployment strategies, the cost model, the full dashboard, and multi-region/DR.
**Depends on.** P4 (and P5 for evolution/live-fix integration).

> **v3 (Humanitec):** add **Pipelines** (rule-based triggers + approval gates, [Plan 28](../28-agent-gitops-pipelines.md)) and **Workload Profiles** ([Plan 27](../27-drivers-packs-profiles.md)); the dashboard gains the **Resource Graph / matching-decision / Delta-diff / Pipelines** views ([Plan 7](../07-ui-dashboard.md)); cost objective uses **env-type matching** to pick cheap variants ([Plan 16](../16-cost-finops.md)).

> **v4 (gates):** harden **obligations** as durable effects (require-canary/approval tracked to completion) and the **remediation/auto-fix** loop (classify failure → propose safe fix, gated) ([Plan 30](../30-policy-plane.md)/[Plan 23](../23-stubbable-ai-implementations.md)); the dashboard gains a **`hobo verify` / gate-decision** view (per-gate results + `explain-failure` replay).

## Workstream 1 — Reliability & HA ([Plan 5](../05-reliability-ha.md))
1. Actor availability: single-writer **leases + fencing tokens**, placement + failover.
2. Control-plane HA: event-store **replication (quorum)**, leader election for singletons.
3. Provider resilience: circuit breakers, retry budgets, bulkheads/backpressure per tenant+provider.
4. Drift loop: periodic resync + policy (`heal`/`propose`/`ignore`).

## Workstream 2 — Deployment strategies ([Plan 5](../05-reliability-ha.md))
1. Saga templates: **recreate / blue-green / canary / progressive**, with health-gated promotion + auto-rollback.
2. Wire health signals from the data plane (World metrics) + provider health checks into the gates.

## Workstream 3 — Cost & FinOps ([Plan 16](../16-cost-finops.md))
1. Plan-time **cost estimate** from `cost.json` × usage profile + egress per connectivity tier; show in `hobo plan`.
2. Planner cost objective (cost/latency/stay-on-one-cloud blend); record rationale.
3. **Budgets + spend-caps** as policy gates (incl. agent caps); showback per tenant/Bindle/Camp; optional carbon term.

## Workstream 4 — Dashboard (full) ([Plan 7](../07-ui-dashboard.md))
1. Build all views: deployments timeline (replay/time-travel), topology graph, run inspector (+ replay-diff), registry browser, **credential audit**, cost/FinOps, **link map** + **cross-WIT-call traces**, drift.
2. Inline plan-preview approval, policy-gate approvals, promote/rollback, live log/stream tail.

## Workstream 5 — Multi-region & DR ([Plan 5](../05-reliability-ha.md), [Plan 14](../14-observability.md))
1. Multi-region topology (active-active log vs active-passive) + cross-region log replication.
2. **DR = replay**: `hobo yard up --restore <log>` rebuilds the Yard + projections + actors.
3. SLOs + burn-rate alerting; OTLP export ([Plan 14](../14-observability.md)).

## Deliverables
- HA mechanisms; rollout saga templates; cost model + budgets; full dashboard; multi-region + DR.

## Exit criteria (acceptance)
- A **canary** with an injected health regression **auto-rolls-back**; blue/green flip + soak works.
- **Plan-time cost estimate** is within tolerance of a known fixture; a budget breach blocks or requires approval.
- Kill a Yard node → deploy resumes < target (lease TTL + tail replay); **DR rebuild** from replicated log < target RTO.
- Dashboard renders every view from projections only (no live-provider reads).

## Risks / iteration hooks
- Consensus choice (own Raft vs delegate to the World's store); RPO/RTO targets.
- Multi-region: active-active vs active-passive.
- Canary health-signal sources + the auto-rollback decision function.
