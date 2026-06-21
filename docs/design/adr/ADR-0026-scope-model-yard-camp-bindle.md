# ADR-0026 — Scope model: `Yard ⊃ Camp ⊃ Bindle`; remove "World"

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Founders, Engineering, Product
- **Related:** [00 Vision](../00-vision.md) · [02 SDK §Layer 1](../02-sdk-api.md) · [04 Control plane](../04-control-plane.md) · [10 Architecture](../10-architecture-overview.md) · [26 Environments](../26-environments-deltas.md) · [README glossary](../README.md#glossary--naming-thematic-all-tunable) · supersedes the naming half of [ADR-0002](./README.md)
- **Origin:** product direction — clarify the configuration layers and drop a vendor-branded concept.

## Context
Two problems with the prior vocabulary:
1. **"World"** (the durable-runtime substrate: EventStore/Queue/Streamer/ActorHost/Clock) was lifted from Vercel's Workflow SDK. Carrying a competitor's brand for a core HoBo concept is both a positioning liability and conceptually redundant now that Camps are becoming provider-specific.
2. **"Camp"** was overloaded as "an environment (dev/prod)" while also being the thing that selected a runtime + a provider mapping. There was no single, named scope for **cross-provider / cross-cloud / hybrid** policy and topology, even though the Yard (control plane) already operated across providers.

## Decision
Adopt three explicitly nested scopes — **`Yard ⊃ Camp ⊃ Bindle`** — and remove the "World" noun:

1. **Bindle = app-level config.** Provider-agnostic topology + bindings. Unchanged. Deployed *into* Camps.
2. **Camp = provider-specific deployment target.** One environment on one provider/cloud (e.g. `prod-aws`). A Camp now **also provides the durable runtime** — the ports formerly grouped as "World" become **runtime ports** the Camp supplies (built-in `runtime-local`; backends `runtime-postgres`/`-temporal`/`-restate`/`-cloudflare`). "World" is **folded into Camp**; the `World` interface becomes `Runtime`; `@hobo/world-*` packages become `@hobo/runtime-*`.
3. **Yard = control plane + broadest scope.** Keeps its role as the orchestrator **and** becomes the explicit holder of **cross-provider / cross-cloud / hybrid** policy + topology, governing many Camps. A multi-cloud `production` is several Camps under one Yard.

**Environments stay a matching dimension, not a new layer.** A Camp carries an `environment type` ([Plan 25](../25-resource-definitions-matching.md)/[Plan 26](../26-environments-deltas.md)); "prod across two clouds" = two Camps under a Yard. No fourth noun.

**Preserve "WIT world"** — that is the WebAssembly Component Model term ([Plan 20](../20-wasm-wasi-runtime.md)/[Plan 24](../24-wit-worlds-reference.md)) and is unrelated to the removed Vercel concept.

## Alternatives considered
- **Keep "World" as the runtime substrate noun** — rejected: vendor-branded, and redundant once a Camp is provider-specific and naturally owns its runtime.
- **Rename the control-plane orchestrator and make "Yard" only a config scope** — rejected: more churn for no gain; the orchestrator already spans providers, so "Yard = control plane + broad scope" is the natural, least-disruptive reading.
- **Introduce a 4th "Environment" layer (`Yard ⊃ Environment ⊃ Camp ⊃ Bindle`)** — rejected for v1: environments are already handled by the matching dimension (Plan 25); a 4th noun adds ceremony without a concrete need. Revisit if multi-env-per-provider grouping proves painful.

## Consequences
- **(+)** A clean, teachable hierarchy (governed-how-across-clouds / where-on-which-provider / what-the-app-is); HoBo owns its runtime concept end-to-end; no Vercel-brand dependency.
- **(+)** Cross-provider/hybrid governance has a home (the Yard) that matches how the control plane already works.
- **(−)** A broad terminology sweep across the suite (`World`→Camp/runtime; `@hobo/world-*`→`@hobo/runtime-*`), with care to preserve "WIT world". Tracked + verified by grep in the refactor.
- **(−)** `ADR-0002`'s wording ("Worlds") is now historical; this ADR supersedes its naming (the *decision* — pluggable durable ports + built-in engine — stands).
