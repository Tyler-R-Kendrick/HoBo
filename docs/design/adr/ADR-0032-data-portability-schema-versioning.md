# ADR-0032 — Data portability & schema-versioning strategy

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 34 — App-data migrations](../34-app-data-migrations.md) · [Plan 21 — Resource catalog](../21-resources-catalog.md) (`sql`) · [Plan 24 — WIT worlds](../24-wit-worlds-reference.md) (`wasi:sql`/`hobo:sql`) · [Plan 26 — Environments/Deltas](../26-environments-deltas.md) (`can-deploy`) · [Plan 29 — Contracts](../29-contracts-compatibility.md) (`compat.Gate*`) · [Plan 5 — Reliability/HA](../05-reliability-ha.md) (blue/green, snapshots) · [Plan 11 — Event model](../11-event-model.md) (upcasters, contrast) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G5 / "data, not just infra")
- **Origin:** the gap analysis and open question Q15 found HoBo's multi-cloud premise was **infra-only** — it could provision a DB on any cloud but had no story for migrating the *schema and data* or gating it. Designed via brainstorming + grill-with-docs.

## Context
HoBo's headline promise is "the same Bindle, N clouds." For *infrastructure* that holds (ports/adapters + the portability conformance guarantee, [ADR-0024](./ADR-0024-portability-conformance-guarantee.md)). For **application data** it did not: when a `sql` resource's schema changes, or when it moves from one provider to another, *who* runs the migration, *how* is it gated, and *how* is the data carried across? Competitors ship concrete answers (Nitric `migrations/<db>/*.up.sql`; Humanitec preview migration support). HoBo needs a story that fits its event-sourced, gated, multi-cloud model — and that is **distinct from** how HoBo evolves its *own* event log (forward-only upcasters, never rewrite history, [Plan 11](../11-event-model.md)).

## Decision
1. **Authoring = declarative desired-schema + auto-diff.** The developer declares the target schema (IfC); a diff engine computes a **reviewable migration plan** against the schema live in the target Camp. **Raw per-dialect SQL is an escape hatch**, not the primary surface. (v1 scope: relational `sql`, Postgres reference.)
2. **Apply = expand → backfill → contract**, each a **gated saga step** at Delta→Set/promote ([Plan 26](../26-environments-deltas.md)). Only **contract** is destructive, and it composes with **`compat.Gate*`** ([Plan 29](../29-contracts-compatibility.md)): a drop that would break a still-running app/consumer version is **blocked**.
3. **Rollback = redeploy the prior Set + restore a pre-contract snapshot.** **No `.down` migrations** — expand phases are additive, so the prior app version still runs; a snapshot is taken before any destructive contract phase.
4. **Cross-cloud move = export→import within a provider equivalence class** (managed-Postgres), as a gated event-sourced saga with blue/green cutover ([Plan 5](../05-reliability-ha.md)) + checksum verification + source reap. **Cross-engine is out of scope v1; CDC/dual-write is a future opt-in adapter.**
5. **Events** `migration.Planned/SnapshotTaken/PhaseApplied/Verified/RolledBack/Failed` + move `migration.Exported/Imported/CutOver` — every step replayable/auditable.
6. **Explicit layering:** this governs *application* data; HoBo's *own* control-plane event log keeps its forward-only upcaster model ([Plan 11](../11-event-model.md)). The two are named distinctly to avoid conflation.

## Alternatives considered
- **Versioned `.up.sql`/`.down.sql` files (Nitric-parity).** Rejected as the primary surface: per-dialect (no automatic cross-cloud portability), opaque to HoBo (execute-only, can't reason about additive-vs-destructive for the gate), and `.down` gives false rollback safety. Retained only as the **raw escape hatch**.
- **Imperative TS migration DSL (`defineMigration` builder).** Rejected: more to build, leaky for advanced SQL, and imperative steps are harder to diff/verify/gate than a declared target schema.
- **Down-migrations as the rollback model.** Rejected: a dropped column's data is already gone, so an inverse can't truly restore it; expand-contract + snapshot is honest about what is and isn't recoverable.
- **Cross-engine portability (Postgres↔MySQL) in v1.** Rejected: lossy/semantic, not mechanical; portability is scoped to **equivalence classes** to keep the guarantee real.
- **App-owned data movement (HoBo only provisions).** Rejected: abdicates the data-portability promise Q15 exists to address.

## Consequences
- **(+)** The multi-cloud promise now extends to **data**: schema evolution and intra-class moves are concrete, gated, and auditable — not infra-only.
- **(+)** Reuses existing machinery — Delta→Set + `can-deploy` ([Plan 26](../26-environments-deltas.md)), `compat.Gate*` ([Plan 29](../29-contracts-compatibility.md)), blue/green + snapshots ([Plan 5](../05-reliability-ha.md)), the event log ([Plan 11](../11-event-model.md)) — so little new infra.
- **(+)** Expand-contract gives safe zero-downtime migrations and a clean rollback story without unreliable `.down` scripts.
- **(−)** A declarative diff engine is non-trivial to build and won't cover every DDL operation; the raw escape hatch is the pressure valve.
- **(−)** Portability is bounded to equivalence classes — cross-engine moves and CDC cutover are deferred, so some real-world migrations remain manual or future-adapter work.
