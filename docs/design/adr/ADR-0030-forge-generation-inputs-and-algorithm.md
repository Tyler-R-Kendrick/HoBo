# ADR-0030 — Forge generation: inputs & algorithm

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Engineering, Product
- **Related:** [Plan 33 — Forge generation pipeline](../33-forge-generation-pipeline.md) · [06 AI-native/agent-auth](../06-ai-native-agent-auth.md) · [23 Stubbable/training](../23-stubbable-ai-implementations.md) · [ADR-0010](./README.md) (Forge gated by conformance) · [ADR-0012](./README.md) (sandboxed executors) · [ADR-0023](./ADR-0023-security-posture-commitments.md) (no-egress + injection) · [ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md) (training-engine) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (G3)
- **Origin:** the gap analysis found HoBo's headline differentiator — "the Forge generates providers/implementations" — specified only at the *conformance-gate* level; the *generation* algorithm itself was undefined. Designed via brainstorming + grill-with-docs.

## Context
ADR-0010 establishes that Forge artifacts are **gated by conformance**; ADR-0025 establishes a `training-engine` that optimizes live `"use training"` implementations. Neither says **how a candidate is synthesized in the first place** — the inputs it trusts, how it's repaired toward passing, or how the result is made reproducible/trustworthy. Without that, "generate a provider" is aspirational. Competitors (Aspire/Nitric/Humanitec) ship concrete generation/templating; HoBo needs the generation loop to be real.

## Decision
1. **Algorithm = template scaffold + LLM-fill + a conformance/trace-driven repair loop**, and the repair loop **reuses the `training-engine` optimizer** (OPTO/Trace, ADR-0025) rather than a separate generator. Generation (cold-start) and live training (Plan 23) are the two entry points of one engine.
2. **Inputs are contract-first.** The target **WIT port + its `@hobo/conformance` suite + the backend's Hobo Code** are *authoritative*; provider docs/OpenAPI/Terraform and recorded stub/live traces are *material* (synthesis hints + behavioral oracle). Material is treated as **untrusted data** — sanitized/scrubbed for prompt injection (ADR-0023); it can never override the contract.
3. **The loop is generate → validate(sandboxed, no-egress) → repair(bounded budget; exhaustion → `forge.NeedsHuman`) → certify.** Certification **signs + pins provenance** (model, frozen prompt, seed, conformance report) and **promotes via the existing policy gate** (ADR-0010): low-risk auto-certify, prod/high-trust human approval.
4. **One pipeline for three artifact kinds** — providers, implementations, and Resource Definitions/Packs — all behind existing WIT ports + the conformance boundary.
5. **Events** `forge.Requested/CandidateGenerated/Validated/ValidationFailed/Repaired/NeedsHuman/Certified` make every step replayable/auditable.

## Alternatives considered
- **Pure-LLM synthesis, gate-only** (emit the whole artifact, then just run conformance) — rejected as the default: maximal repair burden, least determinism, larger injection surface; the scaffold + bounded repair is more reliable.
- **Pure program-synthesis/optimization over the conformance suite (no scaffold)** — rejected: heavier and slower to a first candidate; the template makes structure deterministic so only capability logic is synthesized. (The optimizer is still used — for *repair* — so we keep its benefit.)
- **Docs-first / trace-first authoritative inputs** — rejected: docs/OpenAPI are external/untrusted (injection risk) and traces don't exist for a cold-start provider; the contract (WIT + conformance) is the only trustworthy authority and is already the certification gate.
- **A separate Forge generator distinct from the training-engine** — rejected: duplicates the optimizer and splits provenance; unifying them keeps "generate" and "evolve" consistent.

## Consequences
- **(+)** "Generate a provider/impl/definition" becomes a concrete, bounded, auditable loop; the differentiator is demonstrable, not hand-wave.
- **(+)** Reuses the conformance trust boundary, the Firecracker+wasm no-egress sandbox, and the training-engine — minimal new machinery.
- **(+)** Contract-first + sanitized material keeps generation safe against malicious provider docs.
- **(−)** Quality depends on the template library + the optimizer; cold-start from docs-only (no Hobo Code) is the riskiest path and is deferred.
- **(−)** A repair budget trades thoroughness for cost ([Plan 16](../16-cost-finops.md)); some artifacts will escalate to humans (`forge.NeedsHuman`) — acceptable and explicit.
