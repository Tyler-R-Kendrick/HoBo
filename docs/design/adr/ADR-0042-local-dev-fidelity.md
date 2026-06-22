# ADR-0042 — Local-dev fidelity (simulate / mock / Camp-only)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 15 — CLI/DX](../15-cli-dx.md) (`hobo dev` inner loop) · [Plan 13 — Networking](../13-networking-connectivity.md) · [Plan 9 — Verification](../09-verification-open-questions.md) (conformance, `hobo verify`) · [Plan 2 — SDK](../02-sdk-api.md) (determinism/replay) · [Plan 20](../20-wasm-wasi-runtime.md) (wasm deny-by-default) · [Plan 30](../30-policy-plane.md)/[Plan 6](../06-ai-native-agent-auth.md)/[Plan 36](../36-end-user-auth.md) (policy + auth) · [Plan 29](../29-contracts-compatibility.md) (can-deploy) · [competitors/gap-analysis](../../../competitors/gap-analysis.md) (#17, Aspire local-dev pressure)
- **Origin:** open question #17 — which prod behaviors `hobo dev` must *simulate* vs *mock* vs *must-test-in-a-Camp*, so "works locally" predicts "works in prod." Designed via brainstorming + grill-with-docs.

## Context
HoBo's DX promise is a fast, offline inner loop (`npx hobo new` → `hobo dev`, no cloud — [Plan 15](../15-cli-dx.md)) where the agnostic path runs locally. But "works locally" is only valuable if it *predicts* prod. Some behaviors can be reproduced faithfully on a laptop; some can't (real cloud IAM, cross-cloud mTLS, provider quotas); and conflating them turns a green local run into a false promise. #17 asks for the explicit classification + a way for developers to know which is which.

## Decision
1. **Classify each prod behavior by "does a wrong local answer hide a real bug?"** — **simulate** (high-fidelity local equivalent) the *correctness-determining* behaviors; **mock** (honest seam) the *environmental* ones that can't be real locally; **defer to a Camp** the *irreducibly-real* ones. (See the matrix below.)
2. **Fidelity is labeled, and `hobo verify` splits local vs Camp checks.** Each capability reports its local fidelity — `real | simulated | mocked | camp-only`; `hobo dev` surfaces it; the **conformance suite** ([Plan 9](../09-verification-open-questions.md)) tags every check `local` or `camp`. `hobo dev` runs the `local` checks (all simulate/real behaviors pass offline); a Camp run runs the `camp` checks. **`hobo verify` will not claim prod-readiness for behaviors that are mocked-only** — it reports coverage = `local ∪ camp` and flags "this needs a Camp test." The fidelity gap is explicit, never silent.

### The fidelity matrix
| Prod behavior | Local fidelity | Why |
|---|---|---|
| Determinism / replay | **simulate (real)** | `runtime-local` runs the real engine; `replay == state` is the core test ([Plan 2](../02-sdk-api.md)/[Plan 9](../09-verification-open-questions.md)) |
| `.allow()` capability denials | **simulate (real)** | wasm deny-by-default is real locally ([Plan 20](../20-wasm-wasi-runtime.md)) — an un-linked call fails identically |
| Auth/ABAC + policy decisions | **simulate (real)** | the policy engine + agent/end-user auth run locally ([Plan 30](../30-policy-plane.md)/[Plan 6](../06-ai-native-agent-auth.md)/[Plan 36](../36-end-user-auth.md)) |
| `can-deploy` / contracts / evals | **simulate (real)** | the Gatekeeper runs locally over the same graph ([Plan 29](../29-contracts-compatibility.md)/[Plan 23](../23-stubbable-ai-implementations.md)) |
| Resource interfaces (db/kv/bucket/queue) | **simulate** | local equivalents (containerized Postgres, in-mem queue, local object store) — same agnostic client ([Plan 15](../15-cli-dx.md)) |
| Embedding / search | **simulate** | local embed model + pgvector/FTS ([ADR-0034](./ADR-0034-search-vector-surface.md)) |
| Cloud IAM (real provider roles) | **mock** (honest seam) | can't mint real AWS/Azure IAM locally; the `.allow()`→IAM mapping is unit-tested ([Plan 9](../09-verification-open-questions.md)) |
| Provider latency / egress / cost | **mock** | environmental; the cost/latency *model* is exercised, real figures need a Camp ([Plan 16](../16-cost-finops.md)) |
| Secrets backends (KMS / Key Vault) | **mock** | local secret stub; the real broker/KMS is Camp-only ([Plan 31](../31-config-secretless-secrets.md)) |
| Cross-cloud mTLS handshake | **camp-only** | needs two real providers + SVID federation ([Plan 13](../13-networking-connectivity.md)) |
| Real quotas / runaway-spend limits | **camp-only** | provider/plan limits are real-environment ([ADR-0039](./ADR-0039-billing-quota-cost-attribution.md)) |
| Provider drift / failure modes | **camp-only** | only a real provider exhibits real drift ([Plan 5](../05-reliability-ha.md)) |

## Alternatives considered
- **Best-effort emulation, no formal matrix.** Rejected: silent fidelity gaps make "works locally" stop predicting prod — the footgun #17 names.
- **Camp-first (little local fidelity).** Rejected: destroys the fast offline inner loop ([Plan 15](../15-cli-dx.md)) + zero-cloud onboarding.
- **Silent fidelity (no labels).** Rejected: a developer can't tell a real local pass from a mocked one; the label + `hobo verify` split is what makes a local pass trustworthy.
- **Make everything simulate-real (full local prod emulation).** Rejected: infeasible (real cloud IAM, cross-cloud mTLS, provider quotas can't be faithfully reproduced on a laptop) and would over-promise.

## Consequences
- **(+)** "Works locally" becomes a *bounded, honest* promise: correctness-determining behaviors are real locally, environmental ones are clearly mocked, and the rest is explicitly Camp-gated — with `hobo verify` enforcing the distinction.
- **(+)** Reuses the conformance suite + `hobo verify` ([Plan 9](../09-verification-open-questions.md)) — the only new surface is a per-check `local|camp` tag + a per-capability fidelity label.
- **(+)** Aligns local-fidelity with the air-gap work ([ADR-0036](./ADR-0036-air-gapped-sovereign-mode.md)): the same local models/stubs power both dev and air-gap.
- **(−)** Maintaining the matrix + labels as capabilities evolve is ongoing discipline; a mislabeled capability re-introduces the false-promise risk.
- **(−)** Mocked behaviors (IAM, latency, secrets) still need a Camp run before prod confidence — `hobo verify` makes that explicit but doesn't remove the step.
