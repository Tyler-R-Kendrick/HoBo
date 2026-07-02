# @hobo/conformance

Production package for [HOBO-585](https://linear.app/quickdeploy-ai/issue/HOBO-585) /
[S0-08](https://linear.app/quickdeploy-ai/issue/HOBO-585/s0-08-hoboconformance-port-suite-harness-core-with-golden-ir-capture).
It promotes the [HOBO-5](https://linear.app/quickdeploy-ai/issue/HOBO-5) proof semantics into a
typed, event-sourced port-suite harness under `packages/conformance/`.

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
pnpm --filter @hobo/conformance typecheck
pnpm exec turbo run test --filter ./packages/conformance
```

## Boundaries

The package is generic over WIT ports and adapters. It does not import runtime,
provider, IaC, build, registry, signing, or `hobo verify` implementations. It
ships package-local Protobuf, CUE, and Pact evidence for the report envelope and
records unrun `camp` tiers honestly for later production verification.
