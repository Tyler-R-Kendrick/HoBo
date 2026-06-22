# HoBo vs competitors — gap analysis

> A cross-competitor synthesis: where HoBo's [design suite](../docs/design/README.md) (Plans 0–31) leads, matches, or **falls short** of [Aspire](./aspire/README.md), [Nitric](./nitric/README.md), [Humanitec](./humanitec/README.md), [Convex](./convex/README.md), and [shoo.dev](./shoo/README.md). Produced with the [Superpowers](../docs/agent-tooling.md) methodology — **brainstorm → compare → review → iterate**. Companion to each folder's `differentiators.md` (their strengths) and `hobo-mapping.md` (per-feature parity ✅ has / ➕ adds / 🔜 planned).
>
> **Bottom line:** the architecture is broad and most gaps are *already tracked* as open questions ([09 §15–20](../docs/design/09-verification-open-questions.md)). The **one true blind spot** is a **reactive / live-query data model** (Convex's core DX) — added as open question #21. Two surfaces are designed-but-shallow (**Forge generation pipeline**, **vector-search & custom-domain/ingress**).

## 1. Comparison matrix
Legend: ✅ HoBo designed-for-parity · ➕ HoBo goes further · ◐ designed but shallow/deferred · ✗ gap (not in the design).

| Dimension | Aspire | Nitric | Humanitec | Convex | **HoBo (Plans)** |
|---|---|---|---|---|---|
| Code-first composition / wiring | ✅ | ✅ | — | ✅ | ✅ Bindle + IfC ([21](../docs/design/21-resources-catalog.md)/[22](../docs/design/22-wiring-manifest.md)) |
| Infrastructure-from-Code (`.allow()` least-priv) | — | ✅ | — | — | ➕ triple-effect `.allow()` (IAM+wasm-cap+token) ([21](../docs/design/21-resources-catalog.md)) |
| Multi-cloud portability (same app → N clouds) | ✗ | ✅ | ◐ (K8s) | ✗ | ➕ Camps + ADR-0028 ([03](../docs/design/03-providers-iac.md)) |
| Resource Definitions + Matching (platform rules) | — | — | ✅ | — | ✅➕ auditable `match.Decided` ([25](../docs/design/25-resource-definitions-matching.md)) ◐ *algorithm open ([Q3](../docs/design/09-verification-open-questions.md))* |
| Deployment Sets / Deltas / promote | — | — | ✅ | ◐ | ✅➕ event-sourced ([26](../docs/design/26-environments-deltas.md)) |
| Durable workflows / actors / sagas | — | ✗ | — | ◐ (txns) | ➕ ([02](../docs/design/02-sdk-api.md)/[11](../docs/design/11-event-model.md)) |
| **Reactive client queries / live subscriptions** | — | — | — | **✅ (core)** | **✗ NEW GAP → [Q21](../docs/design/09-verification-open-questions.md)** |
| Generated typed clients / codegen | ✅ | ◐ | — | ✅ | ✅➕ WIT-generated ([24](../docs/design/24-wit-worlds-reference.md)) ◐ *SDK codegen surface thin* |
| Vector / full-text search | — | — | — | ✅ | ◐ `vector` port exists, surface undetailed ([21](../docs/design/21-resources-catalog.md)) |
| SQL + migrations workflow | — | ✅ (`.up.sql`) | ◐ (preview) | n/a | ◐ port designed, migration DSL deferred ([Q15](../docs/design/09-verification-open-questions.md)) |
| Local-dev parity + dev dashboard | ✅ (`aspire run`) | ✅ | — | ✅ | ◐ `hobo dev` ([15](../docs/design/15-cli-dx.md)) *fidelity open ([Q17](../docs/design/09-verification-open-questions.md))* |
| Multi-language (non-TS) authoring | ✅ (.NET+poly) | ✅ (membrane) | lang-agnostic | ✗ (TS) | ◐ wasm/WIT spine, non-TS IfC deferred ([Q12](../docs/design/09-verification-open-questions.md)) |
| AI-generated providers/impls (Forge) | ✗ | ✗ | ✗ | ✗ | ➕ unique — generation pipeline now specified ([Plan 33](../docs/design/33-forge-generation-pipeline.md)/[ADR-0030](../docs/design/adr/ADR-0030-forge-generation-inputs-and-algorithm.md)) |
| Agents as first-class principals | ✗ | ✗ | ✗ | ✗ | ➕ unique ([06](../docs/design/06-ai-native-agent-auth.md)) |
| Event-sourced audit / replay / time-travel | ✗ | ✗ | ◐ | ◐ | ➕ unique core bet ([11](../docs/design/11-event-model.md)/[14](../docs/design/14-observability.md)) |
| Air-gapped / sovereign deploy | — | — | ✅ | ◐ (self-host) | ✅ zero-egress Yard profile + signed bundle import + in-boundary trust roots ([ADR-0036](../docs/design/adr/ADR-0036-air-gapped-sovereign-mode.md)/[28](../docs/design/28-agent-gitops-pipelines.md)) |
| Enterprise governance (RBAC/approvals/drift) | ✗ | ◐ | ✅ | ◐ | ✅ ([12](../docs/design/12-security-multitenancy.md)/[28](../docs/design/28-agent-gitops-pipelines.md)/[30](../docs/design/30-policy-plane.md)) |
| End-user (human) auth broker | — | — | — | ◐ | ✗ orthogonal (HoBo does *agent/workload* identity; pairs with shoo) |
| Self-host = hosted | ✗ | ✅ (OSS) | ◐ | ✅ (OSS) | ➕ Yard-is-a-Bindle ([04](../docs/design/04-control-plane.md)) |

**Reading:** HoBo's ➕ columns (multi-cloud + IfC + durable runtime + event-sourcing + agents/Forge in one model) are the moat no single competitor matches. The ◐/✗ rows are where competitors are ahead or HoBo is thin.

## 2. Brainstorm — sharp questions that surface the gaps
*(Superpowers `brainstorming` style: challenge the design's assumptions, one pointed question each.)*

1. **Reactivity:** HoBo has a `Streamer` port and an event log — but a Convex user gets `useQuery()` that re-runs and pushes to every client on write, with consistent snapshots. *What is HoBo's client-facing live-query story?* Is it "bring your own websocket over `Streamer`", or a first-class reactive-query model with cache-invalidation + consistency guarantees? Today: **undefined.**
2. **Forge depth:** Plans 6/23 say Forge *generates* providers/impls and gates them by conformance. *But what actually generates them?* The conformance gate ([09](../docs/design/09-verification-open-questions.md)) is specified; the generation loop (inputs, prompt/program synthesis, repair iteration, the training-engine for impls) is thin outside [Plan 23](../docs/design/23-stubbable-ai-implementations.md)'s `use training`. *Is "Forge generates providers" demonstrable, or aspirational?*
3. **Matching credibility:** ✅ **RESOLVED → [ADR-0033](../docs/design/adr/ADR-0033-deterministic-matching-and-planner-selection.md)** ([Q3](../docs/design/09-verification-open-questions.md) + ADR-P4): selection on the deploy path is **deterministic rules** (filter on `require` → rank lexicographically [specificity → `priority` → configurable objective, default min-cost → stable tiebreak] → record full ranking in `match.Decided`); constraint-solvers/LLMs are **advisory only, off-path**. Deterministic + replayable + auditable — the credibility property prod needs, and more transparent than Humanitec's opaque selection.
4. **wasm to prod:** ✅ **RESOLVED → [ADR-0031](../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)** ([Q10](../docs/design/09-verification-open-questions.md)): a **`component-host` port** (the host is a property of a Camp), **Wasmtime** locally, **wasm-in-container** as the portable v1 prod default (reuses the OCI pipeline → runs anywhere a container runs), and **SpinKube / wasmCloud-lattice / provider-native** as opt-in per-Camp adapters. "wasm-first" now has a concrete substrate.
5. **Data, not just infra:** ✅ **RESOLVED → [Plan 34](../docs/design/34-app-data-migrations.md)** ([ADR-0032](../docs/design/adr/ADR-0032-data-portability-schema-versioning.md)): declarative-schema + auto-diff migrations, gated **expand/backfill/contract** apply + snapshot rollback, and **export→import within a provider equivalence class** for cross-cloud moves ([Q15](../docs/design/09-verification-open-questions.md); v1 = relational `sql`/Postgres). The multi-cloud promise now covers *data*, not just infra.
6. **Batteries vs Lego:** Convex is one consistent backend; HoBo is ports→providers (compose-it-yourself, per cloud). *Does the agnostic Lego model cost too much first-run DX vs Convex's batteries?* Mitigations: a "starter Resource Pack" + great `hobo dev`.

## 3. Gaps — prioritized
### A. NEW (no existing plan or open question)
- **G1 — Reactive / live-query data model (Convex).** ✅ **CLOSED → [Plan 32](../docs/design/32-reactive-live-queries.md)** ([ADR-0029](../docs/design/adr/ADR-0029-reactive-live-query-model.md)): a `query()`/`"use query"` primitive + event-log **reactor** (hybrid: native projections default, opt-in provider DB **change-feed** capability), **per-query consistent snapshot @ `seq`** + reads-your-writes, client `useQuery()`. Was the one true blind spot; designed via brainstorming + grill-with-docs.
- **G2 — Vector & full-text search surface (Convex).** ✅ **CLOSED → [Plan 35](../docs/design/35-search-vector-surface.md)** ([ADR-0034](../docs/design/adr/ADR-0034-search-vector-surface.md)): a first-class unified **`search` port** (full-text + vector + hybrid/RRF) behind a provider equivalence class (pgvector+PG-FTS ↔ OpenSearch/Azure AI Search/Pinecone), declarative migration-gated indexes, determinism-split reactivity (full-text reactive, vector = step), and a secretless **`embed`** capability (local/hosted, BYO escape hatch). Closes [Q22](../docs/design/09-verification-open-questions.md).

### B. Designed-but-shallow (deepen an existing plan)
- **G3 — Forge *generation* pipeline.** ✅ **CLOSED → [Plan 33](../docs/design/33-forge-generation-pipeline.md)** ([ADR-0030](../docs/design/adr/ADR-0030-forge-generation-inputs-and-algorithm.md)): the **scaffold → LLM-fill → validate(sandboxed, no-egress) → repair(via `training-engine`, bounded) → certify(signed provenance)** loop, **contract-first** inputs (WIT + conformance + Hobo Code authoritative; docs/OpenAPI sanitized hints), unified across **providers + implementations + Resource Definitions/Packs**. The unique differentiator is now specified end-to-end (was the least-detailed).
- **G4 — Custom domains + ingress depth** (Nitric has custom domains): ✅ **CLOSED → [ADR-0035](../docs/design/adr/ADR-0035-custom-domains-and-multi-cloud-ingress.md)** ([Plan 13](../docs/design/13-networking-connectivity.md) §Custom domains): a first-class **Yard-level `domain`** fronting member Camps, **policy-driven DNS routing** (failover/weighted/latency via a `dns` capability), **ACME DNS-01** secretless certs (provider-managed adapter). HoBo goes beyond single-cloud custom domains to a real **multi-cloud ingress** story. Closes [Q23](../docs/design/09-verification-open-questions.md).
- **G5 — SQL migration DSL** (Nitric `.up.sql`, Humanitec preview): ✅ **CLOSED → [Plan 34](../docs/design/34-app-data-migrations.md)** ([ADR-0032](../docs/design/adr/ADR-0032-data-portability-schema-versioning.md)) — folded into the data-migration work: **declarative desired-schema + auto-diff** (raw `.up.sql`-style SQL is the escape hatch), gated expand/backfill/contract apply + snapshot rollback.
- **G6 — Air-gapped / sovereign mode** (Humanitec): ✅ **CLOSED → [ADR-0036](../docs/design/adr/ADR-0036-air-gapped-sovereign-mode.md)** ([Plan 28](../docs/design/28-agent-gitops-pipelines.md) §Air-gapped): beyond the connected-private HoBo Agent, a first-class **zero-egress Yard profile** — **signed offline bundle import** (same trust boundary), **in-boundary trust roots** (Identity/internal-CA/KMS) + **local models with graceful degradation**, no phone-home, and a capability-degradation matrix. The deterministic core works with no egress. Multi-Yard **federation** stays deferred ([Q20](../docs/design/09-verification-open-questions.md)).
- **G7 — SDK codegen surface** (Aspire/Convex typed end-to-end): WIT-generated clients are promised ([24](../docs/design/24-wit-worlds-reference.md)) but the developer-facing codegen ergonomics aren't shown.

### C. Already tracked (competitor-confirmed priorities — see [09 §15–20](../docs/design/09-verification-open-questions.md))
| Gap | Competitor pressure | Open Q |
|---|---|---|
| Local-dev fidelity + dev dashboard | Aspire | #17 |
| Non-TS IfC parity | Nitric | #12 |
| ~~Matching algorithm choice~~ ✅ ([ADR-0033](../docs/design/adr/ADR-0033-deterministic-matching-and-planner-selection.md)) | Humanitec | #3 |
| ~~wasm host-of-record for prod~~ ✅ ([ADR-0031](../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)) | all (clear runtimes) | #10 |
| Cross-Camp stateful consistency | (multi-cloud premise) | #16 |
| ~~App-data schema evolution & migration~~ ✅ ([Plan 34](../docs/design/34-app-data-migrations.md)) | Nitric/Humanitec | #15 |
| Billing / quota / runaway-spend | Humanitec (governance) | #18 |

## 4. Review verdict
*(Superpowers `receiving-code-review` framing.)* **Strong-but-uneven.** HoBo's intersection bet (agnostic IfC + durable event-sourced runtime + agents/Forge, self-hostable) is genuinely uncontested — no competitor spans it. The risks are **depth, not breadth**: (a) the **unique** differentiator (Forge generation) is the least-specified; (b) HoBo is missing the one piece of mainstream DX a TS-backend audience expects (**reactive queries**); (c) several "designed" capabilities are blocked on unresolved open questions (wasm host, matching algorithm, data migration) that competitors have already shipped answers to. None are fatal; all are addressable in the design phase.

## 5. Iterate — recommended next design moves (priority order)
1. **Design the reactive/live-query model** (G1) — close the Convex DX gap; new plan candidate, built on `Streamer` + projections.
2. **Deepen the Forge generation pipeline** (G3) — make the headline differentiator concrete (extend [23](../docs/design/23-stubbable-ai-implementations.md)/[06](../docs/design/06-ai-native-agent-auth.md)).
3. ✅ **Resolved wasm host-of-record** ([Q10](../docs/design/09-verification-open-questions.md) → [ADR-0031](../docs/design/adr/ADR-0031-wasm-host-of-record-and-runtime-substrate.md)) — `component-host` port; Wasmtime local + wasm-in-container default + per-Camp host adapters unblock "wasm-first" for prod.
4. ✅ **Designed app-data schema evolution + migration** ([Q15](../docs/design/09-verification-open-questions.md) → [Plan 34](../docs/design/34-app-data-migrations.md)/[ADR-0032](../docs/design/adr/ADR-0032-data-portability-schema-versioning.md)) — the multi-cloud promise now covers data: declarative-diff migrations, expand/contract gating, intra-equivalence-class moves.
5. ✅ **Decided the Matching algorithm** ([Q3](../docs/design/09-verification-open-questions.md) → [ADR-0033](../docs/design/adr/ADR-0033-deterministic-matching-and-planner-selection.md)) — deterministic filter→rank→tiebreak + configurable cost-default objective; makes Resource Definitions credible + auditable vs Humanitec's opaque selection.
6. ✅ **Detailed the search surface (G2)** ([Plan 35](../docs/design/35-search-vector-surface.md)/[ADR-0034](../docs/design/adr/ADR-0034-search-vector-surface.md)) **+ custom-domain/multi-cloud ingress (G4/Q23)** ([ADR-0035](../docs/design/adr/ADR-0035-custom-domains-and-multi-cloud-ingress.md)); remaining: SDK codegen (G7) + air-gap (G6).

> New gaps from this analysis are filed as open questions **#21–23** in [09](../docs/design/09-verification-open-questions.md); the rest reinforce the existing #3/#10/#12/#15–18 priorities.
