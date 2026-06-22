# ADR-0061 — AI safety & model governance: registry, guardrails, red-teaming

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product, Security, Responsible-AI
- **Related:** [Plan 47 — AI safety & model governance](../47-ai-safety-model-governance.md) · [Plan 23 — Stubbable/AI implementations](../23-stubbable-ai-implementations.md) (evals, `"use training"`, trajectories) · [ADR-0025 — `"use training"`/training-engine](./ADR-0025-use-training-directive-and-training-engine.md) (PII-not-trained) · [ADR-0023 — Security posture](./ADR-0023-security-posture-commitments.md) (prompt-injection) · [Plan 6](../06-ai-native-agent-auth.md)/[Plan 27](../27-drivers-packs-profiles.md) (Registry + signing/provenance) · [Plan 30 — Policy plane](../30-policy-plane.md) · [Plan 29 — Four-lens/`can-deploy`](../29-contracts-compatibility.md) · [ADR-0047 — Chaos tier](./ADR-0047-chaos-resilience-verification-tier.md) (red-team pattern) · [ADR-0048 — Persisted code mutation](./ADR-0048-persisted-code-mutation-mechanism.md) (prompts are persisted code) · [Plan 46 — Compliance](../46-compliance-governance.md) (attestation assembly, dataset classification) · [Plan 11](../11-event-model.md) (`model.*`/`guardrail.*`/`redteam.*`) · [Plan 21](../21-resources-catalog.md)/[Plan 24](../24-wit-interfaces-reference.md) (`hobo:guardrail`)
- **Origin:** a coverage sweep found HoBo AI-native throughout but with no governance of the models/prompts themselves, no output guardrails, no red-teaming, and no model cards — the trust story for its own differentiator was missing.

## Context
HoBo's differentiator is AI everywhere: trainable methods, the Forge, the Operator Crew, the generated stack. That makes the *governance* of models, prompts, and eval-datasets — and the *safety* of their outputs — load-bearing. The pieces existed in fragments (prompt-injection defense, evals, a PII-not-trained rule) but there was no registry for models/prompts, no output-moderation guardrail, no adversarial red-teaming, and no model cards / responsible-AI evidence. Ungoverned, the differentiator is the biggest liability.

## Decision
1. **Apply the Registry pattern to models/prompts/eval-datasets** ([Plan 6](../06-ai-native-agent-auth.md)/[Plan 27](../27-drivers-packs-profiles.md)): versioned, signed, provenance-bearing entries; prompts are governed because they are persisted code ([ADR-0048](./ADR-0048-persisted-code-mutation-mechanism.md)); promotion runs the four-lens gate.
2. **Output guardrails are a `guardrail` capability** ([Plan 21](../21-resources-catalog.md)/[Plan 24](../24-wit-interfaces-reference.md)) — a **policy-gated step** ([Plan 30](../30-policy-plane.md)) wrapping `agent()`/`"use training"`/generated outputs, engines behind a port (built-in rules default; Llama Guard/hosted/local adapters, Matching-selected, air-gap → local). `guardrail.Blocked` + `policy.Decided` make blocks replayable.
3. **Red-teaming reuses the chaos tier** ([ADR-0047](./ADR-0047-chaos-resilience-verification-tier.md)): hypothesis-driven, blast-radius-bounded, policy-gated adversarial experiments (`redteam.*`); a finding becomes a permanent regression test in a governed eval-dataset.
4. **Eval-datasets are governed artifacts** — classified ([Plan 46](../46-compliance-governance.md)), contamination-checked, extending the PII-not-trained rule ([ADR-0025](./ADR-0025-use-training-directive-and-training-engine.md)) into a lifecycle.
5. **Model cards + responsible-AI attestations** are assembled from registry + guardrail + red-team + eval facts (the [Plan 46](../46-compliance-governance.md) attestation mechanism), signed and replayable.

## Alternatives considered
- **Guardrails as library calls inside app code.** Rejected: not enforceable, not auditable, easy to bypass. Making them a policy-gated step means "why blocked" is a `policy.Decided` and coverage is a promotion contract.
- **A bespoke model-management system separate from the Registry.** Rejected: duplicates signing/provenance/conformance; models are just another signed artifact class.
- **Trust the model provider's built-in safety only.** Rejected: not portable across providers, opaque, and useless air-gapped; HoBo needs a provider-neutral guardrail port with a local engine.
- **Red-teaming as a separate one-off tool.** Rejected: reusing the chaos tier gives it the same gated, event-sourced, finding→regression-test rigor for free.
- **Skip model cards (move fast).** Rejected: regulated/enterprise buyers and emerging law (EU AI Act) require them; assembling from facts makes them cheap and honest.

## Consequences
- **(+)** The AI-native differentiator gets a matching trust story with little new machinery — registry entries + a guardrail port + the chaos-tier pattern + attestation assembly, all reused.
- **(+)** Guardrail-coverage-as-contract means an "improved" prompt can't ship if it weakens safety; red-team findings harden the system permanently; air-gap keeps working with local engines.
- **(+)** Model governance composes with compliance ([Plan 46](../46-compliance-governance.md)) — dataset classification, weights residency, and responsible-AI attestations share one evidence pipeline.
- **(−)** Guardrail engines add latency to every AI call; streaming responses complicate post-hoc checking (an iteration hook); a built-in-only guardrail is weaker than a dedicated model — adapter quality matters.
- **(−)** Model cards encode an interpretation of evolving standards; like compliance bundles they are evidence, not legal certification.
