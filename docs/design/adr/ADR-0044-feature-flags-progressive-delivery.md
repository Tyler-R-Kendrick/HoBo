# ADR-0044 — Feature flags & progressive delivery

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Engineering, Product
- **Related:** [Plan 37 — Feature flags](../37-feature-flags-progressive-delivery.md) · [OpenFeature standard](../../../standards/openfeature.md) · [feature-flags pattern](../../../patterns/feature-flags.md) · [Plan 5](../05-reliability-ha.md) (canary/progressive) · [Plan 26](../26-environments-deltas.md) (deploy gates) · [Plan 30](../30-policy-plane.md) (policy-gated flips) · [Plan 32](../32-reactive-live-queries.md)/[ADR-0029](./ADR-0029-reactive-live-query-model.md) (reactive eval) · [Plan 11](../11-event-model.md) (`flag.*`) · [ADR-0038](./ADR-0038-end-user-application-auth.md) (targeting via `ctx.user`) · [ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md) (provider via Matching) · open question [#24](../09-verification-open-questions.md)
- **Origin:** the ecosystem review (#24) found HoBo had deploy-time gates + canary but no runtime feature-flag capability to decouple *release* from *deploy*. Designed via brainstorming + grill-with-docs.

## Context
HoBo controls *deploys* well (canary/progressive rollout [Plan 5](../05-reliability-ha.md), Delta→Set gates [Plan 26](../26-environments-deltas.md), policy obligations [Plan 30](../30-policy-plane.md)) but had no way to toggle *behavior within a running version* — kill-switches, gradual `%` rollout, per-segment targeting, experiments — without a redeploy. Feature flags are the standard answer (OpenFeature is the CNCF standard for flag evaluation), and HoBo should provide them in a way that composes with its audit, policy, identity, and reactive planes rather than as a bolt-on.

## Decision
1. **A first-class `feature-flag` port (`hobo:feature-flag`), OpenFeature-compatible.** HoBo speaks the OpenFeature evaluation API; the **built-in flag store is the default** (zero-dep, air-gap-friendly), and **OpenFeature providers** (flagd/LaunchDarkly/…) are **opt-in per-Camp adapters** (Matching, [ADR-0033](./ADR-0033-deterministic-matching-and-planner-selection.md)). Flag types = boolean/string/number/object. Definitions are **IfC** (declared in the Bindle); values/targeting are runtime state.
2. **Change governance: event-sourced + optionally policy-gated + reactive.** Every value/targeting change is a `flag.*` event ([Plan 11](../11-event-model.md), full audit/replay); a flip can pass through the **policy plane** ([Plan 30](../30-policy-plane.md)) so prod kill-switches / risky `%` bumps require approval or carry obligations (e.g. auto-revert on SLO burn); a change is a **`data.Changed`-class signal** so reactive queries/clients (`useFlag`/`useQuery`, [Plan 32](../32-reactive-live-queries.md)) re-evaluate live.
3. **In-process, deterministic, identity-aware evaluation.** Components evaluate flags **in-process** against a ruleset synced via the Streamer/event log (edge-friendly, no SPOF); targeting context is the unified **`PrincipalRef`** (`ctx.user` [ADR-0038](./ADR-0038-end-user-application-auth.md) / `ctx.identity`); evaluation is a **pure function of `(ruleset@seq, context)`** → replayable + safe inside a reactive `query()` ([ADR-0029](./ADR-0029-reactive-live-query-model.md)).
4. **Flags + deploy gates compose** for progressive delivery: canary = the deploy dial, flag `%` = the release dial; health signals can auto-revert a flag via a policy obligation.
5. **Events** `flag.Defined`/`flag.Changed`/`flag.Evaluated`(sampled)/`flag.Archived`; flip-gate decisions ride `policy.Decided`.

## Alternatives considered
- **Flags as policy-plane decisions (no new port).** Rejected: overloads the policy plane with high-frequency runtime evaluations, loses OpenFeature ecosystem compatibility, and conflates "may I" (policy) with "is this on" (flag). (Flags still *use* the policy plane for *gating flips*, which is the right seam.)
- **BYO external flag SDK (no HoBo capability).** Rejected: leaves the listed primitive unowned; flags wouldn't be event-sourced/reactive/gated like the rest of HoBo, and targeting couldn't reuse `ctx.user`/`ctx.identity`.
- **Central evaluation service.** Rejected: per-eval network hop + SPOF + non-deterministic for replay/reactive; in-process sync matches HoBo's grain.
- **Client-side-only evaluation.** Rejected: untrusted, no server enforcement (unusable for kill-switches/entitlements).
- **Deploy-only flag changes.** Rejected: defeats decoupling release from deploy.

## Consequences
- **(+)** Closes #24 with a standard-compatible capability that uniquely composes with HoBo's audit (`flag.*`), policy (gated flips + obligations), identity (`ctx.user` targeting), and reactive (`useFlag` re-eval) planes — more than a standalone flag tool offers.
- **(+)** Built-in default keeps it air-gap-friendly; OpenFeature compatibility avoids lock-in and lets teams bring an existing flag provider.
- **(+)** Deterministic in-process eval is edge-friendly and replay-safe; progressive delivery (deploy + release dials) becomes one coherent story with auto-revert.
- **(−)** A synced ruleset means a bounded propagation delay on a flip (seconds), like any flag system; kill-switch latency is tied to sync interval (tunable).
- **(−)** Another capability + event group to build and conformance-test; the targeting-rule DSL must be kept aligned with the policy/`.allow()` predicate language to avoid a second rule dialect.
