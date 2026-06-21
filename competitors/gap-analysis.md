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
| AI-generated providers/impls (Forge) | ✗ | ✗ | ✗ | ✗ | ➕ unique — but ◐ *generation pipeline shallow* ([06](../docs/design/06-ai-native-agent-auth.md)/[23](../docs/design/23-stubbable-ai-implementations.md)) |
| Agents as first-class principals | ✗ | ✗ | ✗ | ✗ | ➕ unique ([06](../docs/design/06-ai-native-agent-auth.md)) |
| Event-sourced audit / replay / time-travel | ✗ | ✗ | ◐ | ◐ | ➕ unique core bet ([11](../docs/design/11-event-model.md)/[14](../docs/design/14-observability.md)) |
| Air-gapped / sovereign deploy | — | — | ✅ | ◐ (self-host) | ◐ HoBo Agent (private net) but air-gap mode unstated ([28](../docs/design/28-agent-gitops-pipelines.md)/[12](../docs/design/12-security-multitenancy.md)) |
| Enterprise governance (RBAC/approvals/drift) | ✗ | ◐ | ✅ | ◐ | ✅ ([12](../docs/design/12-security-multitenancy.md)/[28](../docs/design/28-agent-gitops-pipelines.md)/[30](../docs/design/30-policy-plane.md)) |
| End-user (human) auth broker | — | — | — | ◐ | ✗ orthogonal (HoBo does *agent/workload* identity; pairs with shoo) |
| Self-host = hosted | ✗ | ✅ (OSS) | ◐ | ✅ (OSS) | ➕ Yard-is-a-Bindle ([04](../docs/design/04-control-plane.md)) |

**Reading:** HoBo's ➕ columns (multi-cloud + IfC + durable runtime + event-sourcing + agents/Forge in one model) are the moat no single competitor matches. The ◐/✗ rows are where competitors are ahead or HoBo is thin.

## 2. Brainstorm — sharp questions that surface the gaps
*(Superpowers `brainstorming` style: challenge the design's assumptions, one pointed question each.)*

1. **Reactivity:** HoBo has a `Streamer` port and an event log — but a Convex user gets `useQuery()` that re-runs and pushes to every client on write, with consistent snapshots. *What is HoBo's client-facing live-query story?* Is it "bring your own websocket over `Streamer`", or a first-class reactive-query model with cache-invalidation + consistency guarantees? Today: **undefined.**
2. **Forge depth:** Plans 6/23 say Forge *generates* providers/impls and gates them by conformance. *But what actually generates them?* The conformance gate ([09](../docs/design/09-verification-open-questions.md)) is specified; the generation loop (inputs, prompt/program synthesis, repair iteration, the training-engine for impls) is thin outside [Plan 23](../docs/design/23-stubbable-ai-implementations.md)'s `use training`. *Is "Forge generates providers" demonstrable, or aspirational?*
3. **Matching credibility:** Humanitec ships Matching; HoBo promises auditable `match.Decided`. *Which algorithm — rules, constraint solver, or LLM — and is it deterministic enough to trust in prod?* ([Q3](../docs/design/09-verification-open-questions.md), unresolved.)
4. **wasm to prod:** every competitor has a clear runtime substrate (containers/K8s/their cloud). *What does HoBo actually run components on in prod* — SpinKube? wasmCloud lattice? wasm-in-container? Until [Q10](../docs/design/09-verification-open-questions.md) is answered, "wasm-first" is unproven for production.
5. **Data, not just infra:** HoBo can provision a DB on AWS *or* Azure — *but who migrates the schema and the data when you move, and how is it gated?* ([Q15](../docs/design/09-verification-open-questions.md), new last iteration; still undesigned.)
6. **Batteries vs Lego:** Convex is one consistent backend; HoBo is ports→providers (compose-it-yourself, per cloud). *Does the agnostic Lego model cost too much first-run DX vs Convex's batteries?* Mitigations: a "starter Resource Pack" + great `hobo dev`.

## 3. Gaps — prioritized
### A. NEW (no existing plan or open question)
- **G1 — Reactive / live-query data model (Convex).** HoBo's event log + `Streamer` enable replay and per-run streams, but there is **no documented client reactive-query model** (subscribe to a query, auto-recompute on write, consistent snapshots, cache invalidation). This is Convex's headline DX and a real competitive hole. → **filed as [open question #21](../docs/design/09-verification-open-questions.md); candidate for a new Plan 32 (reactive/live-data).**
- **G2 — Vector & full-text search surface (Convex).** The `vector`/`search` ports exist in the catalog but indexing strategy, similarity operators, and filter syntax are undetailed. → **[open question #22](../docs/design/09-verification-open-questions.md).**

### B. Designed-but-shallow (deepen an existing plan)
- **G3 — Forge *generation* pipeline** (vs only conformance gates): deepen [06](../docs/design/06-ai-native-agent-auth.md)/[23](../docs/design/23-stubbable-ai-implementations.md) — generation inputs, candidate synthesis, repair loop, and how `training-engine` ([ADR-0025](../docs/design/adr/ADR-0025-use-training-directive-and-training-engine.md)) extends from *implementations* to *providers/definitions*. The unique differentiator is currently the least-specified.
- **G4 — Custom domains + ingress depth** (Nitric has custom domains): [Plan 13](../docs/design/13-networking-connectivity.md) doesn't document custom-domain provisioning or multi-cloud DNS/CNAME. → **[open question #23](../docs/design/09-verification-open-questions.md).**
- **G5 — SQL migration DSL** (Nitric `.up.sql`, Humanitec preview): the `sql` port is designed; the migration workflow folds into the data-migration work ([Q15](../docs/design/09-verification-open-questions.md)).
- **G6 — Air-gapped / sovereign mode** (Humanitec): the HoBo Agent gives no-inbound private-network deploys ([28](../docs/design/28-agent-gitops-pipelines.md)); a fully air-gapped/regulated mode (offline registry, in-boundary key custody) isn't stated. Relates to [Q20](../docs/design/09-verification-open-questions.md) (Yard federation).
- **G7 — SDK codegen surface** (Aspire/Convex typed end-to-end): WIT-generated clients are promised ([24](../docs/design/24-wit-worlds-reference.md)) but the developer-facing codegen ergonomics aren't shown.

### C. Already tracked (competitor-confirmed priorities — see [09 §15–20](../docs/design/09-verification-open-questions.md))
| Gap | Competitor pressure | Open Q |
|---|---|---|
| Local-dev fidelity + dev dashboard | Aspire | #17 |
| Non-TS IfC parity | Nitric | #12 |
| Matching algorithm choice | Humanitec | #3 |
| wasm host-of-record for prod | all (clear runtimes) | #10 |
| Cross-Camp stateful consistency | (multi-cloud premise) | #16 |
| App-data schema evolution & migration | Nitric/Humanitec | #15 |
| Billing / quota / runaway-spend | Humanitec (governance) | #18 |

## 4. Review verdict
*(Superpowers `receiving-code-review` framing.)* **Strong-but-uneven.** HoBo's intersection bet (agnostic IfC + durable event-sourced runtime + agents/Forge, self-hostable) is genuinely uncontested — no competitor spans it. The risks are **depth, not breadth**: (a) the **unique** differentiator (Forge generation) is the least-specified; (b) HoBo is missing the one piece of mainstream DX a TS-backend audience expects (**reactive queries**); (c) several "designed" capabilities are blocked on unresolved open questions (wasm host, matching algorithm, data migration) that competitors have already shipped answers to. None are fatal; all are addressable in the design phase.

## 5. Iterate — recommended next design moves (priority order)
1. **Design the reactive/live-query model** (G1) — close the Convex DX gap; new plan candidate, built on `Streamer` + projections.
2. **Deepen the Forge generation pipeline** (G3) — make the headline differentiator concrete (extend [23](../docs/design/23-stubbable-ai-implementations.md)/[06](../docs/design/06-ai-native-agent-auth.md)).
3. **Resolve wasm host-of-record** ([Q10](../docs/design/09-verification-open-questions.md)) — unblocks "wasm-first" for prod.
4. **Design app-data schema evolution + migration** ([Q15](../docs/design/09-verification-open-questions.md)) — required for the multi-cloud promise.
5. **Decide the Matching algorithm** ([Q3](../docs/design/09-verification-open-questions.md)) — makes Resource Definitions credible vs Humanitec.
6. **Detail search (G2) + custom-domain/ingress (G4) + SDK codegen (G7)** surfaces.

> New gaps from this analysis are filed as open questions **#21–23** in [09](../docs/design/09-verification-open-questions.md); the rest reinforce the existing #3/#10/#12/#15–18 priorities.
