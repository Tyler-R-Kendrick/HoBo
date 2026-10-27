# GitHub Actions boundary contracts

`jit_bootstrap_response.proto` owns the single-use confidential JIT response.
Never persist its encoded runner credential in events, logs, operation records,
or caches.

`onboarding.proto` owns the account-bound installation principal, reviewed files
and plan, setup operation and pull-request result, and GitHub App manifest.
`onboarding.cue` constrains both these messages and the JIT response; valid and
invalid fixtures run through schema-tools. Generated TypeScript lives under
`src/_generated/` and is regenerated from protobuf.

The shared account, connection, revisioned policy, setup request, control-token
binding, job, lease, and audit-event messages belong to
[`@hobo/ci`](../../ci/data-models/ci.proto). Account policy includes durable Broker
budget-signal cycles and crossing state. The Station bridge consumes its generated
budget-signal and routing-policy messages.

GitHub REST responses, signed webhook payloads, and OIDC claims remain native
GitHub JSON parsed at their external boundaries. A generated onboarding plan is
reviewable intent, not an authorization token: the control API authenticates the
account, restricts installation ownership, and applies its stored server-owned
plan. Connecting requires the reviewed setup pull request to be merged and the
protected bridge ref to match the verified source.

Run scoped generation and drift checks from the monorepo root:

```sh
pnpm codegen --filter packages/ci-gh-actions
pnpm codegen:check --filter packages/ci-gh-actions
```
