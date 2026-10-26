# HoBo CI Cf

`@hobo/ci-cf` is the planned Cloudflare CI sibling in the HoBo.CI family.
GitHub Actions is the first implementation target in
[`@hobo/ci-gh-actions`](../ci-gh-actions/README.md).

The package exports readiness metadata: `INTEGRATION_STATUS` is `planned`,
`EXECUTION_AVAILABLE` is `false`, and `PENDING_GATES` lists the acceptance work.
`getReadiness()` returns an immutable view derived from the generated protobuf
record. `parseReadiness(json)` parses protobuf JSON and constrains it to the
planned state. There is no execution API or registered execution provider yet.

The integration target is [`@cloudflare/ci`](https://github.com/cloudflare/ci).
Cloudflare's [August 4, 2026 announcement](https://developers.cloudflare.com/changelog/post/2026-08-04-build-and-deploy-on-push/)
describes CI steps running in isolated sandboxes inside Workflows, with
Artifacts push events as one trigger. This is the new CI SDK requested for
HoBo CI Cf. The adapter version, supported trigger surface, and exact resource
bindings remain implementation decisions. No Cloudflare SDK dependency is
installed or invoked by this scaffold.

Future execution will authorize the customer's Cloudflare account through
[`@hobo/ci`](../ci/README.md), reserve capacity before starting work, and settle
against measured Workflow/sandbox usage. Checkpoint replay, cancellation,
artifact integrity, and usage reconciliation must have executable contracts
before this package advertises execution support.

Validation: `pnpm --filter @hobo/ci-cf typecheck`,
`pnpm --filter @hobo/ci-cf test`, and `pnpm --filter @hobo/ci-cf lint`.
Scoped schema generation/checks use
`node --import tsx packages/schema-tools/src/cli.ts --filter packages/ci-cf`
and the same command with `--check`; CUE valid/invalid fixtures and a local
in-process SDK Pact pin the readiness boundary. These checks verify readiness
only; they do not execute Cloudflare CI.
