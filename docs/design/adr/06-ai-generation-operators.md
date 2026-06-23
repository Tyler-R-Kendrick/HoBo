# AI generation, agents & operators — consolidated decisions

> Consolidated ADR decisions for **ai generation, agents & operators**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0010
**Forge: AI-generated providers gated by conformance.**

**Decision:** generate candidate providers from docs/OpenAPI/TF, certify via sandboxed conformance tests, sign + publish. **Consequences:** breaks the community-bottleneck on provider breadth; relies on a strong conformance suite as the trust boundary ([Plan 6](../06-ai-native-agent-auth.md), [Plan 9](../09-verification-open-questions.md)).

## ADR-0014
**MCP as a first-class control surface.**

**Decision:** every CLI/SDK capability has an MCP equivalent with the same identity model. **Consequences:** agents are true operators; we maintain a third interface surface in lockstep ([Plan 6](../06-ai-native-agent-auth.md), [Plan 15](../15-cli-dx.md)).

## ADR-0025
**`"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only).**

### Context
HoBo lets AI implement, evolve, and live-fix WIT-port implementations ([Plan 23](../23-stubbable-ai-implementations.md)), but the SDK had no first-class way for a developer to say *"this method is mine to define, but I want HoBo to keep improving it."* The marker was implicit (`stub()` + Forge). We want a Vercel-Workflows-style directive — peer to `"use workflow"`/`"use step"` ([Plan 2](../02-sdk-api.md)) — that declares a method **AI-rewritable**, and we want the optimization machinery modeled on proven frameworks (Microsoft [Trace](https://microsoft.github.io/Trace/), [Agent Lightning](https://microsoft.github.io/agent-lightning/stable/)) **without leaking those frameworks (or any ML/RL machinery) into the SDK surface** — the same separation we already enforce for Pact/OPA/Cedar ([ADR-0015](04-governance-verification.md#adr-0015)).

### Decision
1. **`"use training"` is the SDK directive** (with an equivalent `training(fn, opts)` wrapper) marking a method as an **AI-rewritable semantic function**. The body is the baseline (often a `stub()`); HoBo may rewrite its prompt/code. It composes with the existing semantic-function model — Contract/Eval/Policy/Trace and the gated promotion are unchanged.
2. **Rewritability requires semantic grounding.** A `"use training"` method must carry **intent (docstring/`@intent`) + contract (typed I/O + invariants + forbidden outputs) + rubric**; HoBo lints for their presence. These are the optimizer's instruction, hard boundary, and objective respectively.
3. **The optimizer is an engine behind a `training-engine` WIT port** ([Plan 24](../24-wit-interfaces-reference.md)) with a **built-in default** (an OPTO/prompt-rewrite optimizer). **Microsoft Agent Lightning (`@hobo/provider-agent-lightning`) and Microsoft Trace (`@hobo/provider-trace`) are optional adapters behind that port, selected per tenant/Camp, and are NEVER part of the SDK surface.** SDK users never import or configure them; swapping the optimizer is a config change, not an app-code change.
   - **From Trace:** treat the graph of trainable methods as an optimizable computational graph; feedback propagates back and rewrites trainable parameters in place (OPTO).
   - **From Agent Lightning:** decouple execution from training — the running method emits trajectories; a separate trainer/store optimizes via RL (GRPO/PPO), APO, or SFT. This mirrors HoBo's data-plane/control-plane split.
4. **Runtime capture = OTel + OpenInference.** Each invocation emits OpenInference-convention spans (layered on existing OTel, [Plan 14](../14-observability.md)); a *trajectory* (span tree + I/O + reward + correlation) is the training-data unit, persisted via the event log.
5. **Live-evals are the training signal.** Rubrics scored online on live/shadow traffic attach the reward each trajectory needs **and** serve as performance telemetry; they are the optimizer's objective and feed the promotion gate.
6. **No new trust path.** A trained candidate goes through the **same gate** as any Forge impl: sandboxed conformance (contract) + eval thresholds + policy + champion/challenger/shadow. Every step is an event (`training.*`, `eval.*`, `impl.Promoted`).

### Alternatives considered
- **Expose Agent Lightning / Trace APIs in the SDK** — rejected: leaks ML/RL machinery and a third-party dependency into the agnostic SDK, contradicting [ADR-0015](04-governance-verification.md#adr-0015); couples app code to an optimizer.
- **A `stub()`/config flag instead of a directive** — rejected: less discoverable and inconsistent with the `"use workflow"`/`"use step"` family; the directive reads as intent at the call site.
- **A bespoke HoBo optimizer only (no provider seam)** — rejected: the built-in is the default, but a port lets HoBo adopt Agent Lightning/Trace (and future optimizers) without SDK churn, and lets advanced tenants swap engines.
- **Proprietary AI-span telemetry** — rejected in favor of OpenInference (OTel-native, no backend lock-in, reuses existing tracing).

### Consequences
- **(+)** Developers get a one-word, intent-revealing way to opt a method into continuous improvement; the hard ML/RL parts stay internal and swappable.
- **(+)** Training is grounded in real recorded execution (OpenInference trajectories) and gated by the existing conformance/eval/policy machinery — auditable and reversible, no new trust surface.
- **(+)** HoBo can use best-in-class Microsoft frameworks internally without exposing or depending on them at the SDK boundary.
- **(−)** Online eval (LLM-judge) and trajectory storage add runtime cost; mitigated by sampling + min-samples floors (iteration hook in [Plan 23](../23-stubbable-ai-implementations.md)).
- **(−)** HoBo must define and version the `training-engine` WIT port and a trajectory schema, and maintain a built-in optimizer even when providers exist (the no-hard-dependency rule).
- **(−)** A rewritable method that lacks good intent/rubric optimizes poorly — hence the lint requirement; "garbage rubric in, garbage optimization out" is a real failure mode to document.

## ADR-0030
**Forge generation: inputs & algorithm.**

- **Origin:** the gap analysis found HoBo's headline differentiator — "the Forge generates providers/implementations" — specified only at the *conformance-gate* level; the *generation* algorithm itself was undefined. Designed via brainstorming + grill-with-docs.

### Context
ADR-0010 establishes that Forge artifacts are **gated by conformance**; ADR-0025 establishes a `training-engine` that optimizes live `"use training"` implementations. Neither says **how a candidate is synthesized in the first place** — the inputs it trusts, how it's repaired toward passing, or how the result is made reproducible/trustworthy. Without that, "generate a provider" is aspirational. Competitors (Aspire/Nitric/Humanitec) ship concrete generation/templating; HoBo needs the generation loop to be real.

### Decision
1. **Algorithm = template scaffold + LLM-fill + a conformance/trace-driven repair loop**, and the repair loop **reuses the `training-engine` optimizer** (OPTO/Trace, ADR-0025) rather than a separate generator. Generation (cold-start) and live training (Plan 23) are the two entry points of one engine.
2. **Inputs are contract-first.** The target **WIT port + its `@hobo/conformance` suite + the backend's Capability Manifest** are *authoritative*; provider docs/OpenAPI/Terraform and recorded stub/live traces are *material* (synthesis hints + behavioral oracle). Material is treated as **untrusted data** — sanitized/scrubbed for prompt injection (ADR-0023); it can never override the contract.
3. **The loop is generate → validate(sandboxed, no-egress) → repair(bounded budget; exhaustion → `forge.NeedsHuman`) → certify.** Certification **signs + pins provenance** (model, frozen prompt, seed, conformance report) and **promotes via the existing policy gate** (ADR-0010): low-risk auto-certify, prod/high-trust human approval.
4. **One pipeline for three artifact kinds** — providers, implementations, and Resource Definitions/Packs — all behind existing WIT ports + the conformance boundary.
5. **Events** `forge.Requested/CandidateGenerated/Validated/ValidationFailed/Repaired/NeedsHuman/Certified` make every step replayable/auditable.

### Alternatives considered
- **Pure-LLM synthesis, gate-only** (emit the whole artifact, then just run conformance) — rejected as the default: maximal repair burden, least determinism, larger injection surface; the scaffold + bounded repair is more reliable.
- **Pure program-synthesis/optimization over the conformance suite (no scaffold)** — rejected: heavier and slower to a first candidate; the template makes structure deterministic so only capability logic is synthesized. (The optimizer is still used — for *repair* — so we keep its benefit.)
- **Docs-first / trace-first authoritative inputs** — rejected: docs/OpenAPI are external/untrusted (injection risk) and traces don't exist for a cold-start provider; the contract (WIT + conformance) is the only trustworthy authority and is already the certification gate.
- **A separate Forge generator distinct from the training-engine** — rejected: duplicates the optimizer and splits provenance; unifying them keeps "generate" and "evolve" consistent.

### Consequences
- **(+)** "Generate a provider/impl/definition" becomes a concrete, bounded, auditable loop; the differentiator is demonstrable, not hand-wave.
- **(+)** Reuses the conformance trust boundary, the Firecracker+wasm no-egress sandbox, and the training-engine — minimal new machinery.
- **(+)** Contract-first + sanitized material keeps generation safe against malicious provider docs.
- **(−)** Quality depends on the template library + the optimizer; cold-start from docs-only (no Capability Manifest) is the riskiest path and is deferred.
- **(−)** A repair budget trades thoroughness for cost ([Plan 16](../16-cost-finops.md)); some artifacts will escalate to humans (`forge.NeedsHuman`) — acceptable and explicit.

## ADR-0048
**Persisted code-mutation mechanism (for `"use training"` promotion).**

- **Origin:** the ecosystem review found Plan 23 *promotes* AI-rewritten implementations (`impl.Promoted`/`training.Promoted`) but the **mechanism to persist a runtime/AI-generated code mutation back to source** was unspecified.

### Context
[Plan 23](../23-stubbable-ai-implementations.md) + [ADR-0025](#adr-0025): the `training-engine` continuously rewrites `"use training"` semantic functions (prompt/code) and, when a candidate passes eval/conformance, **promotes** it. But "promote" needs a concrete, safe **persistence mechanism** — how a generated mutation lands back in source without clobbering hand-written code, with provenance and review. The [runtime-code-mutation-persistence pattern](../../../patterns/runtime-code-mutation-persistence.md) (ts-morph / recast / jscodeshift / magic-string + unified-diff apply) is the toolbox; this ADR specifies HoBo's use of it.

### Decision
1. **Promotion persists via AST-aware, region-scoped edits — never blind string patches.** A promoted candidate is applied with an **AST/codemod tool** (recast/ts-morph-style, format-preserving) confined to a **clearly demarcated generated region** of the `"use training"` method (the prompt/body the engine owns), leaving hand-written code untouched. Output is a minimal, format-preserving diff.
2. **Generated vs hand-written is explicit.** A `"use training"` method's optimizable region is marked (a directive boundary) so codegen/promotion only ever rewrites inside it — the same generated-vs-authored distinction as the `_generated/` codegen surface ([ADR-0037](05-config-matching-environments.md#adr-0037)); promoted regions carry a header noting they're engine-managed + their provenance id.
3. **Provenance-pinned + gated, as a reviewable change.** A promotion emits the existing `training.Promoted`/`impl.Promoted` events ([Plan 11](../11-event-model.md)) carrying **signed provenance** (model, prompt, seed, eval/conformance report — the same trust boundary as Forge, [Plan 33](../33-forge-generation-pipeline.md)). The persisted mutation lands as a **gated change** ([Plan 30](../30-policy-plane.md)): low-risk → auto-commit to the generated region with provenance; prod/high-trust → **open a PR/Delta for human approval** (reusing the GitOps publisher + approval hooks, [Plan 28](../28-relay-gitops-pipelines.md)/[Plan 6](../06-ai-native-agent-auth.md)).
4. **Idempotent + round-trippable.** Re-applying the same candidate is a no-op (like `codegen --check`, [ADR-0037](05-config-matching-environments.md#adr-0037)); the prior region is recoverable (the event log holds every candidate), so a promotion is reversible by re-promoting the previous one.

### Alternatives considered
- **Blind text/regex patching of source.** Rejected: clobbers formatting/hand-written code, not round-trippable, unreviewable.
- **Keep promoted code only in a runtime store (never persist to source).** Rejected: divorces running behavior from the repo (the "what's actually deployed" drifts from VCS), breaks review/audit-in-Git, and conflicts with the deterministic-build/`_generated/` model.
- **Always require a human PR for every promotion.** Rejected as the default: low-risk dev promotions should be able to auto-apply to the generated region (gated by policy); prod/high-trust escalates to a PR — same risk-tiering as Forge certification ([Plan 33](../33-forge-generation-pipeline.md)).

### Consequences
- **(+)** Closes #29: `"use training"` promotion has a concrete, safe persistence path — AST-aware, region-scoped, provenance-pinned, gated, idempotent — bridging the training loop ([Plan 23](../23-stubbable-ai-implementations.md)) to source + the `_generated/` surface ([ADR-0037](05-config-matching-environments.md#adr-0037)).
- **(+)** Reuses the Forge trust boundary (signed provenance + eval/conformance), the policy gate, and the GitOps/PR + approval-hook machinery — no new plane, just a specified mechanism + the codemod toolchain.
- **(+)** Keeps running behavior in VCS (auditable, reviewable, replayable), preserving the deterministic-build promise.
- **(−)** AST codemod fidelity across TS constructs is non-trivial; advanced rewrites may need the human-PR path more often (acceptable, and the gate makes it explicit).
- **(−)** The generated-region boundary is a discipline authors must respect; editing inside it risks a future promotion overwriting hand edits (mitigated by the region header + the no-op/`--check` guard surfacing drift).

## ADR-0054
**Operator Agents (the Crew): built-in autonomous Yard services.** Accepted (amended by [ADR-0064](08-scope-and-requirements.md#adr-0064) — the **UX-Designer** operator is removed as app-build-out; the roster is SRE/Endpoint Monitor/GitOps/Platform Engineer)

- **Origin:** the product vision names a first-class operator-agent roster (SRE/Endpoint Monitor/GitOps/Platform Engineer). The substrate existed (agent-principal model, MCP, live-fix, drift, pipelines, observability) but no roster was specified, and "the HoBo Agent" (proxy) collided with the term.

### Context
HoBo already treats agents as first-class principals ([Plan 6](../06-ai-native-agent-auth.md)) and exposes every capability over MCP, and it has the operational substrate (live-fix, drift/auto-rollback, pipelines, SLO/alerting, observability projections, Forge, Matching). What it lacked was a **named set of operator agents** that *use* that substrate to run the platform — the concrete form of the "AI SRE / AI GitOps / AI policy enforcement" goals. Two questions: (1) are these built-in or left to each team; (2) how do they relate to the existing "agent" notions (and the proxy formerly called "the HoBo Agent").

### Decision
1. **Ship a built-in roster — the Crew** (SRE, Endpoint Monitor, GitOps, Platform Engineer) as **first-class Yard services**, batteries-included but **pluggable** (each disableable/overridable per Yard; each brain is an **engine behind a port** with a built-in default + optional external providers).
2. **Each operator is a named principal on the existing model** ([Plan 6](../06-ai-native-agent-auth.md)): SVID identity, per-agent policy + spend caps, event-sourced runs, MCP surface, least-privilege `.allow()`. No new identity/policy mechanism — the roster *is* the agent-principal model applied to operations.
3. **Reads are autonomous; writes are policy-gated** ([Plan 30](../30-policy-plane.md)): diagnosis/monitoring run freely; mutations take an effect/obligation (auto / canary-with-auto-rollback / require-approval) keyed by blast radius + environment ([Plan 5](../05-reliability-ha.md)).
4. **Operators compose existing subsystems, they don't reinvent them:** SRE→live-fix+observability+drift; Endpoint Monitor→SLO/alerting; GitOps→pipelines+can-deploy; Platform Engineer→Matching+packs+Forge. External brains (HolmesGPT for SRE) sit behind ports.
5. **Reserve "Agent" for principals; rename the proxy to the Relay** ([Plan 28](../28-relay-gitops-pipelines.md)). Events: a thin `crew.*` family + reuse of existing `run.*`/`incident.*`/`pipeline.*`/`policy.Decided`.

### Alternatives considered
- **Skills-only on the generic `agent()` primitive (no built-in services).** Rejected as the default per product decision: leaves every team to wire core operations; loses the batteries-included, audited-by-default value. (Skills still exist — `@hobo/agent-skills` — and compose *into* the built-in operators.)
- **Operators as opaque managed features (not principals).** Rejected: would break HoBo's "every actor is an audited principal" invariant; operators must carry identity + policy + an audit trail like any agent.
- **Bundle HolmesGPT (or any external brain) as mandatory.** Rejected: engines stay behind ports (optional providers), preserving the no-egress/air-gap and no-lock-in stances ([ADR-0036](07-portability-extensibility.md#adr-0036)/[ADR-0024](07-portability-extensibility.md#adr-0024)).
- **Keep calling the proxy "the HoBo Agent".** Rejected: collides with the roster; "Agent" now means an autonomous principal, the proxy is the Relay.

### Consequences
- **(+)** Delivers "AI SRE / AI GitOps / AI policy enforcement" concretely, reusing the principal/policy/event/MCP substrate — little new machinery (a roster + a thin `crew.*` event family + per-operator engine ports).
- **(+)** Audited, policy-gated, replayable operations out of the box; humans and external agents can inspect/override every operator via MCP.
- **(+)** Pluggable: swap an engine, disable an operator, or BYO — the deterministic core is unaffected; air-gap-friendly.
- **(−)** Built-in operators are opinionated; teams that want different behavior must override/disable (mitigated by engines-behind-ports + skills).
- **(−)** Autonomous operators acting on prod are a trust surface; mitigated by default-gated writes, spend caps, blast-radius limits, and full audit — but tuning those defaults is an iteration hook.
- **(−)** A naming migration ("HoBo Agent"→"Relay") touched several docs (done in this change).

## ADR-0055
**The generated stack: a layered model for AI generation/self-healing/persistence.** Accepted (amended by [ADR-0064](08-scope-and-requirements.md#adr-0064) — the **ui** layer is removed; generation is scoped to **infrastructure/runtime**, a four-layer model)

- **Origin:** the vision framed AI generation as spanning several layers, but the suite documented each separately with no unifying model; message wasn't framed as generated at all.

### Context
HoBo's AI-native capabilities had grown organically: data-plane projections ([Plan 39](../39-data-plane-projections.md)), Forge-generated providers/impls ([Plan 33](../33-forge-generation-pipeline.md)), trainable semantic functions ([Plan 23](../23-stubbable-ai-implementations.md)), persisted mutation ([ADR-0048](#adr-0048)). These share one loop, one log, one trust boundary, and one persistence mechanism — but nothing said so, and **message-handler** generation wasn't framed as part of the same story. A unifying model makes the promise legible and exposes the real gap (message). Generating the developer's **product UI** is out of scope ([ADR-0064](08-scope-and-requirements.md#adr-0064)) — the meta-cloud generates infrastructure/runtime, not the app's front-end.

### Decision
1. **Adopt a four-layer taxonomy for generation: data · business · message · intelligence.** It is a *map over existing mechanisms*, not new runtime: each layer names what HoBo generates, who owns it, how it self-heals, and how it persists. Generation is scoped to **infrastructure/runtime** ([ADR-0064](08-scope-and-requirements.md#adr-0064)); the app UI is not a layer.
2. **One generation loop across layers** — the Forge loop (scaffold → LLM-fill → validate-sandboxed → repair → certify) ([Plan 33](../33-forge-generation-pipeline.md)); only inputs/oracles differ per layer.
3. **One trust boundary** — nothing generated is trusted without conformance + policy + eval ([Plan 9](../09-verification-open-questions.md)/[Plan 29](../29-contracts-compatibility.md)/[Plan 30](../30-policy-plane.md)); **one persistence mechanism** — region-scoped AST edits + provenance ([ADR-0048](#adr-0048)), generated regions demarcated, hand-written intent never clobbered, drift-gated ([ADR-0037](05-config-matching-environments.md#adr-0037)).
4. **One self-healing reflex** — classify → propose-fix → validate → gated-apply (live-fix [Plan 23](../23-stubbable-ai-implementations.md) + drift/auto-rollback [Plan 5](../05-reliability-ha.md)), driven by the **SRE operator** ([Plan 40](../40-operator-agents.md)); where a layer can't auto-heal safely it degrades to *propose*.
5. **Frame message as a first-class generated layer:** message-handler/choreography generation from WIT-record event types.

### Alternatives considered
- **Leave the layers as separate features (no unifying model).** Rejected: the promise is illegible and the message gap stays hidden; one model also prevents divergent loops/trust-boundaries per layer.
- **A different layer cut** (e.g. by tier: frontend/backend/infra). Rejected: the data/business/message/intelligence cut matches HoBo's existing seams (event log, ports, training-engine) and the operator roster.
- **Include a ui layer / promise whole-app generation.** Rejected ([ADR-0064](08-scope-and-requirements.md#adr-0064)): generating the developer's product UI is app-build-out, outside the meta-cloud; cross-layer single-intent regeneration remains the long arc.

### Consequences
- **(+)** Makes the AI-native (infrastructure) promise legible end-to-end and reuses one loop/boundary/persistence across all layers — minimal new machinery (a map + one newly-framed layer).
- **(+)** Surfaces and closes the message gap; gives the operator agents ([Plan 40](../40-operator-agents.md)) a clear remit per layer.
- **(+)** Consistent safety story: deterministic codegen is reproducible; non-deterministic promotions are region-isolated, provenance-pinned, and prod-gated.
- **(−)** A taxonomy invites "is X a layer?" debates (e.g. networking/auth aren't in the four — deliberately, they're configured not generated).
- **(−)** Uniform framing can over-promise: layers self-heal unequally; the plan states this explicitly to avoid implying message heals as maturely as data/business today.

## ADR-0058
**SRE: incident management, runbooks & the self-healing decision model.**

- **Origin:** the SRE operator ([Plan 40](../40-operator-agents.md)) cited `incident.*` and "gated remediation" but no incident model, failure-taxonomy, decision tree, or runbook concept existed. Gap analysis (SRE coverage + runbook/alerting) confirmed the pieces existed but the incident-management layer did not.

### Context
HoBo had alerting/SLO ([ADR-0045](04-governance-verification.md#adr-0045)), pipelines ([Plan 28](../28-relay-gitops-pipelines.md)), AI live-fix ([Plan 23](../23-stubbable-ai-implementations.md)), drift + auto-rollback ([Plan 5](../05-reliability-ha.md)), and chaos ([ADR-0047](04-governance-verification.md#adr-0047)) — strong reflexes, but no **management** layer: `incident.*` was referenced yet undefined; live-fix's failure taxonomy covered only *contract* failures (not Plan 5's *runtime* classes); the SRE operator's decide-logic was opaque; there was no first-class **runbook** (only HolmesGPT/StackStorm/gitops-runbook captures); and no MTTD/MTTR, on-call/escalation, or postmortem model. Obligations also had no deadline/escalation (an open [Plan 30](../30-policy-plane.md) hook).

### Decision
1. **Incident is a first-class aggregate** ([ADR-0053](03-data-plane.md#adr-0053)): stream `incident:<id>`, single-writer, rebuildable, correlating loose signals (`alert.*`/`slo.BudgetBurned`/`resource.DriftDetected`/`compat.GateFailed`/`spend.CircuitTripped`) into one command point. New **`incident.*`** events (`Opened`/`Triaged`/`RootCauseIdentified`/`RemediationProposed`/`RemediationApplied`/`RemediationFailed`/`Resolved`/`SLABreached`/`PostmortemFiled`) — closes the dangling reference.
2. **The SRE operator runs a documented decision tree:** diagnose (projections; optional HolmesGPT behind a port) → classify → **auto-fix** (low-risk/reversible/in-budget/conformance-green → live-fix canary + auto-rollback) | **propose** (gated Delta/PR) | **escalate** (page on-call). Every branch is `crew.*` + `policy.Decided` + `incident.*` — replayable; no silent action on unclassifiable failures.
3. **One runtime failure-taxonomy → safe-fix map** unifies Plan 5 runtime classes + Plan 23/29 contract classes; **live-fix applies, the taxonomy classifies**; every strategy is reversible + gated.
4. **Runbooks are first-class, declarative, event-sourced** (`runbook.*`), versioned/signed like Resource Packs, **built on the Pipelines engine** ([Plan 28](../28-relay-gitops-pipelines.md)) as the incident-response sibling of deploy pipelines; HolmesGPT/StackStorm are optional engines behind the port.
5. **MTTD/MTTR are OpenSLO SLOs** with error budgets that gate (burn → freeze risky deploys / require postmortem); **on-call escalation is a policy obligation with a deadline** (resolves the Plan 30 hook); **postmortems are generated by replay** and feed gated runbook/prompt updates.

### Alternatives considered
- **Incidents as loose alert-groups (no aggregate).** Rejected: no command point, no single status/owner/SLA, no clean postmortem; multiple alerts would spawn uncoordinated SRE actions.
- **A centralized StackStorm-style runbook execution engine as the core.** Rejected: HoBo composes specialized agents + gated sagas + events instead (more loosely coupled, policy-governed, replayable); StackStorm/HolmesGPT remain optional engines behind ports.
- **Keep the SRE operator opaque (engine decides).** Rejected: an autonomous operator acting on prod must have an auditable, gated decision tree; "the model decided" is not an acceptable audit answer.
- **A bespoke incident store / ITSM system.** Rejected: the event log already *is* the incident timeline; an Incident is just an aggregate over it — postmortem-by-replay falls out for free.

### Consequences
- **(+)** Turns scattered reflexes into a coherent, auditable incident-management story; closes the `incident.*` dangling reference and the opaque-SRE gap with little new machinery (one aggregate + two event families + a taxonomy table + runbooks-on-pipelines).
- **(+)** Postmortem-as-replay + failure→regression-test make incidents a learning loop, not just firefighting; MTTD/MTTR-as-SLO makes SRE quality measurable + gateable.
- **(+)** Engines behind ports (HolmesGPT/StackStorm/pagers) keep it pluggable and air-gap-friendly; the deterministic core (classify/gate/apply) needs no external brain.
- **(−)** An autonomous SRE acting on prod is a trust surface; mitigated by default-gated writes, blast-radius + spend budgets, escalate-on-unknown, and full audit — but threshold tuning is an iteration hook.
- **(−)** Runbooks + deploy pipelines share an engine but are distinct surfaces; keeping them coherent (or merging) is an open question.
- **(−)** Lean on-call (no rotation calendars/paging-vendor specifics in v1) — full ITSM is deferred.
