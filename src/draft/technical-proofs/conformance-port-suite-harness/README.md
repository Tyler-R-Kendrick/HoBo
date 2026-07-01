# Conformance Port Suite Harness POC

Independent draft POC for [HOBO-585](https://linear.app/quickdeploy-ai/issue/HOBO-585) /
[S0-08](https://linear.app/quickdeploy-ai/issue/HOBO-585/s0-08-hoboconformance-port-suite-harness-core-with-golden-ir-capture).
Promotes the [HOBO-5](https://linear.app/quickdeploy-ai/issue/HOBO-5) proof semantics into a
typed, event-sourced harness ready for `packages/conformance/` once S0-01/S0-03 land on `main`.

## Requirements Source

- `docs/design/generated-stack.md#plan-09` — `@hobo/conformance` trust boundary
- `docs/design/adr/01-architecture-core.md#adr-0072` — golden-IR equivalence + replay
- `docs/design/adr/01-architecture-core.md#adr-0093` — SDK semantics annex lane
- `src/draft/technical-proofs/conformance-port-suite-contract/` — reference semantics (HOBO-5)

## Public API

- `createConformanceSuite(definition)` — parse-don't-validate suite boundary
- `createAdapterRegistry()` — adapter registration
- `runConformanceSuite(definition, adapter, options?)` — event-logged runner
- `evaluateSdkParity(input)` — SDK parity report boundary
- `firstDiff(expected, actual)` — JSON-path first difference
- `projectPortSuiteReport(events)` / `replayPortSuiteReport(report)` — CQRS projection

## Verification

```bash
pnpm --prefix src/draft/technical-proofs/conformance-port-suite-harness typecheck
pnpm --prefix src/draft/technical-proofs/conformance-port-suite-harness test
```

## Promotion Target

When S0-01 (`packages/*` workspace) and S0-03 (`@hobo/core`) merge, promote this package to
`packages/conformance/` publishing `@hobo/conformance`.
