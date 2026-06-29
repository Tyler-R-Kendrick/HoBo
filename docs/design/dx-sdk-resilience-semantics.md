# DX SDK Resilience Semantics

This record is the M0 contract matrix for HOBO-515. It translates useful Effect
and XState ideas into HoBo-native SDK semantics without adding either library as
a public dependency. The goal is to make later coding-agent work precise: the
next proof package is `src/draft/resilience-semantics-annex`, and the public
claim is bounded to durable WIT calls, manifest IR, and replayable event facts.

## Requirements Sources

- [`sdk-contracts.md`](./sdk-contracts.md) is the SDK public-contract map.
- [`wasm-runtime-wit.md#plan-20`](./wasm-runtime-wit.md#plan-20) defines the
  WIT-first `hobo:sdk` surface and idiom-layer boundary.
- [ADR-0072](./adr/01-architecture-core.md#adr-0072) requires generated WIT
  bindings plus thin idiom layers.
- [ADR-0093](./adr/01-architecture-core.md#adr-0093) separates the SDK
  semantics annex from golden-IR lowering parity.
- [`src/draft/idiom-semantics-annex`](../../src/draft/idiom-semantics-annex)
  proves error mapping, cancellation, async ordering, and IfC side-effect order.
- [`src/draft/sdk-idiom-conformance-gate`](../../src/draft/sdk-idiom-conformance-gate)
  composes golden-IR and semantics-annex lanes.
- Effect references: [Expected Errors](https://effect.website/docs/error-management/expected-errors/),
  [Retrying](https://effect.website/docs/error-management/retrying/), and
  [Scheduling](https://effect.website/docs/scheduling/introduction/).
- XState references: [state machines and statecharts](https://stately.ai/docs/state-machines-and-statecharts),
  [actors](https://stately.ai/docs/actors), and
  [inspection](https://stately.ai/docs/inspection).

## Vocabulary

| External lesson | HoBo-native term | Existing source | Required distinction |
|---|---|---|---|
| Effect expected error channel | Typed WIT failure | `hobo:sdk` WIT `result<>` plus HOBO-31 error-mapping vectors | Expected/domain failures are data at the boundary, not swallowed throws. |
| Effect retry schedule | Deterministic retry plan | `step(fn, opts?)` in [`sdk-api.md`](./sdk-api.md#plan-02), queue/clock runtime proofs | Retry timing is seeded and replayable; it is not hidden promise recursion. |
| Effect defect/terminal failure | Terminal failure | Existing `run.*`, `policy.*`, and `capability.*` facts | Terminal and denied outcomes never enter retry schedule evaluation. |
| XState state machine/statechart | Transition table | ResourceActor, rollout, runbook, and saga proof packages | States, events, and impossible transitions are explicit fixtures, not object-shape convention. |
| XState actor | SDK-visible work unit | `workflow`, `step`, `actor`, `saga`, and runbook-style work | Child lifetime is tied to persisted parent facts or an explicit spawn contract. |
| XState inspection event | Replay-derived inspection | event store, projection, and conformance report facts | Inspection reads persisted facts; process memory is never authoritative. |

## Contract Matrix

| Semantics area | Required HoBo behavior | First proof vector | Later consumer |
|---|---|---|---|
| Transient retry | A transient provider/runtime failure may retry only under a deterministic schedule with a stable budget and attempt facts. | HOBO-516 `transient-retry-schedule` | HOBO-517 SDK conformance resilience lane |
| Policy denial | `policy.Decided` with a deny outcome is terminal for that operation. It does not become retryable because a provider also failed. | HOBO-516 `denial-never-retries` | HOBO-520 local diagnostics copy |
| Terminal failure | A typed terminal SDK failure stops retry immediately and records the terminal reason. | HOBO-516 `terminal-never-retries` | HOBO-517 resilience report |
| WIT error mapping | A WIT error result must surface as the target-language typed failure shape and fail the semantics lane if swallowed. | Existing HOBO-31 vector, imported by HOBO-517 | HOBO-517 SDK conformance gate |
| Caller cancellation | Caller-owned cancellation stops pending retry work and records interruption/cleanup facts. | HOBO-516 `cancellation-stops-retry` | HOBO-519 child lifetime vectors |
| Deadline expiry | Deadline expiry escalates from persisted schedule/deadline state, even if no fresh command attempt arrives. | HOBO-516 `deadline-escalates-from-state` | HOBO-519 supervision semantics |
| Cleanup/finalizer | Cleanup emits facts after interruption; cleanup failure is audited and cannot mark parent work successful. | HOBO-516 `cleanup-after-interruption` | HOBO-518 lifecycle table, HOBO-519 supervision |
| Replay inspection | Replay reconstructs terminal state and inspection output without re-running effects or incrementing counters. | HOBO-516 `replay-no-effect-rerun` | HOBO-520 local diagnostics |
| Lifecycle transition table | Legal transitions, illegal transitions, terminal duplicate events, and replay hydration are fixtures. | HOBO-518 transition-table contract | HOBO-520 docs and diagnostics |
| Supervision | Invoked child work stops on parent exit; spawned child work requires explicit stop or parent teardown ownership. | HOBO-519 supervision vectors | HOBO-520 docs and diagnostics |

## First Proof Package

Build `src/draft/resilience-semantics-annex` first. It should be a small
independent POC that produces a stable report consumed by later issues.

Target files for HOBO-516:

- `src/draft/resilience-semantics-annex/package.json`
- `src/draft/resilience-semantics-annex/README.md`
- `src/draft/resilience-semantics-annex/src/resilience-semantics-annex.mjs`
- `src/draft/resilience-semantics-annex/test/resilience-semantics-annex.test.mjs`

Required report categories:

- `goldenIrLane`: not owned by this package, but the report must be composable
  with HOBO-32.
- `existingSemanticsLane`: imported or mirrored from HOBO-31 where needed.
- `resilienceSemanticsLane`: transient retry, denial, terminal failure,
  cancellation, deadline, cleanup, replay inspection.
- `unsupportedBehavior`: explicit callouts for any helper claim without a
  vector.

Focused command:

```powershell
npm.cmd --prefix src\draft\resilience-semantics-annex test
```

## Later Issue Map

| Issue | Target path | Required command | Scope guard |
|---|---|---|---|
| HOBO-516 | `src/draft/resilience-semantics-annex` | `npm.cmd --prefix src\draft\resilience-semantics-annex test` | No Effect/XState dependency; no production conformance package change. |
| HOBO-517 | `src/draft/sdk-idiom-conformance-gate` | `npm.cmd --prefix src\draft\sdk-idiom-conformance-gate test` | Do not claim SDK helper parity without resilience vectors. |
| HOBO-518 | focused draft package or HOBO-516 extension | focused package test plus `npm.cmd run docs:design-lint` | No generic statechart interpreter and no XState dependency. |
| HOBO-519 | focused draft package or HOBO-516 extension | focused package test plus `npm.cmd run docs:design-lint` | No distributed scheduler or production supervision tree. |
| HOBO-520 | SDK docs and local diagnostic example | `npm.cmd run docs:cli-lint`; `node scripts\validate-sdk-contracts.mjs` | No polished hosted inspector or remote dashboard. |

## Required Negative Checks

- A fixture with `policy.Decided` deny plus transient provider failure must stop
  at denial and fail any design that retries it.
- A fixture that lowers to golden IR but swallows a WIT error result must fail
  the semantics lane.
- A fixture whose inspection output comes from object memory instead of
  persisted facts must fail.
- A fixture that treats cancellation as hidden retry must fail.
- A fixture that increments effect counters during replay must fail.

## Do Not Implement

- Do not add Effect, XState, `@statelyai/inspect`, or any statechart runtime as
  public SDK dependencies.
- Do not move retry, deadline, cancellation, or lifecycle behavior into
  provider-specific code paths.
- Do not expose in-memory actor snapshots as authoritative diagnostics.
- Do not broaden `@hobo/conformance/sdk` in this M0 issue. HOBO-517 owns that
  integration.
- Do not create a draft proof package in HOBO-515. This document is the M0
  vocabulary and acceptance matrix; HOBO-516 owns executable proof code.

## Verification

For this M0 contract record:

```powershell
npm.cmd run docs:design-lint
node scripts\validate-sdk-contracts.mjs
git diff --check
```
