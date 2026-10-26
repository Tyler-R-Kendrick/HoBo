# HoBo.CI delivery and validation

This initiative delivers four sibling SDK packages in the HoBo monorepo.
GitHub Actions is the primary `runs-on: hobo` target; Dagger and Cloudflare CI
are implemented interchangeable portable-command backends. Validation stays
inside the monorepo with local processes, SDK/provider contracts and `act`.
No external App, repository or paid provider is created for testing.

## Implemented behavior

- `@hobo/ci`: generated protobuf/CUE pipeline contracts, deeply frozen parsed
  commands, sequencing, exact exit/log/artifact results, shared reservation actor
  and capability-aware free-first budget routing.
- `@hobo/ci-gh-actions`: signed webhook relay, App/OIDC/JIT contracts and
  original-job host bridges for GitHub, Blacksmith, Depot, WarpBuild and isolated
  Kubernetes hosts; bound Actions command adapter for portable pipelines.
- `@hobo/ci-dagger`: actual pinned SDK connection, persistent Directory state,
  per-logical-execution graph identity, argv/env isolation and bounded artifacts.
- `@hobo/ci-cf`: actual native SDK context, chained snapshots with a private
  source copy to survive checkout overlays, command envelopes and Worker example.

The same parsed pipeline corpus runs real local commands through all three
production adapters. It checks binary artifacts/digests, literal argv/env, tracked
source edits and deletion, nonzero status, fail-fast and confirmed cancellation.
The Dagger default SDK connector is also exercised over strict local GraphQL;
Cloudflare tests execute its installed SDK's real timeout resolver.

## Routing expectations

1. Only enabled account-owned offers with fresh evidence, compatible backend
   bindings/capabilities and available concurrency enter ranking.
2. Consume usable measured free allocation across eligible providers before
   paid execution; then choose the cheapest paid offer. Partial free credit may
   cover part of an unsplittable job if the paid remainder fits budgets.
3. Reserve worst-case bounded runtime plus startup atomically. Original Actions
   jobs and native pipelines share the same tenant/provider ledger.
4. Recheck evidence, prices and reserved free validity before delayed host
   launch; re-admit stale unlaunched demand against refreshed facts.
5. An identical completed logical execution replays its recorded result without
   charging twice. Input mutation and same-ID/different-plan reuse are rejected.
6. Only definitive refusal before allocation permits provider fallback. Unknown
   allocation, interrupted work or unconfirmed shutdown holds an uncertain
   reservation. Failed commands never automatically replay side effects.
7. GitHub runner assignment follows labels rather than a job ID. Actual runner
   attribution and atomic requeue of unmet demand prevent displaced jobs from
   becoming stranded.

## Executable evidence

- Package `test` lanes: routing, concurrency, replay, identities, malformed input,
  allocation ambiguity, stop acknowledgment and protocol boundary Pacts.
- `contracts/backend-swap.consumer.test.ts`: unchanged pipeline cases through
  all backend adapters, including real filesystem mutations and process stops.
- `pnpm --filter @hobo/ci-gh-actions test:act -- --act <act-0.2.89>`:
  40 actual workflow jobs across eight admitted routing scenarios, plus
  zero-budget refusal with zero launches. Same workflow digest in every run.
- Shared and package-scoped `codegen:check`: protobuf/CUE fixtures and generated
  drift; actual SDK types compile against pinned versions.
- `pnpm run agent:check -- --staged` before commits, and final PR-base checks.

## Review and release boundaries

Independent review found and repaired delayed-credit admission, job-displacement
starvation, synchronous abort/open ambiguity, mutable input hashes, UTF-8 bounds,
short artifact reads, native SDK timeout configuration, snapshot overlay and
Dagger caching/cleanup-ack behavior and account-bound scheduler contexts. Final current-head review and PR feedback
are resolved before squash merge. See `sdlc-state.md` for delivery state.

Hosted onboarding, native provider account entitlement/invoice feeds, HA partition
workers and deployment are separate platform/release tasks. Original GitHub label
routing requires trusted private Linux x64 repositories and experimental host
bridges; it does not rewrite arbitrary queued labels or migrate running jobs.
Pipeline backends bind real account-scoped execution contexts supplied by their
host integration. Successful command completion proves work ended; it does not
certify destruction of persistent engines or idle sandbox billing. Stop outcomes
without positive acknowledgment remain uncertain. These are explicit contract
limits, not requests for external setup to complete this monorepo change.
