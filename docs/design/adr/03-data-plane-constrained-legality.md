---
type: Architecture Decision Record
title: "ADR-0141 — Constrained generation legality: executable residual control vs diffusion circuit vs frozen topology heads"
description: "Split the boxed AOT-DPDA + Γ + weighted AND–OR circuit claim into three products. Near-term: certified executable static control + SemanticState/Γ with fail-closed forest/Lark parity. Later: weighted decision circuit over choice variables only. Freeze model-facing topology heads until anti-E237 contracts pass. SAE and residual merge never authorize legality."
tags: [hobo, adr, data-plane, openui, constrained-generation, formal-interop]
---

# ADR-0141 — Constrained generation legality (executor · circuit · frozen topology)

> Companion to [ADR-0056](./03-data-plane.md#adr-0056) (app/UI generation), [ADR-0010](./03-data-plane.md#adr-0010) (certified generation), [ADR-0139](./03-data-plane.md#adr-0139) (hobo-code / OpenUI), and plan [0015 formal interop](../../plans/0015-formal-interop-hypotheses.md).  
> Evidence base: swarm adversarial rubber-duck on CPRH / AOT-DPDA × constrained diffusion (topology campaign record + arXiv:2508.10111 / 2602.00612 transfer).  
> **In-repo realization today:** `@hobo/formal-interop` (OpenUI IR BEq, fail-closed promotion, certificate replay) and `@hobo/code` OpenUI promotion hooks. External SLM grammar kernel paths (`completion_artifact` / `completion_kernel`) are referenced as campaign evidence, not as monorepo sources.

## Context

Constrained structured generation (OpenUI productions, grammar-constrained decode, multi-hole diffusion) repeatedly tempted a single “boxed triple”:

> **AOT DPDA + Γ (semantic state) + weighted AND–OR hypergraph/circuit**  
> as *the* architecture for cold-start **and** weight-mapping.

Campaign measurements and paper transfer falsify that unit:

| Claim | Verdict |
|---|---|
| Keep exact compiler graph; inject neural scores as weights — do **not** collapse legality into a manifold embedding | **True** (goal law: legality is discrete / certified) |
| Artifact is proof payload, not execution substrate; only tokenizer projection accelerates | **True** where only `direct_map` is consumed at production |
| Cold ~834 ms vs warm ~8 ms at hard OpenUI prefix | **Numbers true**, **misuse-prone** as AOT cold proof (warm = request-local memo) |
| Boxed triple is *the* architecture for cold-start **and** weight-mapping | **False as a unit** — three products glued |
| Manifolds / stacks / simplicial complexes for cold-start | **Correctly rejected** |
| “All-hole neural circuit = largest model breakthrough” (Mündler) | **Overclaim** — paper proves a *predicate*, not a circuit |
| LAVE as blueprint for multi-hole legality | **Branding overclaim** — forest-verified path is stronger and different |
| Model-facing richer topology (binder/mask/scope heads) | **Measured losing record** (E236–E729, X9–X21, …) |
| Residual equivalence removes validation | **Only if exact/certified**; SAE must never authorize legality |

Paper semantics worth keeping (not as control-loop blueprints):

- [arXiv:2508.10111](https://arxiv.org/abs/2508.10111) — multi-hole completability ⇔ CFG ∩ regular emptiness (**decision problem**).
- [arXiv:2602.00612](https://arxiv.org/abs/2602.00612) — unbounded hole spans (Σ*) can accept dead ends under real length bounds.

## Decision

### Three products (never one box)

| Product | Job | Near-term ship? | Model weights? |
|---|---|---|---|
| **P1 — Executable static control** | Legality without reconstructing Lark object graphs every request; certified residual language as latent state | **Yes — primary lever** | No |
| **P2 — Runtime Γ overlay** | Scope / symbols / schema / binders as fail-closed leaf filters (`SemanticState` bitsets in spirit) | **Yes — partial already** | Indirect only |
| **P3 — Weighted AND–OR circuit** | Multi-hole / semiring / training over **choice variables** inside the legal set | **Later — gated research** | Maybe |

Falsifying the circuit must **not** read as falsifying the executor (and vice versa). Goal law treats approaches as disposable — the boxed claim hard-coupled them.

### What ships near-term (demoted box that survives)

1. **Certified AOT executable static control** over residual languages already certified by the grammar/artifact path (not merely serialized LALR colors treated as a DPDA).
2. **Existing Γ / `SemanticState`** with fail-closed forest / Lark parity.
3. **Forced macro-edges** (`forced_closure` discipline): never across literals or incomplete coverage; enables I1/I2 singleton zero-forward.
4. **Diffuse only ambiguity** via a choice-codec residual; reconstruct forced surface tokens outside the neural path.
5. **Multi-hole completability as a predicate** implemented via residual forest support + Γ leaf filters (honest over-approx label when static CFG ignores Γ) — **not** cubic online Bar-Hillel on every proposal.
6. **Semantic / BEq gates** on OpenUI trees (in-repo: `beqOpenUi`, default-on OpenUI promotion) so syntax-perfect meaning-zero never promotes.

### Explicit non-goals (freeze / ban for production)

| Idea | Status | Why |
|---|---|---|
| Riemannian / simplicial / stack geometry as **runtime legality IR** | **No** | Wrong closure; productions not downward-closed |
| Collapse legality into manifold embedding of the parse graph | **No** | I6: legality is discrete/certified |
| Model-facing binder / mask / scope topology heads | **Freeze** | Measured no-op, train interference, or anti-causal decode (E236–E729, X9–X21) |
| LAVE N-sample Earley as primary | **No** | Approximate witnesses vs exact domain membership |
| Witness injection after rejects / recovery rewrite of prefix | **Diagnostic only** | Production fail-closed / I6 violation |
| SAE (or any learned router) as legality authority | **Forbidden** | Optional *proof-economics* tier only: \(C_v < (p_{\text{before}}-p_{\text{after}})C_r\); never “skip formal proof” |
| Market warm 89.8× as AOT cold | **Forbidden claim class** | Cite only as `request_local_memo_reuse` (E9) |
| In-band model-emitted `[REPROCESS]` controlling recovery | **Unsafe** | Verifier-owned outcomes only: `ACCEPT \| REMASK \| REPROCESS \| RESTART` |
| Pure zero-shot LLM translation as production promotion path | **No** | Aligns with plan 0015 durable direction |

### Ordered combinations (do not reorder)

1. Executable static control + Γ bitset filters → cold + parity  
2. + AOT forced macros + common_forced_run scheduling → zero-forward law  
3. + choice-codec as model space → diffuse ambiguity only  
4. + joint multi-hole support on residual (Mündler **predicate**) → MaskGIT cluster safety  
5. + tropical/counting \(h(e)\) reweight **inside legal set** → less distortion than reject sampling  
6. **Only then** semiring circuit / categorical flow on legal decision simplexes  

Skip any plan that puts (6) before (1).

### Residual merge and validation

- **Exact residual classes do not skip validation** — they *are* the compiled validator when σₖ signatures + independent checker exist.
- Unsound merge examples that **kill** naive residual merge: wrong stack height (parens), wrong Γ (REF candidates).
- **SAE / learned features:** research-only for optional validation tier economics; [feature-falsification](https://arxiv.org/abs/2601.05679)-style threats mean token features must never masquerade as “needs validation ⇒ skip formal.”

### Branding corrections

| Wrong slogan | Correct object |
|---|---|
| “AOT DPDA” for current artifact | Serialized LALR shift/reduce colors + tokenizer projection — **not** stack-prefix match / pop-push / guard IDs / forced macro IDs until built |
| “LAVE lookahead” for our multi-hole path | **Forest-verified speculative completion**: draft only from complete forest + re-verify |
| “One F/B pass for all holes” as Mündler theorem | **Research bet** (semiring / ExplainFuzz territory), not a theorem of 2508.10111 |
| “Topology helps” without contract | Requires anti-E237 pre-registration (see plan 0016) |

### Relationship to in-repo packages

| Surface | Role under this ADR |
|---|---|
| `@hobo/formal-interop` | Semantic BEq (meaning gate), fail-closed OpenUI promotion, certificate replay, metrics ledger H1–H7 |
| `@hobo/code` | OpenUI shell + default-on semantic promote option |
| `@hobo/training-pipeline` | `openUiArtifact` / `openUiSemanticOk` refuse path; training-engine port only for formal SLM eval |
| Future grammar host / SLM kernel (if/when in monorepo) | Must implement **P1+P2** before P3; E1–E9 gates in plan 0016 |

## Consequences

- **(+)** Cold-start investment targets executable residual control, not geometric IR or model-facing topology revival.
- **(+)** Paper transfer stays honest: keep completability *predicate* and bounded-hole dead-end warning; do not import witness injection or LAVE recovery into production.
- **(+)** Measured topology-head losses become a freeze with a kill-criteria contract, not a perpetual research sink.
- **(+)** Aligns formal-interop fail-closed gates with generation legality: missing cert / untyped claim / meaning-zero never promote.
- **(−)** Executable AOT control is **not yet** a DPDA in production — this ADR authorizes building it, not claiming it exists.
- **(−)** Multi-hole neural circuit remains gated; treewidth / Γ-dynamics / variable AST topology may force approximate BP with honest labels.
- **(−)** JIT ban remains unmeasured; default is AOT + interpret, specialize only after measured Γ-shape reuse.

## Anti-E237 experiment contract (any topology / hypergraph claim)

Pre-register before training:

- **Arms:** control / train-on·decode-off / train-on·decode-on  
- **Kill criteria:** no learning δ; applications>0 & choice_changes=0; choice_changes>0 & quality↓; train-on·decode-off damages primary  
- **Report:** stratified head acc by candidate-count; meaningful (not syntax-only); held_out + adversarial; **n≥20** for promotion; solver/runtime parity if solver claims  

**Minimum success bar for CPRH-as-model-facing:** held_out meaningful ≥ control+0.10 (n≥20) **and** causal decode not harmful **and** no train interference.

**Engine executor may ship without that bar** — different claim family (P1).

## Falsifiable near-term experiments (summary)

Full protocol: [`docs/plans/0016-constrained-diffusion-e1-parity.md`](../../plans/0016-constrained-diffusion-e1-parity.md).

| ID | Pass | Fail |
|---|---|---|
| **E1** Artifact executor parity | Candidate multisets + coverage ≡ reference on kernel corpus + hard prefix | Any mismatch / UNKNOWN→UNSUPPORTED collapse |
| **E2** Cold p50 (process-warm pack, request-cold) | Executor ≤ 0.5× baseline cold **and** E1 | Speedup only with primed domain caches |
| **E3** Load/check tax | Digest mode ≥10× load vs full reconstruct; still catch corruption | Corrupted tensors accepted |
| **E4** Static macro-edges | Match dynamic `forced_closure`; ≥30% fewer expansions on singleton prefixes | Compress across literals / incomplete |
| **E8** Weights-on-graph vs zero-forward | All backends `forwards_count==0` on singleton fixtures | Neural ranking before complete singleton proof |
| **E9** Reclassify 89.8× | Cite only as `request_local_memo_reuse` | Market as AOT cold |

## One-line research stance

**Execute the residual you already certify; force the forced; verify multi-hole commits against residual support with Γ filters; reweight only legal ambiguity. Do not fund manifolds, LAVE recovery, or another model-facing topology head until the executor parity and anti-E237 contracts pass.**

## Rubber-duck self-check (where this ADR can still be wrong)

1. Executable control might not win cold if the real tax is semantic arena / Γ rebuild — **flamegraph first**, not faith.  
2. Choice-codec residual circuits might be small enough that “circuit later” is too conservative — **measure node count vs L** before freezing.  
3. E729 harm might be weight-scale, not topology structure — still needs causal re-run, not revival without it.  
4. Decode-Time Grammars ([arXiv:2607.18357](https://arxiv.org/abs/2607.18357)) may share a closer Γ ABI than assumed — unvetted until reproduced.

## References

- Plan 0015 formal interop: `docs/plans/0015-formal-interop-hypotheses.md`
- Plan 0016 E1 parity suite: `docs/plans/0016-constrained-diffusion-e1-parity.md`
- Package: `packages/formal-interop`
- ADR-0056 app/UI generation; ADR-0010 generation pipeline; ADR-0139 hobo-code
- arXiv:2508.10111 · arXiv:2602.00612 · arXiv:2506.03887 (Pre³ literature hygiene only) · arXiv:2601.05679 (SAE falsification threat)
