# Review & improve log — scope refactor (Yard⊃Camp⊃Bindle, remove World, secretless secrets)

> `/review` (3 fresh-context critical reviewers: scope-coherence, World-removal completeness, secretless+gaps) reconciled, then `/improve` applied. Audited at commit `4692931`. **Status:** ✅ fixed · 🔭 tracked as open question (larger scope).

## Applied (this iteration)
| Finding (reviewer) | Sev | Action | Status |
|---|---|---|---|
| Bindle↔Camp cardinality; multi-cloud atomicity; Camp naming (`prod` vs `prod-aws`) | HIGH | **ADR-0028**: Camp id `<env>-<provider>`; Bindle→1..N Camps; cross-Camp `bind` Yard-wired; `--env` group saga (`env.*`) for atomic promote/rollback | ✅ |
| `camp.WorldBound` event survived the sweep | MED | renamed `camp.RuntimeBound` ([11](../docs/design/event-model.md#plan-11)) | ✅ |
| Runtime backend ⊥ Provider — can they be different vendors? | MED | stated explicitly: a Camp independently picks a runtime backend **and** a provider (glossary, [02](../docs/design/sdk-api.md#plan-02), ADR-0026 link) | ✅ |
| "runtime" overloaded (`@hobo/runtime` pkg vs `Runtime` interface vs backends) | HIGH | **disambiguation note** added (glossary + [01](../docs/design/architecture.md#plan-01)/[02](../docs/design/sdk-api.md#plan-02)) rather than a churny second rename | ✅ |
| `secret()` collision — Plan 31 config-loader vs Plan 21 `secret` resource | MED | Plan 31 loader renamed **`secretRef()`**; the managed-store resource stays `secret()` ([31](../docs/design/authoring-resources-wiring.md#plan-31), FR-015) | ✅ |
| Local-dev secret resolution unspecified | HIGH | Plan 31 §Local dev: resolve `secretRef` on the local Camp from a gitignored `.env.local`/OS keychain, **dev-only, marked non-prod, audited as dev** | ✅ |
| Secret values leak into training **trajectories** (captured pre-redaction) | HIGH | redaction at **OpenInference span-capture time** (before storage/export) — Plan 31 + ADR-0023 | ✅ |
| "Bounded" static fallback not quantified | HIGH | concrete defaults: max TTL ≤ 7d, enforced rotation, **every fetch** audited, bounded in-proc cache — ADR-0023/Plan 31 | ✅ |
| Multi-Camp secret divergence unchecked | HIGH | `hobo doctor`/`verify` parity check; `config.Resolved` records ref **+ Camp** (Plan 31, FR-014) | ✅ |
| Secret-store availability failure mode unspecified | MED | Plan 31 §Availability: fail-fast + bounded retry + short cache; `secret.Unavailable` event | ✅ |

## Tracked as open questions (larger scope — captured, not built this round) — see [09](../docs/design/verification.md#plan-09)
| Gap (reviewer C, Part B) | Why it matters | Direction |
|---|---|---|
| 🔭 App-data **schema evolution & cross-cloud migration** | the multi-cloud premise needs data portability, not just infra | versioned, event-sourced migrations gated by `hobo verify`; new plan candidate |
| 🔭 **Stateful storage consistency across Camps** | cross-Camp apps fragment state | define HoBo guarantee vs app-responsibility + patterns (CQRS-per-Camp, replication) |
| 🔭 **Local-dev fidelity** (networking tiers, auth, quotas, secrets) | "works locally, breaks in prod" undermines DX | fidelity table in [15](../docs/design/developer-experience.md#plan-15): simulate / mock / must-test-in-Camp |
| 🔭 **Billing, quota enforcement, cost attribution** | go/no-go for the hosted business | expand [16](../docs/design/reliability-observability-cost.md#plan-16): quota gates, runaway-spend breaker, chargeback |
| 🔭 **Migration/onboarding** from Lakebed / Terraform / FaaS | greenfield-only limits the market | bridge strategies (import/transpile/adapt) in [08](../docs/design/roadmap.md#plan-08) |
| 🔭 **Yard federation / multi-Yard** | multi-region/regulatory orgs | v1 = one Yard per tenant boundary; federation deferred (ADR-0026 note) |

## Rejected / non-issues
- WIT-world corruption — reviewer B confirmed none (preservation held).
- Three-scope nesting itself — reviewers judged it sound; only the user-facing mapping needed tightening (done via ADR-0028).
