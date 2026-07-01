# Intent-alignment gap review — Nomad × Aspire × Nitric × FinOps × agent-native

> Long-running review log for the HoBo design suite. Original owner intent: **"HashiCorp Nomad +
> .NET Aspire + Nitric with some FinOps and agent-native experiences."** Audited against commit
> `6fdbe67` on branch `claude/project-scope-gaps-review-pv38y3`.
>
> **Status key:** 🔎 candidate · ✅ confirmed · 🧯 remediation documented · ✔ remediated ·
> ❎ rejected (non-issue) · 📘 deliberate-and-documented (accepted decision, not drift).
>
> **Standing decisions (from the repo owner, 2026-07-01):**
> 1. The wasm-host pivot away from Nomad (self-hosted wasmCloud, wasm-in-container floor) is
>    **accepted** — findings check that the Nomad-concept → HoBo-design mapping is explicit and
>    complete; they do not re-litigate the decision.
> 2. This document is the long-running register; review iterations **append** to it. IDs are
>    stable and never renumbered; rejected candidates move to Verified non-issues, never deleted.
> 3. Remediations are **documented, not applied** in the review pass that confirms them.

## Intent & pillars

| Pillar | Original intent | Where it should live |
|---|---|---|
| **P1 Nomad** | Heterogeneous workload orchestration/scheduling (containers/VMs/raw-exec), bin-packing placement, federation | `docs/design/control-plane.md`, `docs/design/platform-engineering.md`, `docs/design/adr/01-architecture-core.md`, `docs/competitors/nomad.md` |
| **P2 Aspire** | Local-dev orchestration, app composition/wiring, dev dashboard, polyglot DX | `docs/design/developer-experience.md`, `docs/design/sdk-api.md`, `docs/design/authoring-resources-wiring.md`, `docs/competitors/aspire.md` |
| **P3 Nitric** | Cloud-agnostic Infrastructure-from-Code, portable resource ports, least-privilege `.allow()` | `docs/design/authoring-resources-wiring.md`, `docs/design/wasm-runtime-wit.md`, `docs/competitors/nitric.md` |
| **P4 FinOps** | Cost as a first-class input: estimates, budgets, showback, cost-aware placement | `docs/design/reliability-observability-cost.md`, `docs/design/finops-budget-routing-control-plane.md`, ADR-0039/0071 |
| **P5 Agent-native** | Agents as first-class principals and operators: identity, MCP, Crew, generation | `docs/design/ai-native-agent-auth.md`, `docs/design/operators-sre.md`, `docs/design/generated-stack.md`, ADR-0054+ |

Cross-cutting lenses: **L-DRIFT** (scope drift vs ADR-0063/0064 and the archived requirements) ·
**L-CONS** (internal consistency and intent→design traceability).

## Verdict summary

**Iteration 0 (2026-07-01):** register scaffold seeded; **zero** confirmed gaps or drifts. Review
iterations begin in follow-up commits on this branch or successor PRs.

_Populated per iteration; latest verdict wins._

## Iteration log

### Iteration 0 — 2026-07-01 — scaffold seed (`8a5e2c5`)

- **Lenses:** none (register bootstrap only)
- **New findings:** none
- **Confirmed / rejected:** none
- **Stop rule:** open — minimum two review iterations remain before closure

_One section per iteration: date, commit, lenses run, new/confirmed/rejected finding IDs, stop-rule status._

## Gap register

| ID | Pillar | Sev | Status | Claim | Evidence | Remediation |
|---|---|---|---|---|---|---|

## Drift register

| ID | Lens | Class | Status | Intent | Actual | Evidence |
|---|---|---|---|---|---|---|

Drift classes: **deliberate-documented** (decision recorded in an ADR/plan — reported 📘, no remediation
required beyond mapping) · **deliberate-undocumented** (evidently intentional but no decision record) ·
**silent** (no evidence of a decision).

## Remediations

_One `### REM-NNN` per confirmed finding: Action · Acceptance criteria · Effort (S/M/L) · Delivery link._

## Verified non-issues

| ID | Candidate | Why rejected (covering evidence) |
|---|---|---|

## Method appendix

**Finding schema** (as returned by review lenses):
`{id, pillar, type: gap|drift, severity, claim, evidence[], counter_evidence_checked[], verdict: confirmed|rejected|refined, proposed_remediation}`

**Severity rubric:** HIGH = a pillar promise is broken or unfindable in the design suite ·
MED = present but under-specified for its stated build stage · LOW = hygiene/traceability.

**Adversarial rules:** no finding may be confirmed without checking
`docs/design/known-limitations-register.md`, the ADR-Pn open-decisions section in
`docs/design/adr/07-portability-extensibility.md`, and a grep sweep of `docs/design/` +
`docs/archive/requirements/requirements.md` for covering text. Deliberate deferrals are
classified 📘 deliberate-documented, not gaps.

**Stop rule:** minimum two iterations; the review closes when an iteration confirms zero new findings.
