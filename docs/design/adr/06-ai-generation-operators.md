# AI generation, agents & operators — consolidated decisions

> Consolidated ADR decisions for **ai generation, agents & operators**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0010
**Forge: AI-generated providers gated by conformance.**

### Context
Provider/implementation breadth is a community bottleneck. Forge breaks it by **synthesizing** candidates and **certifying** them against a conformance trust boundary ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 9](../verification.md#plan-09)). This ADR defines both *what* Forge produces and *how* a candidate is synthesized, repaired, and made reproducible/trustworthy — so "generate a provider" is concrete.

### Decision
1. **Algorithm = template scaffold + LLM-fill + a conformance/trace-driven repair loop**, and the repair loop **reuses the `training-engine` optimizer** (OPTO/Trace, [ADR-0025](#adr-0025)) rather than a separate generator. Generation (cold-start) and live training ([Plan 23](../forge-generated-stack.md#plan-23)) are the two entry points of one engine.
2. **Inputs are contract-first.** The target **WIT port + its `@hobo/conformance` suite + the backend's Capability Manifest** are *authoritative*; provider docs/OpenAPI/Terraform and recorded stub/live traces are *material* (synthesis hints + behavioral oracle). Material is treated as **untrusted data** — sanitized/scrubbed for prompt injection ([ADR-0023](02-identity-security.md#adr-0023)); it can never override the contract.
3. **The loop is generate → validate(sandboxed, no-egress) → repair(bounded budget; exhaustion → `forge.NeedsHuman`) → certify.** Certification **signs + pins provenance** (model, frozen prompt, seed, conformance report) and **promotes via the policy gate**: low-risk auto-certify, prod/high-trust human approval.
4. **One pipeline for three artifact kinds** — providers, implementations, and Resource Definitions/Packs — all behind existing WIT ports + the conformance boundary.
5. **Events** `forge.Requested/CandidateGenerated/Validated/ValidationFailed/Repaired/NeedsHuman/Certified` make every step replayable/auditable.

### Alternatives considered
- **Pure-LLM synthesis, gate-only** (emit the whole artifact, then just run conformance) — rejected as the default: maximal repair burden, least determinism, larger injection surface; the scaffold + bounded repair is more reliable.
- **Pure program-synthesis/optimization over the conformance suite (no scaffold)** — rejected: heavier and slower to a first candidate; the template makes structure deterministic so only capability logic is synthesized. (The optimizer is still used — for *repair* — so we keep its benefit.)
- **Docs-first / trace-first authoritative inputs** — rejected: docs/OpenAPI are external/untrusted (injection risk) and traces don't exist for a cold-start provider; the contract (WIT + conformance) is the only trustworthy authority and is already the certification gate.
- **A separate Forge generator distinct from the training-engine** — rejected: duplicates the optimizer and splits provenance; unifying them keeps "generate" and "evolve" consistent.

### Consequences
- **(+)** Breaks the community-bottleneck on provider breadth; "generate a provider/impl/definition" becomes a concrete, bounded, auditable loop — the differentiator is demonstrable, not hand-wave.
- **(+)** Reuses the conformance trust boundary, the Firecracker+wasm no-egress sandbox, and the training-engine — minimal new machinery; contract-first + sanitized material keeps generation safe against malicious provider docs.
- **(−)** Relies on a strong conformance suite as the trust boundary; quality also depends on the template library + the optimizer. Cold-start from docs-only (no Capability Manifest) is the riskiest path and is sequenced last.
- **(−)** A repair budget trades thoroughness for cost ([Plan 5](../reliability-observability-cost.md#plan-05)); some artifacts will escalate to humans (`forge.NeedsHuman`) — acceptable and explicit.

## ADR-0014
**MCP as a first-class control surface.**

**Decision:** every CLI/SDK capability has an MCP equivalent with the same identity model. **Consequences:** agents are true operators; we maintain a third interface surface in lockstep ([Plan 6](../ai-native-agent-auth.md#plan-06), [Plan 7](../developer-experience.md#plan-07)).

## ADR-0025
**`"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only).**

### Context
HoBo lets AI implement, evolve, and live-fix WIT-port implementations ([Plan 23](../forge-generated-stack.md#plan-23)), but the SDK had no first-class way for a developer to say *"this method is mine to define, but I want HoBo to keep improving it."* The marker was implicit (`stub()` + Forge). We want a Vercel-Workflows-style directive — peer to `"use workflow"`/`"use step"` ([Plan 2](../sdk-api.md#plan-02)) — that declares a method **AI-rewritable**, and we want the optimization machinery modeled on proven frameworks (Microsoft [Trace](https://microsoft.github.io/Trace/), [Agent Lightning](https://microsoft.github.io/agent-lightning/stable/)) **without leaking those frameworks (or any ML/RL machinery) into the SDK surface** — the same separation we already enforce for Pact/OPA/Cedar ([ADR-0015](04-governance-verification.md#adr-0015)).

### Decision
1. **`"use training"` is the SDK directive** (with an equivalent `training(fn, opts)` wrapper) marking a method as an **AI-rewritable semantic function**. The body is the baseline (often a `stub()`); HoBo may rewrite its prompt/code. It composes with the existing semantic-function model — Contract/Eval/Policy/Trace and the gated promotion are unchanged.
2. **Rewritability requires semantic grounding.** A `"use training"` method must carry **intent (docstring/`@intent`) + contract (typed I/O + invariants + forbidden outputs) + rubric**; HoBo lints for their presence. These are the optimizer's instruction, hard boundary, and objective respectively.
3. **The optimizer is an engine behind a `training-engine` WIT port** ([Plan 20](../wasm-runtime-wit.md#plan-20)) with a **built-in default** (an OPTO/prompt-rewrite optimizer). **Microsoft Agent Lightning (`@hobo/provider-agent-lightning`) and Microsoft Trace (`@hobo/provider-trace`) are optional adapters behind that port, selected per tenant/Camp, and are NEVER part of the SDK surface.** SDK users never import or configure them; swapping the optimizer is a config change, not an app-code change.
   - **From Trace:** treat the graph of trainable methods as an optimizable computational graph; feedback propagates back and rewrites trainable parameters in place (OPTO).
   - **From Agent Lightning:** decouple execution from training — the running method emits trajectories; a separate trainer/store optimizes via RL (GRPO/PPO), APO, or SFT. This mirrors HoBo's data-plane/control-plane split.
4. **Runtime capture = OTel + OpenInference.** Each invocation emits OpenInference-convention spans (layered on existing OTel, [Plan 5](../reliability-observability-cost.md#plan-05)); a *trajectory* (span tree + I/O + reward + correlation) is the training-data unit, persisted via the event log.
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
- **(−)** Online eval (LLM-judge) and trajectory storage add runtime cost; mitigated by sampling + min-samples floors (iteration hook in [Plan 23](../forge-generated-stack.md#plan-23)).
- **(−)** HoBo must define and version the `training-engine` WIT port and a trajectory schema, and maintain a built-in optimizer even when providers exist (the no-hard-dependency rule).
- **(−)** A rewritable method that lacks good intent/rubric optimizes poorly — hence the lint requirement; "garbage rubric in, garbage optimization out" is a real failure mode to document.

## ADR-0048
**Persisted code-mutation mechanism (for `"use training"` promotion).**

### Context
[Plan 23](../forge-generated-stack.md#plan-23) + [ADR-0025](#adr-0025): the `training-engine` continuously rewrites `"use training"` semantic functions (prompt/code) and, when a candidate passes eval/conformance, **promotes** it. But "promote" needs a concrete, safe **persistence mechanism** — how a generated mutation lands back in source without clobbering hand-written code, with provenance and review. The [runtime-code-mutation-persistence pattern](../../../patterns/runtime-code-mutation-persistence.md) (ts-morph / recast / jscodeshift / magic-string + unified-diff apply) is the toolbox; this ADR specifies HoBo's use of it.

### Decision
1. **Promotion persists via AST-aware, region-scoped edits — never blind string patches.** A promoted candidate is applied with an **AST/codemod tool** (recast/ts-morph-style, format-preserving) confined to a **clearly demarcated generated region** of the `"use training"` method (the prompt/body the engine owns), leaving hand-written code untouched. Output is a minimal, format-preserving diff.
2. **Generated vs hand-written is explicit.** A `"use training"` method's optimizable region is marked (a directive boundary) so codegen/promotion only ever rewrites inside it — the same generated-vs-authored distinction as the `_generated/` codegen surface ([ADR-0037](05-config-matching-environments.md#adr-0037)); promoted regions carry a header noting they're engine-managed + their provenance id.
3. **Provenance-pinned + gated, as a reviewable change.** A promotion emits the existing `training.Promoted`/`impl.Promoted` events ([Plan 11](../event-model.md#plan-11)) carrying **signed provenance** (model, prompt, seed, eval/conformance report — the same trust boundary as Forge, [Plan 23](../forge-generated-stack.md#plan-23)). The persisted mutation lands as a **gated change** ([Plan 29](../contracts-policy-flags.md#plan-29)): low-risk → auto-commit to the generated region with provenance; prod/high-trust → **open a PR/Delta for human approval** (reusing the GitOps publisher + approval hooks, [Plan 25](../platform-engineering.md#plan-25)/[Plan 6](../ai-native-agent-auth.md#plan-06)).
4. **Idempotent + round-trippable.** Re-applying the same candidate is a no-op (like `codegen --check`, [ADR-0037](05-config-matching-environments.md#adr-0037)); the prior region is recoverable (the event log holds every candidate), so a promotion is reversible by re-promoting the previous one.

### Alternatives considered
- **Blind text/regex patching of source.** Rejected: clobbers formatting/hand-written code, not round-trippable, unreviewable.
- **Keep promoted code only in a runtime store (never persist to source).** Rejected: divorces running behavior from the repo (the "what's actually deployed" drifts from VCS), breaks review/audit-in-Git, and conflicts with the deterministic-build/`_generated/` model.
- **Always require a human PR for every promotion.** Rejected as the default: low-risk dev promotions should be able to auto-apply to the generated region (gated by policy); prod/high-trust escalates to a PR — same risk-tiering as Forge certification ([Plan 23](../forge-generated-stack.md#plan-23)).

### Consequences
- **(+)** Closes #29: `"use training"` promotion has a concrete, safe persistence path — AST-aware, region-scoped, provenance-pinned, gated, idempotent — bridging the training loop ([Plan 23](../forge-generated-stack.md#plan-23)) to source + the `_generated/` surface ([ADR-0037](05-config-matching-environments.md#adr-0037)).
- **(+)** Reuses the Forge trust boundary (signed provenance + eval/conformance), the policy gate, and the GitOps/PR + approval-hook machinery — no new plane, just a specified mechanism + the codemod toolchain.
- **(+)** Keeps running behavior in VCS (auditable, reviewable, replayable), preserving the deterministic-build promise.
- **(−)** AST codemod fidelity across TS constructs is non-trivial; advanced rewrites may need the human-PR path more often (acceptable, and the gate makes it explicit).
- **(−)** The generated-region boundary is a discipline authors must respect; editing inside it risks a future promotion overwriting hand edits (mitigated by the region header + the no-op/`--check` guard surfacing drift).

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
**The generated stack: a layered model for AI generation/self-healing/persistence.**

### Context
HoBo's AI-native capabilities span several layers: data-plane materializations ([Plan 32](../data-plane.md#plan-32)), Forge-generated providers/impls ([Plan 23](../forge-generated-stack.md#plan-23)), trainable semantic functions ([Plan 23](../forge-generated-stack.md#plan-23)), persisted mutation ([ADR-0048](#adr-0048)), and app/UI generation ([ADR-0056](#adr-0056)). These share one loop, one log, one trust boundary, and one persistence mechanism. A unifying model makes the promise legible across the whole stack — from infrastructure up to the app's UI.

### Decision
1. **Adopt a five-layer taxonomy for generation: data · business · message · intelligence · ui.** It is a *map over existing mechanisms*, not new runtime: each layer names what HoBo generates, who owns it, how it self-heals, and how it persists. The **ui** layer ([ADR-0056](#adr-0056)) is generated from intent + **design.md** via OpenUI/json-render/mcp-apps, owned by the **UX Designer** operator, and reactive to the data plane's materializations.
2. **One generation loop across layers** — the Forge loop (scaffold → LLM-fill → validate-sandboxed → repair → certify) ([Plan 23](../forge-generated-stack.md#plan-23)); only inputs/oracles differ per layer.
3. **One trust boundary** — nothing generated is trusted without conformance + policy + eval ([Plan 9](../verification.md#plan-09)/[Plan 29](../contracts-policy-flags.md#plan-29)/[Plan 29](../contracts-policy-flags.md#plan-29)); **one persistence mechanism** — region-scoped AST edits + provenance ([ADR-0048](#adr-0048)), generated regions demarcated, hand-written intent never clobbered, drift-gated ([ADR-0037](05-config-matching-environments.md#adr-0037)).
4. **One self-healing reflex** — classify → propose-fix → validate → gated-apply (live-fix [Plan 23](../forge-generated-stack.md#plan-23) + drift/auto-rollback [Plan 5](../reliability-observability-cost.md#plan-05)), driven by the **SRE** and **SWE** operators ([Plan 40](../operators-sre.md#plan-40)); where a layer can't auto-heal safely it degrades to *propose*.
5. **Message is a first-class generated layer:** message-handler/choreography generation from WIT-record event types.

### Alternatives considered
- **Leave the layers as separate features (no unifying model).** Rejected: the promise is illegible; one model also prevents divergent loops/trust-boundaries per layer.
- **A different layer cut** (e.g. frontend/backend/infra). Rejected: the data/business/message/intelligence/ui cut matches HoBo's existing seams (event log, ports, training-engine, `ui-render`) and the operator roster.
- **Drop the ui layer (generate only infrastructure).** Rejected: AI-generating the app from intent — UI included — is core to the AI-native thesis ([ADR-0064](08-scope-and-requirements.md#adr-0064)); cross-layer single-intent regeneration remains the long arc.

### Consequences
- **(+)** Makes the AI-native promise legible end-to-end — infrastructure through UI — reusing one loop/boundary/persistence across all layers (a map + the `ui-render` seam).
- **(+)** Gives the operator agents ([Plan 40](../operators-sre.md#plan-40)) a clear remit per layer (SWE: business/message; UX Designer: ui; Platform Engineer: infra).
- **(+)** Consistent safety story: deterministic codegen is reproducible; non-deterministic promotions are region-isolated, provenance-pinned, and prod-gated.
- **(−)** A taxonomy invites "is X a layer?" debates (e.g. networking/auth aren't layers — they're configured, not generated).
- **(−)** Uniform framing can over-promise: layers self-heal unequally; the docs state this explicitly to avoid implying message/ui heal as maturely as data/business.

## ADR-0056
**App/UI generation (design.md · OpenUI · json-render · mcp-apps · the `ui-render` port).**

### Context
The AI-native thesis is to generate the application from intent — not only its infrastructure but its **UI**. HoBo generates data/business/message/intelligence layers ([ADR-0055](#adr-0055)); the **ui** layer needs a concrete mechanism, an owner, and a trust boundary, distinct from HoBo's own operator dashboard ([Plan 7](../developer-experience.md#plan-07)).

### Decision
1. **`ui-render` is a port** with pluggable engine adapters: **OpenUI** (generate UI from intent) and **json-render** (a declarative render IR), plus **mcp-apps** (MCP-driven app surfaces) so agents can drive and inspect the UI like any other capability. Custom adapters plug in behind the same port.
2. **`design.md` is a required input** — the design-system spec (tokens, components, layout constraints, a11y rules) that HoBo generates and then **enforces** as the design analog of the conformance trust boundary. UI generation that violates design.md fails the gate.
3. **The UX Designer operator owns it** ([ADR-0054](#adr-0054)): it generates/maintains the UI against design.md, runs sandboxed under enforced AI governance ([ADR-0061](04-governance-verification.md#adr-0061)), and lands changes via the same persisted-mutation + policy gate as any generated code ([ADR-0048](#adr-0048)).
4. **Generated UI is typed from the domain + reactive to materializations.** Components are typed from the WIT-record domain schema ([ADR-0051](03-data-plane.md#adr-0051)) and bind to the data plane's reactive materializations / GraphQL facade ([ADR-0050](03-data-plane.md#adr-0050)), so the UI updates as state changes.

### Alternatives considered
- **Generate infrastructure only; leave UI to the developer.** Rejected: generating the app from intent — UI included — is core to the AI-native thesis and a batteries-included capability competitors ship.
- **Hard-wire one UI engine.** Rejected: OpenUI/json-render/mcp-apps and future engines must be swappable behind `ui-render`, like every other capability.
- **Skip design.md (free-form UI).** Rejected: without an enforced design-system spec, generated UI drifts and can't be gated; design.md is the UI's trust boundary.

### Consequences
- **(+)** Completes the generated stack up to the UI; the app — infra and front-end — is generatable from intent, design-constrained, typed, and reactive.
- **(+)** Reuses the existing generation loop, trust boundary, persisted-mutation, and operator/governance machinery — a port + design.md, not a new plane.
- **(−)** UI quality depends on the engine + design.md fidelity; weak design specs yield weak UI (the design.md gate makes this explicit).
- **(−)** Distinct from HoBo's own dashboard ([Plan 7](../developer-experience.md#plan-07)) — the two must not be conflated.

## ADR-0058
**SRE: incident management, runbooks & the self-healing decision model.**

### Context
HoBo had alerting/SLO ([ADR-0045](04-governance-verification.md#adr-0045)), pipelines ([Plan 25](../platform-engineering.md#plan-25)), AI live-fix ([Plan 23](../forge-generated-stack.md#plan-23)), drift + auto-rollback ([Plan 5](../reliability-observability-cost.md#plan-05)), and chaos ([ADR-0047](04-governance-verification.md#adr-0047)) — strong reflexes, but no **management** layer: `incident.*` was referenced yet undefined; live-fix's failure taxonomy covered only *contract* failures (not Plan 5's *runtime* classes); the SRE operator's decide-logic was opaque; there was no first-class **runbook** (only HolmesGPT/StackStorm/gitops-runbook captures); and no MTTD/MTTR, on-call/escalation, or postmortem model. Obligations also had no deadline/escalation (an open [Plan 29](../contracts-policy-flags.md#plan-29) hook).

### Decision
1. **Incident is a first-class aggregate** ([ADR-0053](03-data-plane.md#adr-0053)): stream `incident:<id>`, single-writer, rebuildable, correlating loose signals (`alert.*`/`slo.BudgetBurned`/`resource.DriftDetected`/`compat.GateFailed`/`spend.CircuitTripped`) into one command point. New **`incident.*`** events (`Opened`/`Triaged`/`RootCauseIdentified`/`RemediationProposed`/`RemediationApplied`/`RemediationFailed`/`Resolved`/`SLABreached`/`PostmortemFiled`) — closes the dangling reference.
2. **The SRE operator runs a documented decision tree:** diagnose (projections; optional HolmesGPT behind a port) → classify → **auto-fix** (low-risk/reversible/in-budget/conformance-green → live-fix canary + auto-rollback) | **propose** (gated Delta/PR) | **escalate** (page on-call). Every branch is `crew.*` + `policy.Decided` + `incident.*` — replayable; no silent action on unclassifiable failures.
3. **One runtime failure-taxonomy → safe-fix map** unifies Plan 5 runtime classes + Plan 23/29 contract classes; **live-fix applies, the taxonomy classifies**; every strategy is reversible + gated.
4. **Runbooks are first-class, declarative, event-sourced** (`runbook.*`), versioned/signed like Resource Packs, **built on the Pipelines engine** ([Plan 25](../platform-engineering.md#plan-25)) as the incident-response sibling of deploy pipelines; HolmesGPT/StackStorm are optional engines behind the port.
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
- **(−)** Lean on-call (no rotation calendars/paging-vendor specifics) — full ITSM is out of first-cut scope.
