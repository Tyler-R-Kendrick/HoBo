---
type: Implementation Plan
title: "Formal interop hypotheses H1–H7 — multi-ITP, BEq, OpenUI gates"
description: "Evidence-grounded experiment program for formal portability, controlled-vs-ecosystem ablation, hybrid IR certificates, semantic equivalence gates, multi-ITP context, specialized SLMs, and adversarial library mismatch — mapped to existing HoBo surfaces and non-negotiable fail-closed invariants."
tags: [hobo, plans, formal, openui, evals, training]
---

# Formal interop hypotheses (H1–H7)

> **Status:** **Waves 0–3 implemented (2026-07-30)** in `@hobo/formal-interop` + hooks in `@hobo/code` / `@hobo/training-pipeline`. Controlled Lean package builds live (`lake build` green). Multi-ITP translation/SLM fine-tune runs use offline/fixture metric mode when external provers/models are not invoked; same metric schema either way.  
> **Paper signals driving order:** ecosystem mismatch dominates (tier gap ≈ 29.7% controlled vs 5.2% ecosystem); multi-ITP context lifts formalization (~4.8% → 10.6%); BEq-style semantic gates expose typecheck-pass / meaning-fail.  
> **Durable direction (not production path):** pure zero-shot LLM translation is unlikely primary for high-assurance structured generation. Prefer **hybrid IR + specialized constrained models + multi-prover semantic gates**.

## 1. Honest inventory (what exists vs what H* assume)

| Assumed asset | In this monorepo today | Closest real surface |
|---|---|---|
| Lean theorems (Forest, LeanTrace, Metrics, recurrence) | **Present** | `packages/formal-interop/formal/controlled-core` (`lake build` green; no Mathlib on controlled path) |
| VSS exact-closure certificates | **Mock hybrid IR** | `FormalCertificate` + `replayFormalCertificate` (typed digests; untyped fail closed) |
| Dedukti / multi-ITP export | **Harness offline/live** | `runMultiItpHarness` / `translateTheorem` → Rocq/Isabelle/HOL Light metric rows |
| Specialized formal SLM | **Port-only offline eval** | `runFormalInteropTraining` (`enginePort: "training-engine"`, `publicSdkExport: false`) |
| ITPEval controlled tier | **Fixture dataset id** | `dataset: "itpeval-controlled"` + in-repo formal theorems |
| OpenUI productions | **IR + shell** | Tree IR + BEq in `@hobo/formal-interop`; HTML shell still in `@hobo/code` |
| AgentV metrics | **Present** | `@hobo/provider-agentv` + ablation `agentv_scores` in ledger |
| Semantic / BEq gate on trees | **Present** | `beqOpenUi` + default-on OpenUI promotion hooks |
| Constrained decoding invariants | **Partial (policy)** | parse-don't-validate + semantic BEq + certificate typedness |
| Fail-closed promotion | **Present + semantic** | training-pipeline three-lens + `openUiArtifact` semantic; code `openUi` promote option |
| Metrics ledger H1–H7 | **Present** | `docs/plans/formal-interop-runs/ledger.jsonl` via `appendMetricsRow` |

**Naming collision note:** repo "Trace" = Microsoft Trace / OPTO training engine, **not** a Lean `Trace` theory. Do not overload in formal package names without disambiguation (`LeanTrace` / `Forest.Trace`).

## 2. Non-negotiable invariants (every experiment)

1. **Fail closed** — missing certificate, missing formal package, or untyped LLM output never promotes.
2. **Evidence-grounded** — claims need pass@k, BEq/fidelity, AgentV, or preflight rejection rates; no vibes.
3. **No pure zero-shot production path** — frontier models may measure ceiling; production path is hybrid IR + constrained models + semantic gates.
4. **Repo architecture rules still bind** — protobuf/CUE/PACT at boundaries; engines behind ports; no Mathlib/Effect-TS/Polly public deps on SDK surface.
5. **Ship residuals stay residual** — H-V1 runners, npm publish, live multi-cloud are out of scope for this plan unless separately requested.

## 3. Hypotheses (as proposed)

### H1 — Portability of controlled formal package

**Experiment:** Translate existing Lean theorems (Forest, Trace, Metrics, recurrence bounds) to Rocq, Isabelle, HOL Light using zero-shot frontier models **and** a constrained small model. Measure native pass@1 and BEq-style / certificate-replay fidelity.

| | |
|---|---|
| **Prediction** | High success on axiomatized core (controlled-tier analogue); sharp drop if Mathlib-dependent lemmas included. |
| **Value** | Quantifies robustness of formal preflight package; multi-prover certificates. |
| **Repo prereq** | Introduce controlled Lean package (axiomatized core only) + export harness. |
| **Wave** | W2 (after W0 inventory + controlled package lands). |

### H2 — Controlled vs ecosystem ablation inside the DSL

**Experiment:** Two parallel formalizations of OpenUI productions: (a) pure axiomatized productions + VSS exact-closure; (b) same + full component/role/operator library. Train/eval TwoTower variants (or training-engine candidates) on each. Measure meaningful-rate, AgentV, formal-preflight success.

| | |
|---|---|
| **Prediction** | Measurable gap analogous to paper’s ~29.7% vs ~5.2%. |
| **Value** | Decides whether library growth is first-class risk to generation **and** formal gates. |
| **Repo prereq** | OpenUI IR (not just HTML shell) + two library tiers + eval harness wired to AgentV. |
| **Wave** | W1 (repo-native ablation with syntactic IR) → W2 (formal + VSS). |

### H3 — Hybrid IR + constrained SLM

**Experiment:** Pipeline VSS certificates through Dedukti (or lightweight export) into a target ITP; compare fidelity/cost vs pure LLM translation of same claims. Optionally fine-tune small constrained model on successful hybrid trajectories.

| | |
|---|---|
| **Prediction** | Hybrid fidelity higher and more stable; cost lower than frontier. |
| **Value** | Aligns with fail-closed invariants better than zero-shot generation. |
| **Repo prereq** | Certificate IR schema (protobuf + CUE) + export adapter; no ITP required for mock-replay path. |
| **Wave** | W1 mock certificate-replay → W2 real Dedukti/ITP. |

### H4 — Semantic gate beyond parse

**Experiment:** Bidirectional structural/semantic equivalence check on generated vs gold (or formalized intent) OpenUI trees — BEq analogue. Use as promotion gate **and** training signal (maximize certificate-supported / equivalence-preserving outputs).

| | |
|---|---|
| **Prediction** | Syntax-perfect but meaning-zero checkpoints rejected; hierarchy/binder failures surface earlier. |
| **Value** | Closes paper’s typecheck-pass vs meaning gap. |
| **Repo prereq** | Tree IR for OpenUI; pure equivalence function; wire into promotion gate lens or parallel hard gate. |
| **Wave** | **W0 first** — highest leverage with current code. |

### H5 — Multi-ITP context in formal-autoresearch

**Experiment:** Condition Lean claim generation and proof search on multi-ITP examples (or successful translations). Measure formalization success and subsequent training outcome vs single-prover prompts.

| | |
|---|---|
| **Prediction** | Lift comparable to paper’s ~4.8% → ~10.6%. |
| **Value** | Cheap improvement to preflight pipeline once formal package exists. |
| **Repo prereq** | H1 partial translations + prompt harness (can start with fixture pairs). |
| **Wave** | W2. |

### H6 — Specialized SLM for formal interop

**Experiment:** Fine-tune TwoTower or causal-LoRA under repo parameter-efficiency constraints on ITPEval controlled tier (+ own formal package once translated). Evaluate pass@k and cost vs frontier zero-shot on held-out ITPEval and own theorems.

| | |
|---|---|
| **Prediction** | Specialized constrained model competitive/superior on cost and legality; still limited on ecosystem material. |
| **Value** | Tests whether core architecture redirects to formal translation without violating decode invariants. |
| **Repo prereq** | Training data from H1/H3 successes; training-engine port only (no SDK surface leak). |
| **Wave** | W3 (after hybrid trajectories exist). |

### H7 — Adversarial library mismatch injection

**Experiment:** Systematically inject controlled API/naming/style mismatches into formal abstractions; measure preflight rejection rates and downstream generation degradation.

| | |
|---|---|
| **Prediction** | Early rejection by Lean/VSS (or IR) gates; quantifies tier-gap sensitivity. |
| **Value** | Stress-tests fail-closed design before real library growth. |
| **Repo prereq** | H2 tier definitions + H4 gate (or syntactic preflight). |
| **Wave** | W1 (syntactic/IR mismatch) → W2 (formal mismatch). |

## 4. Leverage order (why this sequence)

Paper’s strongest result: **ecosystem mismatch dominates**. Repo’s current strengths: **fail-closed gates, AgentV, promotion pipeline, OpenUI shell** — not Lean.

| Priority | Hypothesis | Why first/last |
|---|---|---|
| 1 | **H4** | Closes meaning gap without ITP; plugs promotion hole (parse/typecheck ≠ meaning). |
| 2 | **H2** (IR tier) | Quantifies library-growth risk on real OpenUI path. |
| 3 | **H7** (IR) | Stress-tests fail-closed before library sprawl. |
| 4 | **H3** (mock IR) | Certificate-replay path without full Dedukti. |
| 5 | Controlled Lean package (prereq) | Unlocks H1/H5/H6 full form. |
| 6 | **H1**, **H5** | Multi-prover portability + context lift. |
| 7 | **H6** | Specialized SLM only after hybrid trajectories. |
| 8 | **H3** real Dedukti / full VSS | Production-shaped hybrid path. |

## 5. Wave plan

### Wave 0 — Semantic gate (H4) [start here]

**Deliverables**

1. OpenUI **tree IR** (protobuf + CUE) distinct from HTML presentation — nodes, binders/roles, hierarchy, attrs.
2. Pure function `beqOpenUi(generated, gold | intent): { ok; score; failures[] }` — structural + semantic (role/hierarchy/binder), not string equality.
3. Gold fixtures: valid, hierarchy-broken, meaning-zero, syntax-ok-semantics-fail.
4. Wire as **hard** promotion precondition (fail closed) or explicit fourth lens behind feature flag default **on** for OpenUI artifacts.
5. Draft technical proof: `openui-semantic-beq-gate` with examples/tests/bench.
6. Docs: maintenance note in `@hobo/code` README + this plan status.

**Exit criteria:** syntax-perfect meaning-zero fixture **rejected**; gold fixture **accepted**; AgentV optional secondary score recorded.

### Wave 1 — Ablation + adversarial (H2 IR, H7 IR, H3 mock)

1. Define **controlled library** (axiomatized productions only) vs **ecosystem library** (full component/role set) as data, not vibes.
2. Generate/eval under both; report meaningful-rate + AgentV + H4 pass rate (the controlled-vs-ecosystem gap).
3. Mismatch injector: rename/role-swap/style-skew API surface; expect early H4/preflight reject.
4. Certificate mock: protobuf `FormalCertificate` + deterministic replay checker (no Lean required); hybrid path vs free-form string claims.

**Exit criteria:** published gap table; mismatch rejection rate ≥ target (document floor); certificate replay green on fixtures.

### Wave 2 — Controlled formal package + multi-ITP (H1, H5, formal H2/H7)

1. Add axiomatized Lean package (Forest / Trace / Metrics / recurrence) **without** Mathlib deps for controlled tier; optional Mathlib branch for drop experiment only.
2. Translation harness: frontier zero-shot + constrained SLM → Rocq / Isabelle / HOL Light; pass@1 + BEq/replay.
3. Multi-ITP few-shot context in claim/proof search; measure lift.
4. Real VSS/export path only if certificate IR stable.

**Exit criteria:** controlled-tier pass rates; Mathlib-included drop confirmed or refuted; multi-ITP context delta recorded.

### Wave 3 — Specialized SLM (H6)

1. Fine-tune under training-engine port only (no SDK leak).
2. Evaluate cost/pass@k vs frontier on held-out + own theorems.
3. Keep ecosystem-tier failure modes explicit (do not claim universal formal translation).

## 6. Metrics ledger (minimum columns)

Every experiment run writes a machine-readable row (JSONL under proof `bench/` or `docs/plans/formal-interop-runs/`):

| Field | Notes |
|---|---|
| `hypothesis` | H1–H7 |
| `tier` | controlled \| ecosystem \| mismatch |
| `method` | zero-shot-frontier \| constrained-slm \| hybrid-ir \| multi-itp-context |
| `pass_at_1` / `pass_at_k` | native ITP or IR gate |
| `beq_or_fidelity` | structural/semantic equivalence or certificate replay |
| `agentv_scores` | named metrics when generation path |
| `preflight_reject_rate` | fail-closed early rejects |
| `cost_usd` / `latency_ms` | when external models used |
| `seed` / `model` / `prompt_digest` | provenance |

## 7. Package / proof sketch (Wave 0–1 only)

| Path | Role |
|---|---|
| `packages/code` (or small `@hobo/openui-ir`) | Tree IR parse + `beqOpenUi` |
| `packages/training-pipeline` | Optional hard gate hook for OpenUI artifacts |
| `src/draft/technical-proofs/openui-semantic-beq-gate` | H4 executable evidence |
| `src/draft/technical-proofs/openui-controlled-vs-ecosystem` | H2 IR ablation |
| `src/draft/technical-proofs/formal-certificate-replay-mock` | H3 mock |
| `formal/` or `src/draft/technical-proofs/lean-controlled-core` | Wave 2 Lean package (TBD location; keep out of SDK) |

Avoid shared root churn (`package.json` workspace adds only when package lands).

## 8. Explicit non-goals

- Replacing PACT/CUE/protobuf with Lean as general contract language.
- Claiming multi-prover soundness before certificate-replay evidence exists.
- Running live frontier training spends in default CI (manual/release lane only).
- Closing residual ship human blockers via this plan.

## 9. Implementation status (2026-07-30)

| Wave | Status | Primary package / path |
|---|---|---|
| W0 H4 | **Done** | `beqOpenUi`, fixtures, `evaluateOpenUiPromotion`; hooks in `@hobo/code` + `@hobo/training-pipeline` |
| W1 H2/H7/H3 | **Done** | `CONTROLLED_LIBRARY`/`ECOSYSTEM_LIBRARY`, ablation, mismatch injector, certificate replay |
| W2a Lean | **Done** | `formal/controlled-core` (Forest, LeanTrace, Metrics, Recurrence; MathlibContrast fixture-only) |
| W2b multi-ITP | **Done** | `runMultiItpHarness` (offline metric mode + live lake build available) |
| W3 H6 | **Done** | `runFormalInteropTraining` behind training-engine port only |
| Metrics H1–H7 | **Done** | `docs/plans/formal-interop-runs/ledger.jsonl` |

**Tests:** `pnpm --filter @hobo/formal-interop test` · OpenUI promote: `packages/code/test/openui-semantic-promote.test.ts` · gate: training-pipeline `openUiArtifact` cases.

**Env notes:** Lean 4.32 + `lake build` succeeded for controlled-core. Frontier/SLM live spend stays opt-in; offline fixtures fill the same metric schema.

## 10. Decision log

| Date | Decision |
|---|---|
| 2026-07-30 | Captured H1–H7; ordered by ecosystem-mismatch leverage + repo strengths; pure zero-shot demoted as production path. |
| 2026-07-30 | Wave 0 = H4 semantic gate first (repo-native, fail-closed). |
| 2026-07-30 | Shipped `@hobo/formal-interop` private package covering W0–W3; ledger + fail-closed tests green; controlled Lean `lake build` live. |
| 2026-07-30 | Swarm topology×diffusion verdict → [ADR-0141](../design/adr/03-data-plane-constrained-legality.md) + [plan 0016](./0016-constrained-diffusion-e1-parity.md): executor before circuit; freeze model-facing topology; formal-interop remains meaning/BEq layer. |
