# ADR-0021 — NFR baselines / committed SLOs for v1

- **Status:** Proposed (numbers pending stakeholder ratification)
- **Date:** 2026-06-20
- **Deciders:** Engineering, Product, SRE
- **Related:** [PRD §NFRs](../../requirements/PRD.md) · [TRD §Cross-cutting NFRs](../../requirements/TRD.md) · [05 Reliability/HA](../05-reliability-ha.md) · [08 Roadmap](../08-roadmap.md) · [16 Cost/FinOps](../16-cost-finops.md)

## Context
[08-roadmap.md](../08-roadmap.md) defines **north-star signals** (time-to-first-deploy, "same Bindle, N clouds", zero-secret rate, agent-completable lifecycle, Forge yield, recovery) but they are *directional*, not testable thresholds. [05-reliability-ha.md](../05-reliability-ha.md) lists initial HA targets explicitly marked "to ratify with the user." A PRD needs **measurable NFRs** with numbers so they can be verified ([09](../09-verification-open-questions.md)) and used as release gates. Numbers proposed here are **defaults to ratify**, not contractual SLAs.

## Decision
Adopt these v1 NFR baselines (each becomes an `NFR-` in the PRD with a verification method):

| Dimension | Baseline (v1) | Source / verified by |
|---|---|---|
| Time-to-first-deploy (scaffold → running on real cloud) | ≤ 10 min p50 on the happy path | north-star ([08](../08-roadmap.md)); E2E timing test |
| Local dev start (`hobo dev`, no cloud) | ≤ 60 s | [15-cli-dx.md](../15-cli-dx.md); integration test |
| Zero-secret rate (provider access via brokered/federated tokens) | ≥ 99% of provider calls; static keys only via explicit legacy escape hatch | [06](../06-ai-native-agent-auth.md)/[12](../12-security-multitenancy.md); audit of `token.*` events |
| Portability ("same Bindle, N clouds" unedited) | ≥ 2 providers for the reference app at v1 (P4), design target N | [03](../03-providers-iac.md); `multi-cloud-shop` E2E |
| Control-plane availability | 99.9% single-region / 99.95% multi-region | [05](../05-reliability-ha.md) |
| Deploy resume after node loss | < 30 s (lease TTL + tail replay) | [05](../05-reliability-ha.md); chaos test |
| RPO | ~0 (sync quorum) / ≤ 5 s (async tier) | [05](../05-reliability-ha.md) |
| RTO (full Yard rebuild from log) | < 15 min | [05](../05-reliability-ha.md); DR replay test |
| Plan-time cost estimate accuracy | within ±20% of a known fixture | [16](../16-cost-finops.md); cost fixture test |
| Determinism | `replay == live state` for every durable run (hard invariant) | [09](../09-verification-open-questions.md); determinism test |

## Alternatives considered
- **Leave NFRs qualitative** — rejected: unverifiable NFRs are not requirements; release gates need numbers.
- **Commit aggressive enterprise SLAs (e.g. 99.99%) now** — rejected: premature before multi-region HA (P6) is proven; over-promises.

## Consequences
- **(+)** PRD NFRs become testable; [09](../09-verification-open-questions.md) gains concrete fixtures; releases can gate on them.
- **(+)** Determinism and zero-secret are treated as **hard invariants**, not best-effort.
- **(−)** Status stays **Proposed** until ratified; some numbers (availability, cost accuracy) can only be measured post-P6, so early phases verify them on representative-but-partial setups. Re-ratify at P6.
