# ADR-0025 — `"use training"` directive + `training-engine` behind a port (Agent Lightning / Trace optional, internal-only)

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Engineering, Product, AI/ML
- **Related:** [Plan 23 Stubbable/trainable](../23-stubbable-ai-implementations.md) · [Plan 2 SDK](../02-sdk-api.md) · [Plan 14 Observability](../14-observability.md) · [Plan 11 Event model](../11-event-model.md) · [Plan 24 WIT interfaces](../24-wit-interfaces-reference.md) · builds on [ADR-0015](./README.md) (engines behind ports) and [ADR-0010](../18-adr-log.md) (Forge)

## Context
HoBo lets AI implement, evolve, and live-fix WIT-port implementations ([Plan 23](../23-stubbable-ai-implementations.md)), but the SDK had no first-class way for a developer to say *"this method is mine to define, but I want HoBo to keep improving it."* The marker was implicit (`stub()` + Forge). We want a Vercel-Workflows-style directive — peer to `"use workflow"`/`"use step"` ([Plan 2](../02-sdk-api.md)) — that declares a method **AI-rewritable**, and we want the optimization machinery modeled on proven frameworks (Microsoft [Trace](https://microsoft.github.io/Trace/), [Agent Lightning](https://microsoft.github.io/agent-lightning/stable/)) **without leaking those frameworks (or any ML/RL machinery) into the SDK surface** — the same separation we already enforce for Pact/OPA/Cedar ([ADR-0015](./README.md)).

## Decision
1. **`"use training"` is the SDK directive** (with an equivalent `training(fn, opts)` wrapper) marking a method as an **AI-rewritable semantic function**. The body is the baseline (often a `stub()`); HoBo may rewrite its prompt/code. It composes with the existing semantic-function model — Contract/Eval/Policy/Trace and the gated promotion are unchanged.
2. **Rewritability requires semantic grounding.** A `"use training"` method must carry **intent (docstring/`@intent`) + contract (typed I/O + invariants + forbidden outputs) + rubric**; HoBo lints for their presence. These are the optimizer's instruction, hard boundary, and objective respectively.
3. **The optimizer is an engine behind a `training-engine` WIT port** ([Plan 24](../24-wit-interfaces-reference.md)) with a **built-in default** (an OPTO/prompt-rewrite optimizer). **Microsoft Agent Lightning (`@hobo/provider-agent-lightning`) and Microsoft Trace (`@hobo/provider-trace`) are optional adapters behind that port, selected per tenant/Camp, and are NEVER part of the SDK surface.** SDK users never import or configure them; swapping the optimizer is a config change, not an app-code change.
   - **From Trace:** treat the graph of trainable methods as an optimizable computational graph; feedback propagates back and rewrites trainable parameters in place (OPTO).
   - **From Agent Lightning:** decouple execution from training — the running method emits trajectories; a separate trainer/store optimizes via RL (GRPO/PPO), APO, or SFT. This mirrors HoBo's data-plane/control-plane split.
4. **Runtime capture = OTel + OpenInference.** Each invocation emits OpenInference-convention spans (layered on existing OTel, [Plan 14](../14-observability.md)); a *trajectory* (span tree + I/O + reward + correlation) is the training-data unit, persisted via the event log.
5. **Live-evals are the training signal.** Rubrics scored online on live/shadow traffic attach the reward each trajectory needs **and** serve as performance telemetry; they are the optimizer's objective and feed the promotion gate.
6. **No new trust path.** A trained candidate goes through the **same gate** as any Forge impl: sandboxed conformance (contract) + eval thresholds + policy + champion/challenger/shadow. Every step is an event (`training.*`, `eval.*`, `impl.Promoted`).

## Alternatives considered
- **Expose Agent Lightning / Trace APIs in the SDK** — rejected: leaks ML/RL machinery and a third-party dependency into the agnostic SDK, contradicting [ADR-0015](./README.md); couples app code to an optimizer.
- **A `stub()`/config flag instead of a directive** — rejected: less discoverable and inconsistent with the `"use workflow"`/`"use step"` family; the directive reads as intent at the call site.
- **A bespoke HoBo optimizer only (no provider seam)** — rejected: the built-in is the default, but a port lets HoBo adopt Agent Lightning/Trace (and future optimizers) without SDK churn, and lets advanced tenants swap engines.
- **Proprietary AI-span telemetry** — rejected in favor of OpenInference (OTel-native, no backend lock-in, reuses existing tracing).

## Consequences
- **(+)** Developers get a one-word, intent-revealing way to opt a method into continuous improvement; the hard ML/RL parts stay internal and swappable.
- **(+)** Training is grounded in real recorded execution (OpenInference trajectories) and gated by the existing conformance/eval/policy machinery — auditable and reversible, no new trust surface.
- **(+)** HoBo can use best-in-class Microsoft frameworks internally without exposing or depending on them at the SDK boundary.
- **(−)** Online eval (LLM-judge) and trajectory storage add runtime cost; mitigated by sampling + min-samples floors (iteration hook in [Plan 23](../23-stubbable-ai-implementations.md)).
- **(−)** HoBo must define and version the `training-engine` WIT port and a trajectory schema, and maintain a built-in optimizer even when providers exist (the no-hard-dependency rule).
- **(−)** A rewritable method that lacks good intent/rubric optimizes poorly — hence the lint requirement; "garbage rubric in, garbage optimization out" is a real failure mode to document.
