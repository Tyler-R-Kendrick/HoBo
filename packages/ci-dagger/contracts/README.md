# Dagger SDK contracts

- `readiness.pact.json`: synchronous-message expectation for immutable implemented
  readiness; `readiness.consumer.test.ts` invokes the real SDK getter/parser.
- `execution.pact.json`: synchronous-message command requests and output expectations
  from the shipped Dagger adapter; `../test/backend.test.ts` executes all interactions
  and verifies source-snapshot chaining, clean step environments, exact exit codes,
  binary artifacts, cancellation acknowledgment and uncertain shutdown.

- `sdk-graphql.pact.json`: loopback HTTP protocol requests for the actual default
  SDK connector. `sdk-graphql.consumer.test.ts` drives the real pinned SDK and
  verifies engine authentication, query structure and every interaction.

The fake boundary implements a deliberately narrowed fluent SDK port. A production
compile-time witness accepts the pinned actual Dagger Client as that port. These
are local consumer contracts; no live engine or vendor verification is claimed.
