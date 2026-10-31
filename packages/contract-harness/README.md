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

- `parsePactDocument` — parse-don't-validate entry for pact JSON (mirrors `data-models/contract-harness.cue`)
- `loadPactDirectory` — load non-recursive `*.pact.json` from a directory
- `createMockProviderFromPact` — consumer-side in-process mock
- `verifyPact` — provider verification (exact provider identity/status/headers; response body recursive-subset)
- `createHttpProviderStub` — a `ProviderStub` answered by a running HTTP server, so `verifyPact` checks a pact against a real provider (an emulator started for the run, a package's own server). `parseHttpProviderTarget` derives its frozen target: the pact provider name, an `http(s)` base URL, and optionally the `Host` to send (TLS is still verified against the base URL's host), a PEM `ca` to trust, a deadline and a response cap. A status the server sends, 501 included, is reported as it is; an unreachable server rejects with `HTTP_PROVIDER_UNREACHABLE` and the socket code (`ECONNREFUSED`)
- `exchangeHttp` — the one request/answer exchange underneath, for a client under test that must reach the same server (a provider transport rewritten to a loopback origin that keeps the request's `Host`). Node builtins only: no redirects followed, no environment proxy, a deadline and a response cap on every exchange. A refusal names the method and the path, never the query, which can carry a token
- `withResponseMatchingRules` / `parseResponseMatchingRules` — Pact v3 response `matchingRules` (`regex`, `type`, `equality`) applied on the provider side, so a provider that generates identifiers can be verified against a pact that declares their shape; any other matcher is refused when the rules are read, never ignored. The consumer-side mock answers the example as before
- `mirrorLaneEndpoint`, `createMirrorTransport`, `readMirrorJournal`, `mirrorControl`, `recordMirrorLaneReport` — the test side of the mirror lane (ADR-0174): the emulator `pnpm run test:mirror` started (`HOBO_MIRROR_URL`, `HOBO_MIRROR_CA`; `MIRROR_URL_REQUIRED` when unset), a transport with the shape of `@hobo/core`'s `HttpTransport` that sends an already-guarded request there with its path, query and `Host`, the emulator's journal as frozen entries, its `/_mirror/*` routes, and a verification report left in `HOBO_MIRROR_REPORTS` for the runner to print (a passing test's console output is not something every reporter shows)
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
