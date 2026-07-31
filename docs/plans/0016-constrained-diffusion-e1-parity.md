---
type: Implementation Plan
title: "Constrained diffusion — E1 executor parity suite and anti-E237 topology contract"
description: "Falsifiable experiments E1–E9 for certified executable residual control vs request-local memo cosplay; anti-E237 pre-registration for any model-facing topology claim. Implements the experiment ladder from ADR-0141."
tags: [hobo, plans, constrained-generation, openui, formal-interop, experiments]
---

# Constrained diffusion — E1 parity + anti-E237 contract

> **Authority:** [ADR-0141](../design/adr/03-data-plane-constrained-legality.md).  
> **Sibling:** [0015 formal interop](./0015-formal-interop-hypotheses.md) (semantic BEq / multi-ITP; meaning gate, not grammar executor).  
> **Status:** **executable in-repo (2026-07-30)** via `@hobo/formal-interop` residual kernel + E1–E9 runners (`runExperimentSuite`, claim_class gate, anti-E237 validator). Offline residual/meaning-layer mode (no Lark); same metric schema. Full grammar-kernel executor still out-of-monorepo.

## 1. Claim families (do not mix)

| Family | Ship without anti-E237? | Primary experiments |
|---|---|---|
| **P1 Executor** — residual static control parity + cold | Yes | E1, E2, E3, E4, E8, E9 |
| **P2 Γ overlay** — leaf filters + fail-closed forest | Yes (with E1) | E1 (Γ-aware cases), E4 |
| **P3 Weighted circuit** — multi-hole / semiring | No (after 1–5 ladder) | Deferred; node-count probe first |
| **Model-facing topology heads** | **No** | Anti-E237 contract only |

## 2. E1 — Artifact executor parity (highest priority)

### Goal

Prove that the **executable residual control path** (not Lark object reconstruction) produces the same candidate multiset and coverage as the reference path on a fixed kernel corpus plus hard prefixes.

### Inputs

- Kernel corpus: singleton prefixes, open card/comma hard prefix (`root = Card([b1,`), nested binders, literal boundaries, incomplete macro coverage.
- Two backends: `reference` (Lark / forest-direct) and `executor` (artifact tensors + residual interpret).
- Γ fixtures: empty scope, bound REF-visible, schema position mid-object.

### Pass criteria

1. For every fixture: `candidates(executor) ≡ candidates(reference)` as **multisets** (or sorted lists with multiplicity).
2. Coverage flags equal: complete / incomplete / forced_closure stop reasons match.
3. No silent `UNKNOWN → UNSUPPORTED` collapse (must surface unsupported as distinct).
4. Semantic OpenUI IR (when present): `beqOpenUi` gold fixtures still pass; meaning-zero still fail (bridge to formal-interop).

### Fail criteria

- Any multiset mismatch on corpus or hard prefix.
- Executor accepts a candidate reference rejects (or vice versa) without `claim_class: known_overapprox` label.
- Fixture labeled `claim_class: fixture_or_scratch` used as promotion evidence.

### Deliverables

- Fixture JSONL: `id`, `prefix`, `gamma`, `expected_candidates`, `stop_reason`.
- Parity runner writing metrics rows: `experiment=E1`, `pass`, `mismatch_count`, `claim_class=executor_parity`.
- In-repo partial: OpenUI tree BEq parity already covered by `@hobo/formal-interop` W0 tests — extend ledger with `method: executor-parity` when grammar host lands.

### Minimal in-repo stub (now)

Until the grammar kernel is in-tree, ship a **structural** check in formal-interop or a draft proof that:

1. Documents E1 fixture schema (protobuf/CUE optional).
2. Runs OpenUI BEq as the meaning-layer parity analog.
3. Refuses promotion when `claim_class` is missing or is `fixture_or_scratch` for cold-start claims.

## 3. E2 — Cold p50 (process-warm pack, request-cold)

| Pass | Fail |
|---|---|
| Executor p50 ≤ **0.5×** baseline V1 cold **and** E1 green | Speedup only when domain caches primed (`edges_built: 0` after memo) |

**Honest labels:**

- `process_warm_pack` — artifact loaded once per process  
- `request_cold` — no request-local forest/edge memo  
- `request_local_memo_reuse` — **not** AOT cold (see E9)

## 4. E3 — Load / check tax

| Pass | Fail |
|---|---|
| Digest/check production mode ≥ **10×** faster load than full reconstruct; still rejects corrupted tensors | Corrupted tensors accepted |

## 5. E4 — Static macro-edges

| Pass | Fail |
|---|---|
| AOT `forced_closure` matches dynamic on corpus; ≥ **30%** fewer forest expansions on singleton prefixes | Compresses across **literals** or **incomplete coverage** |

## 6. E8 — Weights-on-graph vs zero-forward (I1/I2)

| Pass | Fail |
|---|---|
| All backends `forwards_count == 0` on singleton fixtures | Neural ranking invoked before complete singleton proof |

## 7. E9 — Reclassify the 89.8× measurement

| Pass | Fail |
|---|---|
| Docs / dashboards / papers cite warm path only as `request_local_memo_reuse` | Marketed as AOT cold bound |

**Known fixture numbers (campaign record — do not re-market):**

| Mode | Speedup V1/V2 | Read as |
|---|---|---|
| cold `card_open_comma` | **0.816×** (V2 worse) | Kernel packing did **not** fix cold |
| warm persistent session | **89.8×** | Request-local memo, not free AOT |

## 8. Anti-E237 contract (model-facing topology only)

Any PR claiming “topology/hypergraph/CPRH helps the **model**” must include a pre-registered experiment card:

```yaml
arms:
  - control
  - train_on_decode_off
  - train_on_decode_on
kill_if:
  - no_learning_delta
  - applications_gt_0_and_choice_changes_eq_0
  - choice_changes_gt_0_and_quality_down
  - train_on_decode_off_damages_primary
report:
  - head_acc_by_candidate_count
  - meaningful_not_syntax_only
  - held_out
  - adversarial
  - n: ">=20 for promotion"
  - solver_runtime_parity: "if solver claims (SLM-187 class)"
success_bar:
  held_out_meaningful: ">= control + 0.10"
  causal_decode: not_harmful
  train_interference: none
```

**Historical lose record (do not re-run without new contract):** E236/E237, E729, E1004–E1013, X9–X21, SLM-384 topology-apply (−13% node_passes), SLM-187 parity gap.

## 9. Ranked bets (after E1–E4 green)

1. Residual language as latent state (not graph embedding)  
2. Diffuse only unresolved decisions; reconstruct forced surface  
3. Boolean multi-hole support under fixed slots + Γ leaf filters (honest over-approx)  
4. \(h(e)\) reweight inside legal set (not reject sampling)  
5. Orbit + pointer for interchangeable symbols  
6. Grammar-cost optimization of equivalent packs  
7. Joint multi-position commit verification (MaskGIT gap)  

**Deprioritize:** LAVE-as-primary, online cubic CFG∩DFA every proposal, manifold embeddings, neural circuit as first milestone, model-facing topology without anti-E237.

## 10. Implementation sketch (when kernel lands)

```text
packages/ or external host:
  completion_artifact  → certify request-independent tables + tokenizer projection
  completion_executor  → interpret residual without Lark objects (E1/E2)
  semantic_state       → Γ bitsets + leaf filters (E1 Γ cases)
  forced_closure       → static macro edges (E4)
  metrics              → claim_class taxonomy; ban fixture_or_scratch promotion

Already in monorepo:
  @hobo/formal-interop → beqOpenUi, evaluateOpenUiPromotion, certificate replay, ledger
```

## 11. Immediate actions

1. Land ADR-0141 (this suite’s authority).  
2. Keep model-facing topology PRs blocked unless anti-E237 card present.  
3. When grammar kernel is available in-tree or as submodule: implement E1 runner first; do not start P3 circuit.  
4. Extend formal-interop ledger with E1–E9 rows as experiments run (`hypothesis` field may use `E1`… or a parallel `experiment` column in a new JSONL).

## 12. Shipped entry points (`@hobo/formal-interop`)

| API | Experiment |
|---|---|
| `runE1Parity` / `enumerateReference` / `enumerateExecutor` | E1 multiset parity; UNKNOWN≠UNSUPPORTED |
| `runE2Cold` | E2 cold labels; illicit memo-as-cold fails |
| `runE3LoadCheck` / `buildResidualArtifact` / `checkResidualArtifact` | E3 load tax + corruption |
| `runE4StaticMacros` / `forcedClosureStatic` | E4 macro edges |
| `runE8ZeroForward` | E8 zero-forward |
| `runE9ClaimHygiene` | E9 claim hygiene |
| `evaluateClaimClassGate` / promotion `claimClass` | fail-closed cold evidence |
| `validateAntiE237Card` / `runAntiE237Validation` | anti-E237 cards |
| `runExperimentSuite` | all of the above + JSONL ledger |

Ledger: `docs/plans/formal-interop-runs/experiments-e1-e9.jsonl`

## 13. Decision log

| Date | Decision |
|---|---|
| 2026-07-30 | Swarm verdict accepted: demote boxed triple; E1 executor parity is next engineering milestone; anti-E237 freeze on model-facing topology. |
| 2026-07-30 | Implemented offline residual kernel + E1–E9 runners in `@hobo/formal-interop`; 43 package tests green. |
