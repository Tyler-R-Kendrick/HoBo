# HoBo CI Dagger

`@hobo/ci-dagger` executes the same parsed `@hobo/ci` command pipeline used by the
GitHub Actions and Cloudflare CI adapters. `createDaggerBackend` binds the source
workspace and a digest-pinned toolchain image to a Dagger SDK connection. The
pinned upstream SDK is `@dagger.io/dagger` 0.21.11.

```ts
import { executePipeline, parsePipeline } from '@hobo/ci';
import { createDaggerBackend } from '@hobo/ci-dagger';

const image = process.env.CI_TOOLCHAIN_IMAGE;
if (!image) throw new Error('Set the reviewed toolchain image@sha256:…');
const backend = createDaggerBackend({sourceDirectory: process.cwd(), image});
const pipeline = parsePipeline(JSON.stringify({
  id: crypto.randomUUID(), accountId: 'my-account', timeoutSeconds: 300,
  steps: [{id: 'test', argv: ['npm', 'test'], cwd: '.', env: {}}],
  artifactPaths: [],
}));
const result = await executePipeline(backend, pipeline);
```

The source workspace is copied through Dagger Directory snapshots between steps.
Each step begins with the clean image environment, so a step's environment values
do not leak into later steps. `HOBO_CI_EXECUTION_ID` is a reserved environment
variable set to `pipeline.id` after user env. Dagger's command cache is therefore
scoped to the logical execution: a new run must use a new pipeline ID (include the
run/revision in the caller's identity), while replaying that same ID can reuse its
DAG. The scheduler separately deduplicates a completed logical execution. Commands use argv arrays with `ReturnType.Any` to
retain nonzero exit codes and logs. GNU `timeout` bounds each command; the overall
pipeline deadline is enforced by the shared executor. The image must provide GNU
`timeout`, `base64`, `realpath`, and a POSIX shell. Container nesting or privileged
host execution is never enabled.

Declared file artifacts are size-checked remotely before base64 encoding, after
resolving their paths inside `/workspace`; binary bytes and SHA-256 digests use the common artifact contract.
The adapter rejects files above one MiB before they enter SDK stdout; the shared
executor independently checks artifact integrity and the same file limit.
Repeated session close calls share the same shutdown acknowledgment, including a
pending or rejected acknowledgment.

An injected `DaggerConnector` can bind a customer-owned managed engine and its
shutdown acknowledgment. The default uses the actual SDK `connect` lifecycle,
which provisions/closes its engine session. The SDK offers no public per-command
stop acknowledgment. If a request is still running at cancellation and the
connection cannot acknowledge a provider `stop()`, cleanup rejects and the shared
executor reports `uncertain`; it does not claim confirmed cancellation or replay
the command on another provider. Completed commands close normally. A first failed SDK log/read query does not clear
in-flight state while sibling queries still evaluate the graph. A failed exit-code
query also retains uncertainty until the provider positively acknowledges stop.

`getReadiness()` and `parseReadiness()` expose an immutable, generated implemented
SDK-readiness record. This is implementation metadata, not budget authorization
or a claim that an engine/provider is currently connected. HoBo's scheduler must
reserve the selected account's allocation before execution.

Validation is local and contract-based: SDK fluent-port requests, snapshot chaining,
command outputs, failures, binary artifacts, cancellation acknowledgment and
unconfirmed shutdown are exercised by `test/backend.test.ts` and the hand-authored
`contracts/execution.pact.json`. A compile-time witness ensures the real SDK client
implements the injected port. `contracts/sdk-graphql.consumer.test.ts` also drives
the default connector through the actual SDK against a strict local GraphQL server,
including authentication, source Directory IDs, command queries and results. No provider resource or remote account is created by
these tests. A reusable `test/fixtures/local-engine.ts` contract fixture also runs
real POSIX commands and files for the cross-backend conformance suite; it is not a
Dagger engine or a security sandbox. Run package `build`, `typecheck`, `test`, `lint`, plus scoped codegen.
