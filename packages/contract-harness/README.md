# @hobo/contract-harness

Production PACT consumer/provider harness for HoBo service boundaries (`HOBO-582` / S0-05).

Zero runtime dependencies — consumed by other packages only as a `devDependency`.

## Per-package `contracts/` convention

Every package that owns service boundaries keeps:

```text
contracts/
  pact-inventory.md
  pacts/<boundary>.pact.json
  consumer/<boundary>.contract.test.ts
  provider/<boundary>.provider.test.ts
  provider/fixtures/*.ts
```

Inventory table columns: Boundary | Consumer | Provider | Protocol | Pact file/test | Provider verification | Mock used | Status.

Status progresses `consumer_tested` → `provider_verified`.

## Public API

- `parsePactDocument` — parse-don't-validate entry for pact JSON (mirrors `data-models/contract-harness.cue`); each interaction carries its Pact v3 `providerStates` when it names any. The CUE records also admit a response's `matchingRules` (`#PactMatchingRules`, keyed by path) and metadata's `verifiedAgainst`. `cue vet` does not run in this package's tests; the TypeScript parsers hold the same shapes
- `loadPactDirectory` — load non-recursive `*.pact.json` from a directory
- `createMockProviderFromPact` — consumer-side in-process mock
- `verifyPact` — provider verification (exact provider identity/status/headers; response body recursive-subset)
- `createHttpProviderStub` — a `ProviderStub` answered by a running HTTP server, so `verifyPact` checks a pact against a real provider (an emulator started for the run, a package's own server). `parseHttpProviderTarget` derives its frozen target: the pact provider name, an `http(s)` base URL, and optionally the `Host` to send (TLS is still verified against the base URL's host), a PEM `ca` to trust, a deadline and a response cap. A status the server sends, 501 included, is reported as it is; an unreachable server rejects with `HTTP_PROVIDER_UNREACHABLE` and the socket code (`ECONNREFUSED`)
- `exchangeHttp` — the one request/answer exchange underneath, for a client under test that must reach the same server (a provider transport rewritten to a loopback origin that keeps the request's `Host`). Node builtins only: no redirects followed, no environment proxy, a deadline and a response cap on every exchange. A refusal names the method and the path, never the query, which can carry a token. TLS is verified against the address dialled, never the `Host` header; `test/http-provider.test.ts` pins both directions offline with the test-only certificates in `test/fixtures/tls/`
- `parseResponseMatchingRules` / `matchResponseBody`, and `verifyPact(pact, provider, { responseMatchingRules })` — Pact v3 response `matchingRules` applied on the provider side, so a provider that generates identifiers can be verified against a pact that declares their shape. The Pact Specification v3's semantics: rules cascade to every child and the most specific path wins; `type` requires every key of the example (each compared by type in turn) and holds every array element to the example's first, with `min`/`max` bounding an array's length; `regex` matches a value's string form; `equality`, the default, resets a cascading rule; `combine` is `AND` (default) or `OR`. Anything else is refused with `MatchingRuleError` (`MATCHING_RULE_INVALID`) when the rules are read, never ignored: another matcher, a key a matcher or rule does not have, a path with `*`, a path the example lacks, or an example that fails its own rules. The consumer-side mock answers the example as before
- `parseProviderStates`, and `verifyPact(pact, provider, { providerStates, stateHandlers })` — Pact v3 `providerStates` per interaction (a name and optional params). The handler for each state an interaction names runs, in order and with its params, before the interaction is sent, so a pact verifies in any order; a state without a handler, or whose handler throws, fails that interaction (`provider state "…" has no handler`), which is not sent. A malformed state is `ProviderStateError` (`PROVIDER_STATE_INVALID`). Without the option, states are not set up, as before
- `mirrorLaneEndpoint`, `createMirrorTransport`, `readMirrorJournal`, `mirrorControl`, `recordMirrorLaneReport` — the test side of the mirror lane (ADR-0174): the emulator `pnpm run test:mirror` started (`HOBO_MIRROR_URL`, `HOBO_MIRROR_CA`; `MIRROR_URL_REQUIRED` when unset), a transport with the shape of `@hobo/core`'s `HttpTransport` that sends an already-guarded request there with its path, query and `Host`, the emulator's journal as frozen entries (each held to the CUE model: a tier of `emulate`, `mock` or `proxy`, a status from 100 to 599, non-empty ids and operation; anything else is `MIRROR_JOURNAL_UNREADABLE` naming the field), its `/_mirror/*` routes, and a verification report left in `HOBO_MIRROR_REPORTS` for the runner to print (a passing test's console output is not something every reporter shows)
- `checkPactInventory` — pact file ↔ inventory drift gate

The effect-aware isolation/mocks/fault-injection helpers (ADR-0136:
`createEffectIsolation`, `mocksForEffects`, `filterPureContracts`,
`dualFixturesForEffects`, `runResilienceFaultInjection`, `captureContractEffects`)
live in `@hobo/contracts` so this package stays dependency-free (a
`@hobo/contract-harness → @hobo/contracts → @hobo/core` chain would close a
package-graph cycle with `@hobo/core`'s dev-time PACT usage of this harness).

## Commands

```bash
pnpm exec turbo run build test --filter ./packages/contract-harness
```

## Data models

Protobuf-first shapes live in `data-models/contract-harness.proto`; CUE constraints in `data-models/contract-harness.cue`. TypeScript interfaces mirror the protobuf messages; parity is enforced by `test/pact-parse.test.ts` fixtures.
