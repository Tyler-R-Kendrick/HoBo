# ADR-0028 — Multi-Camp deployment model (cardinality, naming, atomicity)

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Engineering, Product
- **Related:** [ADR-0026](./ADR-0026-scope-model-yard-camp-bindle.md) · [04 Control plane](../04-control-plane.md) · [05 Reliability](../05-reliability-ha.md) · [13 Networking](../13-networking-connectivity.md) · [26 Environments/Deltas](../26-environments-deltas.md) · [19 Worked example](../19-worked-example.md)
- **Origin:** design review of ADR-0026 surfaced unresolved cardinality/atomicity/naming questions ([`plans/0001-scope-refactor-review.md`](../../../plans/0001-scope-refactor-review.md)).

## Context
ADR-0026 made a **Camp** provider-specific and nested `Yard ⊃ Camp ⊃ Bindle`, but left three things ambiguous that a review flagged HIGH:
1. **Cardinality:** does one Bindle deploy to one Camp or many? The worked example ([19](../19-worked-example.md)) splits one app's resources across clouds.
2. **Naming:** `hobo.config.ts` keys Camps by environment (`prod`, `staging`), yet a Camp is "provider-specific" — so is `prod` or `prod-aws` the Camp?
3. **Atomicity:** Deployment Sets/Deltas/promote ([26](../26-environments-deltas.md)) are per-Camp; a multi-cloud `production` has no atomic promote/rollback unit.

## Decision
1. **A Camp is provider-specific; its canonical id is `<env>-<provider>`** (e.g. `prod-aws`, `prod-azure`, `staging-gcp`). A Camp carries an `environment type` ([25](../25-resource-definitions-matching.md)) and provides one provider's infra + one runtime backend.
2. **A Bindle deploys to one *or more* Camps.** Single-cloud = one Camp. Multi-cloud / hybrid = the **same Bindle deployed across several Camps** under one Yard. Resource→Camp placement is expressed in `hobo.config.ts` mapping (per-resource/per-tier), not in app code — preserving "no app edits to change where things run".
3. **Cross-Camp `bind` edges are Yard-wired.** When a `bind` connects resources that resolve to different Camps (e.g. `api`@`prod-aws` → `db`@`prod-azure`), the Yard provisions the cross-provider connectivity tier ([13](../13-networking-connectivity.md), mTLS by SVID) and governs it as cross-provider topology. The data plane still talks directly (the Yard is not on the request path).
4. **An "environment group" is the multi-cloud atomic unit (a Yard-level saga, not a new config layer).** A logical environment (e.g. `production` = {`prod-aws`, `prod-azure`}) groups its member Camps by `environment type`. `hobo deploy/promote/rollback --env production` runs a **choreographed saga** ([05](../05-reliability-ha.md)) over the member Camps' per-Camp Sets/Deltas, emitting `env.PromoteRequested → (per-Camp promote) → env.Promoted | env.PromoteRolledBack`; a member failure compensates the group (or proceeds if the member is marked `optional`). `--camp prod-aws` still targets a single Camp. The group is **orchestration over Camps, not a 4th scope noun**.

## Alternatives considered
- **One Bindle → exactly one Camp; multi-cloud handled entirely by the Planner inside a single "multi-provider Camp."** Rejected: makes a Camp not-actually-provider-specific (contradicts ADR-0026) and hides cross-provider cost/topology from the model.
- **Add a 4th config layer "Environment" (`Yard ⊃ Env ⊃ Camp ⊃ Bindle`).** Rejected: ADR-0026 deliberately kept environment a matching dimension; the group is a thin saga, not a persistent scope.
- **Name Camps by environment only (`prod`) and infer providers.** Rejected: hides the provider, breaks "provider-specific", and makes two `prod` Camps on different clouds indistinguishable.

## Consequences
- **(+)** Resolves cardinality (Bindle→1..N Camps), naming (`<env>-<provider>`), and atomicity (env-group saga reusing existing compensation). The worked example is now precise: splitting providers = deploying the Bindle to multiple Camps the Yard wires together.
- **(+)** Per-Camp Sets/Deltas/`can-deploy` are unchanged; the group composes them.
- **(−)** Requires `env.*` group-saga events + a group view in the dashboard, and a clear story for partial-success across clouds (covered by saga compensation + `optional` Camps).
- **(−)** Cross-Camp app boundaries inherit cross-provider latency/egress; the Planner still prefers colocation ([13](../13-networking-connectivity.md)/[16](../16-cost-finops.md)) and `hobo doctor` warns on accidental cross-cloud edges.
- **Follow-ups:** ~~stateful-data consistency across Camps~~ — **resolved by [ADR-0040](./ADR-0040-cross-camp-stateful-consistency.md)** (declared replication topology, single-writer-Camp default, event-log backbone, labeled bounded-staleness + write-goes-home); ~~app-data migration~~ — **resolved by [ADR-0032](./ADR-0032-data-portability-schema-versioning.md)** ([Plan 34](../34-app-data-migrations.md)).
