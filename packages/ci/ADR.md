# HoBo.CI allocation contract

The four sibling SDKs compose existing HoBo routing at application layer 3.
`@hobo/ci` calls the existing Dispatcher after removing offers that fail budget,
freshness, capability/readiness or concurrency eligibility. This preserves HoBo's
routing model without relying on a ranking score to authorize spend.

Protobuf is authoritative for configuration, job commands, leases, events and
snapshots. Generated TypeScript is consumed directly; no parallel DTO interfaces.
CUE exercises valid and invalid entitlement fixtures. The GitHub integration keeps
its external GitHub JSON subset parsers at the HTTP boundary. It converts queued
jobs to the generated Job command before routing.

Money uses finite nonnegative safe integer USD microdollars. Durations/free balances
are runner minutes, with provider settlement rounded up to a host minute. The first
execution class is homogeneous Linux x64, one account policy per repository. Runtime
reservations include startup and are upper bounds, not an invoice guarantee. Provider
rate changes, external usage, discounts and platform fees require entitlement feeds
and invoice reconciliation before production billing claims.

Routing has no network effects. The integration's durable actor commits a
`ci.LeaseReserved` event and its outbox projection in one SQLite transaction before
external launch. Tests cover free-first ordering, cheapest-paid fallback, account
and provider budget rejection, expiry, pending reservations, isolation and replay.

The pure SDK boundary is pinned by generated protobuf JSON roundtrip tests and CUE
fixtures. The runtime/provider and webhook/bootstrap PACT boundaries belong to
`@hobo/ci-gh-actions/contracts`. No frozen draft proof was promoted or modified.

Parse, don't validate: configuration constructors establish parsed domain types from
protobuf JSON before the pure routing decision. In this first SDK the parsed type
is the generated record plus its constructor's dependent checks; callers should
not mutate it after parsing. A future immutable/branded surface can strengthen
compile-time enforcement without duplicating the protobuf fields.

The runtime actor owns the event store; a projection supplies a snapshot in the
read store. The pure SDK neither emits commands nor mutates a read store itself.
