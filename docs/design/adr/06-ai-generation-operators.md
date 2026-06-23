# AI generation, agents & operators — consolidated decisions

> Consolidated ADR decisions for **ai generation, agents & operators**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0010
**Forge: AI-generated providers gated by conformance.**

### Context
Provider/implementation breadth is a community bottleneck. Forge breaks it by **synthesizing** candidates and **certifying** them against a conformance trust boundary ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 9](../forge-generated-stack.md#plan-09)). This ADR defines both *what* Forge produces and *how* a candidate is synthesized, repaired, and made reproducible/trustworthy — so "generate a provider" is concrete.

### Decision
1. **Algorithm = template scaffold + LLM-fill + a conformance/trace-driven repair loop**, and the repair loop **reuses the `training-engine` optimizer** (OPTO/Trace, [ADR-0025](#adr-0025)) rather than a separate generator. Generation (cold-start) and live training ([Plan 23](../forge-generated-stack.md#plan-23)) are the two entry points of one engine.
2. **Inputs are contract-first.** The target **WIT port + its `@hobo/conformance` suite + the backend's Capability Manifest** are *authoritative*; provider docs/OpenAPI/Terraform and recorded stub/live traces are *material* (synthesis hints + behavioral oracle). **The primary injection defense is structural — the contract can't be overridden + the no-egress sandbox (point 3) bounds damage**; doc-scrubbing ([ADR-0023](02-identity-security.md#adr-0023)) is **best-effort defense-in-depth**, not a claim that natural-language injection is prevented. Material can never override the contract.
3. **The loop is generate → validate(sandboxed, no-egress) → repair(bounded budget; exhaustion → `forge.NeedsHuman`) → certify.** Certification **signs + pins provenance** (model, frozen prompt, seed, conformance report) and **promotes via the policy gate**: low-risk auto-certify, prod/high-trust human approval. **The generated artifact's dependency closure passes the supply-chain gate** (SBOM + CVSS≥7 block + SLSA signing, [ADR-0023](02-identity-security.md#adr-0023) §7) as a **certification precondition** — an LLM-chosen vulnerable transitive dep that passes conformance still fails certification. **Reproducibility is stated honestly:** certification is **re-verifiable** (conformance replays green), but **bit-reproduction of generation is guaranteed only for pinned-weights/self-hosted models** — for hosted LLM endpoints (silent weight updates behind an alias, non-deterministic seeds) repro is **best-effort**, and re-verification, not bit-repro, is the trust anchor.
4. **One pipeline for three artifact kinds** — providers, implementations, and Resource Definitions/Packs — all behind existing WIT ports + the conformance boundary.
5. **Events** `forge.Requested/CandidateGenerated/Validated/ValidationFailed/Repaired/NeedsHuman/Certified` make every step replayable/auditable.

### Consequences
- **(+)** Provider/impl/definition generation is a concrete, bounded, auditable loop reusing the conformance trust boundary, the Firecracker+wasm no-egress sandbox, and the training-engine.
- **(−)** Quality relies on a strong conformance suite, template library, and optimizer; cold-start from docs-only is the riskiest path and a repair budget trades thoroughness for cost.

## ADR-0014
**MCP as a first-class control surface.**

**Decision:** every CLI/SDK capability has an MCP equivalent with the same identity model. **Consequences:** agents are true operators; HoBo maintains a third interface surface in lockstep ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 7](../developer-experience.md#plan-07)).

## ADR-0025
**`"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only).**

### Context
HoBo lets AI implement, evolve, and live-fix WIT-port implementations ([Plan 23](../forge-generated-stack.md#plan-23)). A Vercel-Workflows-style directive — peer to `"use workflow"`/`"use step"` ([Plan 2](../sdk-api.md#plan-02)) — declares a method **AI-rewritable**, with optimization machinery modeled on proven frameworks (Microsoft [Trace](https://microsoft.github.io/Trace/), [Agent Lightning](https://microsoft.github.io/agent-lightning/stable/)) **without leaking those frameworks (or any ML/RL machinery) into the SDK surface** — the same separation HoBo enforces for Pact/OPA/Cedar ([ADR-0015](04-governance-verification.md#adr-0015)).

### Decision
1. **`"use training"` is the SDK directive** (with an equivalent `training(fn, opts)` wrapper) marking a method as an **AI-rewritable semantic function**. The body is the baseline (often a `stub()`); HoBo may rewrite its prompt/code. It composes with the existing semantic-function model — Contract/Eval/Policy/Trace and the gated promotion are unchanged.
2. **Rewritability requires semantic grounding.** A `"use training"` method must carry **intent (docstring/`@intent`) + contract (typed I/O + invariants + forbidden outputs) + rubric**; HoBo lints for their presence. These are the optimizer's instruction, hard boundary, and objective respectively.
3. **The optimizer is an engine behind a `training-engine` WIT port** ([Plan 20](../wasm-runtime-wit.md#plan-20)) with a **built-in default** (an OPTO/prompt-rewrite optimizer). **Microsoft Agent Lightning (`@hobo/provider-agent-lightning`) and Microsoft Trace (`@hobo/provider-trace`) are optional adapters behind that port, selected per tenant/Camp, and are NEVER part of the SDK surface.** SDK users never import or configure them; swapping the optimizer is a config change, not an app-code change.
   - **From Trace:** treat the graph of trainable methods as an optimizable computational graph; feedback propagates back and rewrites trainable parameters in place (OPTO).
   - **From Agent Lightning:** decouple execution from training — the running method emits trajectories; a separate trainer/store optimizes via RL (GRPO/PPO), APO, or SFT. This mirrors HoBo's data-plane/control-plane split.
4. **Runtime capture = OTel + OpenInference.** Each invocation emits OpenInference-convention spans (layered on existing OTel, [Plan 5](../reliability-observability-cost.md#plan-05)); a *trajectory* (span tree + I/O + reward + correlation) is the training-data unit, persisted via the event log. **PII in trajectories is resolved explicitly** (reconciling [ADR-0023](02-identity-security.md#adr-0023) §8 "redact at capture" with trajectory storage): trajectories are **redacted/tokenized at capture** by default so cleartext PII never enters the log; where the optimizer/judge genuinely needs raw text, it reads it only via a **policy-gated in-boundary decryption**, and **external optimizer/judge providers (Agent Lightning/Trace) are barred from PII-classified content** — they receive redacted trajectories (accepting the capability tradeoff), never decrypted PII.
5. **Live-evals are the training signal.** Rubrics scored online on live/shadow traffic attach the reward each trajectory needs **and** serve as performance telemetry; they are the optimizer's objective and feed the promotion gate.
6. **No new trust path — and the gate bounds reward-hacking.** A trained candidate goes through the **same gate** as any Forge impl: sandboxed conformance (contract) + eval thresholds + policy + champion/challenger/shadow. Because an optimizer can **game a flawed proxy reward** (maximize the LLM-judge score while degrading real quality), rubric-presence lint (point 2) is **necessary but not sufficient**: the eval gate requires a **held-out / adversarial eval split + a judge-independence (or human-label sampling) floor** as **hard terms** — a candidate that beats the training judge but fails the held-out/independent check does **not** promote. Every step is an event (`training.*`, `eval.*`, `impl.Promoted`).

### Consequences
- **(+)** Developers get a one-word, intent-revealing way to opt a method into continuous improvement grounded in real recorded execution (OpenInference trajectories), with the hard ML/RL parts internal, swappable, and gated by the existing conformance/eval/policy machinery.
- **(−)** A rewritable method that lacks good intent/rubric optimizes poorly (hence the lint requirement), and online eval + trajectory storage add runtime cost.

## ADR-0048
**Persisted code-mutation mechanism (for `"use training"` promotion).**

### Context
[Plan 23](../forge-generated-stack.md#plan-23) + [ADR-0025](#adr-0025): the `training-engine` continuously rewrites `"use training"` semantic functions (prompt/code) and, when a candidate passes eval/conformance, **promotes** it. "Promote" needs a concrete, safe **persistence mechanism** — how a generated mutation lands back in source without clobbering hand-written code, with provenance and review. The [runtime-code-mutation-persistence pattern](../../../patterns/runtime-code-mutation-persistence.md) (ts-morph / recast / jscodeshift / magic-string + unified-diff apply) is the toolbox.

### Decision
1. **Promotion persists via AST-aware, region-scoped edits — never blind string patches.** A promoted candidate is applied with an **AST/codemod tool** (recast/ts-morph-style, format-preserving) confined to a **clearly demarcated generated region** of the `"use training"` method (the prompt/body the engine owns), leaving hand-written code untouched. Output is a minimal, format-preserving diff.
2. **Generated vs hand-written is explicit.** A `"use training"` method's optimizable region is marked (a directive boundary) so codegen/promotion only ever rewrites inside it — the same generated-vs-authored distinction as the `_generated/` codegen surface ([ADR-0037](05-config-matching-environments.md#adr-0037)); promoted regions carry a header noting they're engine-managed + their provenance id.
3. **Provenance-pinned + gated, as a reviewable change — subordinate to org governance.** A promotion emits the existing `training.Promoted`/`impl.Promoted` events ([Plan 11](../data-plane.md#plan-11)) carrying **signed provenance** (model, prompt, seed, eval/conformance report — the same trust boundary as Forge, [Plan 23](../forge-generated-stack.md#plan-23)). The persisted mutation lands as a **gated change** ([Plan 29](../contracts-policy-flags.md#plan-29)): low-risk → auto-commit to the generated region with provenance; prod/high-trust → **open a PR/Delta for human approval**. The auto-commit-vs-PR risk tier is **itself a `hobo:*` control-plane action subordinate to the [ADR-0074](02-identity-security.md#adr-0074) mandatory-policy-rule (deny-ceiling)** — an org `mandatory` "2-person approval for prod code/prompt changes" or "no auto-commit in prod" **overrides** the risk-tier default (the SWE/SRE operator is an RBAC principal that can't exceed its role), so risk-tiering never silently bypasses an org deny-ceiling.
4. **Idempotent + round-trippable.** Re-applying the same candidate is a no-op (like `codegen --check`, [ADR-0037](05-config-matching-environments.md#adr-0037)); the prior region is recoverable (the event log holds every candidate), so a promotion is reversible by re-promoting the previous one.

### Consequences
- **(+)** `"use training"` promotion has a concrete, safe persistence path — AST-aware, region-scoped, provenance-pinned, gated, idempotent — keeping running behavior in VCS (auditable, reviewable, replayable) and reusing the Forge trust boundary + policy gate + GitOps/PR machinery.
- **(−)** AST codemod fidelity across TS constructs is non-trivial and the generated-region boundary is a discipline authors must respect; a human edit *inside* a generated region is a **collision** resolved by `--check` refusing to auto-commit and escalating to a PR (never clobbering the hand edit).

## ADR-0054
**Operator Agents (the Crew): built-in autonomous Yard services.**

### Context
HoBo treats agents as first-class principals ([Plan 6](../ai-native-agent-auth.md#plan-06)), exposes every capability over MCP, and has the operational substrate (live-fix, drift/auto-rollback, pipelines, SLO/alerting, observability projections, Forge, Matching, app generation). The Crew is the **named set of operator agents** that *use* that substrate to run the platform — the concrete form of the "AI SRE / AI GitOps / AI policy enforcement / AI software & UX" goals. "Agent" means an autonomous principal; the outbound network proxy is the **Relay** ([Plan 25](../platform-engineering.md#plan-25)).

### Decision
1. **Ship a built-in roster — the Crew** as **first-class Yard services**, batteries-included but **pluggable** (each disableable/overridable per Yard; each brain is an **engine behind a port** with a built-in default + optional external providers):
   - **SRE** → live-fix + observability + drift/auto-rollback ([Plan 40](../operators-sre.md#plan-40)/[Plan 40](../operators-sre.md#plan-40)).
   - **Endpoint Monitor** → synthetic probes + SLO/alerting.
   - **GitOps** → pipelines + can-deploy promotion.
   - **Platform Engineer** → Matching + packs + Forge (authors Resource Definitions/policy packs).
   - **UX Designer** → app/UI generation ([ADR-0056](#adr-0056)): owns **design.md** (the required design-system spec), drives **OpenUI** + **json-render** + **mcp-apps**, and renders against the `ui-render` port; reactive to the data plane's materializations.
   - **SWE (software engineer)** → a general software-engineering operator: implements/refactors/repairs **business + message** code behind ports, drives the Forge + `"use training"` loop and persisted code-mutation ([ADR-0048](#adr-0048)), opens gated Deltas/PRs. The generalist counterpart to the specialist operators.
2. **Each operator is a named principal on the existing model** ([Plan 6](../ai-native-agent-auth.md#plan-06)): SVID identity, per-agent policy + spend caps, event-sourced runs, MCP surface, least-privilege `.allow()`. No new identity/policy mechanism — the roster *is* the agent-principal model applied to operations.
3. **Reads are autonomous; writes are policy-gated** ([Plan 29](../contracts-policy-flags.md#plan-29)): diagnosis/monitoring run freely; mutations take an effect/obligation (auto / canary-with-auto-rollback / require-approval) keyed by blast radius + environment ([Plan 5](../reliability-observability-cost.md#plan-05)).
4. **All operators run sandboxed under enforced AI governance by default** ([ADR-0061](04-governance-verification.md#adr-0061)): every operator (its reasoning + tool calls) executes in a sandboxed environment with **NVIDIA NeMo Guardrails** and the **Microsoft AI governance / Responsible AI toolkit** enforced as the default guardrail layer — moderation, jailbreak/PII checks, and capability-scoped tool access. This is enforced, not opt-in.
5. **Operators compose existing subsystems, they don't reinvent them.** External brains (e.g. HolmesGPT for SRE) sit behind ports. Events: a thin `crew.*` family + reuse of existing `run.*`/`incident.*`/`pipeline.*`/`policy.Decided`.

### Consequences
- **(+)** Delivers "AI SRE / AI GitOps / AI policy enforcement" concretely, reusing the principal/policy/event/MCP substrate — audited, policy-gated, replayable, and pluggable (swap an engine, disable an operator, or BYO; air-gap-friendly).
- **(−)** Autonomous operators acting on prod are a trust surface; bounded by org RBAC, sandbox-lane write-experiments before any canary, default-gated writes, spend caps, dispatch/handoff-depth caps + flapping debounce, blast-radius limits, and full audit.

## ADR-0055
**The generated stack: a layered model for AI generation/self-healing/persistence.**

### Context
HoBo's AI-native capabilities span several layers: data-plane materializations ([Plan 32](../data-plane.md#plan-32)), Forge-generated providers/impls ([Plan 23](../forge-generated-stack.md#plan-23)), trainable semantic functions ([Plan 23](../forge-generated-stack.md#plan-23)), persisted mutation ([ADR-0048](#adr-0048)), and app/UI generation ([ADR-0056](#adr-0056)). These share one loop, one log, one trust boundary, and one persistence mechanism. A unifying model makes the promise legible across the whole stack — from infrastructure up to the app's UI.

### Decision
1. **Adopt a five-layer taxonomy for generation: data · business · message · intelligence · ui.** It is a *map over existing mechanisms*, not new runtime: each layer names what HoBo generates, who owns it, how it self-heals, and how it persists. The **ui** layer ([ADR-0056](#adr-0056)) is generated from intent + **design.md** via OpenUI/json-render/mcp-apps, owned by the **UX Designer** operator, and reactive to the data plane's materializations.
2. **One generation loop across layers** — the Forge loop (scaffold → LLM-fill → validate-sandboxed → repair → certify) ([Plan 23](../forge-generated-stack.md#plan-23)); only inputs/oracles differ per layer.
3. **One trust boundary** — nothing generated is trusted without conformance + policy + eval ([Plan 9](../forge-generated-stack.md#plan-09)/[Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 29](../contracts-policy-flags.md#plan-29)); **one persistence mechanism** — region-scoped AST edits + provenance ([ADR-0048](#adr-0048)), generated regions demarcated, hand-written intent never clobbered, drift-gated ([ADR-0037](05-config-matching-environments.md#adr-0037)).
4. **One self-healing reflex, with an explicit per-layer auto-fix-eligibility flag** — classify → propose-fix → validate → gated-apply (live-fix [Plan 23](../forge-generated-stack.md#plan-23) + drift/auto-rollback [Plan 5](../reliability-observability-cost.md#plan-05)), driven by the **SRE** and **SWE** operators ([Plan 40](../operators-sre.md#plan-40)). "Degrades to propose" is not left to operator judgment — each layer carries a declared **`autoFixEligible`** attribute the policy plane enforces ([Plan 29](../contracts-policy-flags.md#plan-29)): **data and business are auto-fix-eligible** (a deterministic, contract-gated, reversible fix may auto-apply behind a canary + auto-rollback), while **message and ui are propose-only** (the SWE/UX-Designer operator may only open a gated Delta/PR — never auto-apply) because their correctness oracle is weaker (no hard conformance over choreography side-effects or free-text design prose, [ADR-0056](#adr-0056) §2). A layer with no strong oracle **cannot be flipped to auto-apply by config** — it is a guardrail ([ADR-0074](02-identity-security.md#adr-0074)), so a mis-set Resource Definition can't silently start auto-mutating UI/message code.
5. **Message is a first-class generated layer:** message-handler/choreography generation from WIT-record event types.

### Consequences
- **(+)** Makes the AI-native promise legible end-to-end — infrastructure through UI — reusing one loop/boundary/persistence across all layers, giving the operator agents ([Plan 40](../operators-sre.md#plan-40)) a clear per-layer remit with a consistent safety story (deterministic codegen reproducible; non-deterministic promotions region-isolated, provenance-pinned, prod-gated).
- **(−)** Uniform framing can over-promise: layers self-heal unequally; the docs state this explicitly to avoid implying message/ui heal as maturely as data/business.

## ADR-0056
**App/UI generation (design.md · OpenUI · json-render · mcp-apps · the `ui-render` port).**

### Context
The AI-native thesis is to generate the application from intent — not only its infrastructure but its **UI**. HoBo generates data/business/message/intelligence layers ([ADR-0055](#adr-0055)); the **ui** layer needs a concrete mechanism, an owner, and a trust boundary, distinct from HoBo's own operator dashboard ([Plan 7](../developer-experience.md#plan-07)).

### Decision
1. **`ui-render` is a port** with pluggable engine adapters: **OpenUI** (generate UI from intent) and **json-render** (a declarative render IR), plus **mcp-apps** (MCP-driven app surfaces) so agents can drive and inspect the UI like any other capability. Custom adapters plug in behind the same port.
2. **`design.md` is a required input** — the design-system spec (tokens, components, layout constraints, a11y rules) that HoBo generates and then **enforces**. The enforcement is honest about what's mechanically checkable: its **machine-checkable subset — design tokens, a11y rules, an allowed-component allowlist — is a hard gate** (UI violating it fails); prose layout/aesthetic constraints are **advisory** (LLM-judged, not a hard oracle). So it is conformance-*like* for the checkable subset, not full conformance-parity over free-text design prose.
3. **The UX Designer operator owns it** ([ADR-0054](#adr-0054)): it generates/maintains the UI against design.md, runs sandboxed under enforced AI governance ([ADR-0061](04-governance-verification.md#adr-0061)), and lands changes via the same persisted-mutation + policy gate as any generated code ([ADR-0048](#adr-0048)).
4. **Generated UI is typed from the domain + reactive to materializations.** Components are typed from the WIT-record domain schema ([ADR-0051](03-data-plane.md#adr-0051)) and bind to the data plane's reactive materializations / GraphQL facade ([ADR-0050](03-data-plane.md#adr-0050)), so the UI updates as state changes.

### Consequences
- **(+)** Completes the generated stack up to the UI — the app (infra and front-end) is generatable from intent, design-constrained, typed, and reactive — reusing the existing generation loop, trust boundary, persisted-mutation, and operator/governance machinery (a port + design.md, not a new plane).
- **(−)** UI quality depends on the engine + design.md fidelity; weak design specs yield weak UI.

## ADR-0058
**SRE: incident management, runbooks & the self-healing decision model.**

### Context
HoBo has alerting/SLO ([ADR-0045](04-governance-verification.md#adr-0045)), pipelines ([Plan 25](../platform-engineering.md#plan-25)), AI live-fix ([Plan 23](../forge-generated-stack.md#plan-23)), drift + auto-rollback ([Plan 5](../reliability-observability-cost.md#plan-05)), and chaos ([ADR-0047](04-governance-verification.md#adr-0047)) — strong reflexes. The **management** layer over them covers `incident.*`, a runtime + contract failure taxonomy, the SRE operator's decision logic, first-class **runbooks**, MTTD/MTTR, on-call/escalation, postmortems, and obligation deadlines/escalation.

### Decision
1. **Incident is a first-class aggregate** ([ADR-0053](03-data-plane.md#adr-0053)): stream `incident:<id>`, single-writer, rebuildable, correlating loose signals (`alert.*`/`slo.BudgetBurned`/`resource.DriftDetected`/`compat.GateFailed`/`spend.CircuitTripped`) into one command point. The **`incident.*`** events are `Opened`/`Triaged`/`RootCauseIdentified`/`RemediationProposed`/`RemediationApplied`/`RemediationFailed`/`Resolved`/`SLABreached`/`PostmortemFiled`.
2. **The SRE operator runs a documented decision tree:** diagnose (projections; optional HolmesGPT behind a port) → classify → **auto-fix** (low-risk/reversible/in-budget/conformance-green) | **propose** (gated Delta/PR) | **escalate** (page on-call). **An auto-fix is *first* proved in a strictly-isolated [ADR-0076](04-governance-verification.md#adr-0076) sandbox lane (R7) — not applied directly to a baseline service** — and only then promoted via the live-fix canary + auto-rollback; if the candidate can't be lane-contained (e.g. it needs a baseline lease), it routes to an ephemeral-Camp clone or degrades to *propose*. The "low-risk auto" threshold thus governs **lane → canary** promotion, never unguarded prod edits. Every branch is `crew.*` + `policy.Decided` + `incident.*` — replayable; no silent action on unclassifiable failures. A **per-incident/per-signal dispatch + handoff-depth cap + flapping debounce** bounds a runaway operator loop (re-dispatch/`crew.HandoffRequested` churn) that spend-caps ([ADR-0054](#adr-0054)) wouldn't catch.
3. **One runtime failure-taxonomy → safe-fix map** unifies Plan 5 runtime classes + Plan 23/29 contract classes; **live-fix applies, the taxonomy classifies**; every strategy is reversible + gated.
4. **Runbooks are first-class, declarative, event-sourced** (`runbook.*`), versioned/signed like Resource Packs, **built on the Pipelines engine** ([Plan 25](../platform-engineering.md#plan-25)) as the incident-response sibling of deploy pipelines; HolmesGPT/StackStorm are optional engines behind the port.
5. **MTTD/MTTR are OpenSLO SLOs** with error budgets that gate (burn → freeze risky deploys / require postmortem); **on-call escalation is a policy obligation with a deadline** (resolves the Plan 30 hook); **postmortems are generated by replay** and feed gated runbook/prompt updates.

### Consequences
- **(+)** A coherent, auditable incident-management story (one aggregate + two event families + a taxonomy table + runbooks-on-pipelines), where postmortem-as-replay + failure→regression-test make incidents a learning loop and engines behind ports (HolmesGPT/StackStorm/pagers) keep it pluggable and air-gap-friendly.
- **(−)** An autonomous SRE acting on prod is a trust surface (mitigated by default-gated writes, blast-radius + spend budgets, escalate-on-unknown, full audit), and on-call is lean — full ITSM is out of first-cut scope.
