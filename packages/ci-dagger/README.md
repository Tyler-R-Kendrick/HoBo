# HoBo CI Dagger

`@hobo/ci-dagger` is the planned Dagger sibling in the HoBo.CI family.
GitHub Actions is the first implementation target in
[`@hobo/ci-gh-actions`](../ci-gh-actions/README.md).

The package exports readiness metadata: `INTEGRATION_STATUS` is `planned`,
`EXECUTION_AVAILABLE` is `false`, and `PENDING_GATES` lists the acceptance work.
`getReadiness()` returns an immutable view derived from the generated protobuf
record. `parseReadiness(json)` parses protobuf JSON and constrains it to the
planned state. There is no execution API or registered execution provider yet.

The integration target is the [Dagger TypeScript SDK](https://docs.dagger.io/)
(`@dagger.io/dagger`), with the engine hosted on a budget-authorized isolated
machine. A Dagger engine is a pipeline runtime; its name alone does not identify
a compute provider, a free allocation, or a provider price. Future execution
will use the account and provider contracts owned by
[`@hobo/ci`](../ci/README.md).

Implementation must pin SDK/engine versions, define protobuf commands/events
and CUE invariants, reserve account-scoped capacity before starting an engine,
verify module and artifact identities, and reconcile cancellation and measured
host usage. The [architecture note](ADR.md) and local contract notes identify
the gates required before the status changes.

Validation: `pnpm --filter @hobo/ci-dagger typecheck`,
`pnpm --filter @hobo/ci-dagger test`, and
`pnpm --filter @hobo/ci-dagger lint`. Scoped schema generation/checks use
`node --import tsx packages/schema-tools/src/cli.ts --filter packages/ci-dagger`
and the same command with `--check`; CUE valid/invalid fixtures and a local
in-process SDK Pact pin the readiness boundary. These checks verify readiness
only; they do not execute Dagger.
