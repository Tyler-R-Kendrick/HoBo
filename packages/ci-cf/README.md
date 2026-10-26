# HoBo CI Cf

`@hobo/ci-cf` implements the shared HoBo pipeline backend using
[`@cloudflare/ci` 0.2.0](https://github.com/cloudflare/ci). The same parsed pipeline
used by GitHub Actions or Dagger can execute against a bound Cloudflare CI context.
Source selection and account authorization belong to the caller's existing
`CIWorkflow` and HoBo reservation, rather than a second unauthenticated API.

```ts
import { createCloudflareBackend } from "@hobo/ci-cf";
import { executePipeline, parsePipeline } from "@hobo/ci/execution";

const backend = createCloudflareBackend({
  context: ci, // CiContext supplied by the actual CIWorkflow
  terminate: async () => {
    const instance = await env.CI_WORKFLOW.get(workflowInstanceId);
    await instance.terminate();
  },
  // Supply verifyShutdown only when an owned controller can prove all work stopped.
});
const pipeline = parsePipeline(JSON.stringify({
  id: "checks", accountId: "my-account", timeoutSeconds: 600,
  steps: [{ id: "test", argv: ["npm", "test"], cwd: ".", env: {} }],
  artifactPaths: [], requiredCapabilities: [],
}));
const result = await executePipeline(backend, pipeline);
```

The native SDK runs inside Workers. Node callers can import this adapter because
its native SDK imports are type-only; production execution still requires a real
Worker-owned `CiContext`. TypeScript consumers use bundler module resolution
because the upstream SDK publishes Worker-oriented TypeScript source. [`examples/worker`](examples/worker) provides a compiled
`CIWorkflow` entrypoint, binding configuration and digest-pinned sandbox base image.
It is a source example and is never deployed by the test suite. The Workflow binding
supplies a termination request. Stopping an in-flight or unconfirmed native call is
only confirmed when an application-owned `verifyShutdown` callback positively acknowledges stopped
Workflow/sandbox work. A termination request alone, a false verifier or a failed
controller produces an `uncertain` result and retains the HoBo reservation. The
source example deliberately has no invented shutdown-verification service. A command
that has already exited (including a nonzero exit) returns its result without
self-terminating the Workflow; the example can then report an ordinary build failure.

Each pipeline step calls the previous result's `runner`, preserving the native
snapshot chain. The first step alone calls the root `ci.runner`. Because the SDK
overlays original tracked source after restoring each snapshot, HoBo initializes
a private copy under `.hobo-ci-workspaces/<pipeline.id>` and runs user commands
there. Native checkout overlays affect only the outer source; tracked edits and
deletions inside the private copy survive later steps and artifact reads. The
reserved namespace must not exist in source. Pipeline IDs identify logical executions;
deterministic paths and step names support native Workflow replay. SDK retries are explicitly disabled for these
commands; HoBo does not retry side effects across adapters. Commands use argument
quoting, confined working directories and per-command environment, and a protobuf wrapper that
retains exact exit code and both output streams even when a user command fails.

The portable artifact subset is regular files of at most one MiB. Artifact reads
reject symlinks in the path, use bounded base64 transport, and return the shared
SHA-256 checked artifact type. SDK string and streamed logs are both supported.
The SDK context already binds the source repository/revision. Arbitrary OCI image
selection, provider-specific source adapters, secret injection and deploy credentials
are not part of the portable pipeline contract.

Readiness is `implemented` and `EXECUTION_AVAILABLE` is `true`; this describes the
shipped adapter, not provisioned customer infrastructure or live provider evidence.
The remaining gates name deployment binding and live acceptance. Tests use native
SDK contract fixtures and actual local POSIX command execution, with no remote
provider resources, GitHub repository access or credentials.

Run `pnpm --filter @hobo/ci-cf build`, `typecheck`, `test` and `lint`.
`typecheck` includes the Worker example against actual upstream SDK/types;
`pnpm codegen:check -- --filter packages/ci-cf` checks protobuf/CUE drift.

Native SDK 0.2.0 destroys command sandboxes after output drains, but it catches
cleanup errors and does not expose randomized sandbox IDs through `CiContext`.
Normal completed commands can return their result; provider billing remains a usage
estimate. Authoritative cancellation/billing needs an application-owned controller
that can positively verify its Workflow and sandbox resources have stopped.

The native provider contract fixture deliberately restores original tracked files
before every local runner call. Tests prove the outer checkout is overwritten while
the private source retains both tracked-file mutations and deletions. Each session
call still executes only its requested step; future steps are not eagerly batched.
