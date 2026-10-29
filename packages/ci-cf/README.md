# HoBo CI Cf

`@hobo/ci-cf` implements the shared HoBo pipeline backend using
[`@cloudflare/ci` 0.2.0](https://github.com/cloudflare/ci). The same parsed pipeline
used by GitHub Actions or Dagger can execute against a bound Cloudflare CI context.
Source selection and account authorization belong to the caller's existing
`CIWorkflow` and HoBo reservation, rather than a second unauthenticated API.

## Run checks locally

The experimental local mode runs the native Cloudflare CI engine on your machine: Wrangler
emulates the Worker/Workflow and R2, and Docker runs the Sandbox containers.
This path needs Git, Node 22+, and a running Docker-compatible engine. No
Cloudflare account, Artifacts repository, R2 bucket or API token is needed.
It does not register a hosted runner or send jobs to Cloudflare Workers Builds.

Supply the same portable pipeline JSON consumed by `@hobo/ci/execution`. For
example, replace the smoke command in [`examples/local/pipeline.json`](examples/local/pipeline.json)
with install/lint/test steps for your project, then run from the HoBo checkout:

```sh
pnpm --filter @hobo/ci-cf local:prepare \
  --source /absolute/path/to/your/git-repo \
  --pipeline /absolute/path/to/checks.json --ref HEAD
pnpm --filter @hobo/ci-cf local:dev
```

In a second terminal:

```sh
pnpm --filter @hobo/ci-cf local:trigger
pnpm --filter @hobo/ci-cf exec wrangler workflows instances list hobo-ci-cf-local --local
pnpm --filter @hobo/ci-cf exec wrangler workflows instances describe hobo-ci-cf-local INSTANCE_ID --local
```

`local:trigger` starts a Workflow asynchronously; inspect its terminal status to learn
whether checks passed. The dev terminal prints step results and artifact records.
Stop the dev process with Ctrl-C. To terminate an individual run while dev is
running, use `wrangler workflows instances terminate hobo-ci-cf-local INSTANCE_ID --local`.
Cancellation retains the existing adapter's uncertain-shutdown semantics.

Preparation resolves `--ref` to an immutable Git commit, creates a fresh directory
under `packages/ci-cf/.hobo/work/`, and writes a reviewable `wrangler.jsonc`, trigger
parameters and Docker build context there. Only that commit's tracked files enter
the image, including any environment files or dependencies already committed to
Git. Uncommitted/untracked host files are excluded; Git submodules and LFS payloads need separate
materialization. Dependency installation belongs in the pipeline. The base image
is the same pinned Sandbox 0.12.1 image as the cloud example. If your checks need
other toolchains, extend the prepared Dockerfile before starting dev.

Each preparation has independent local state. `local:dev` and `local:trigger` select
the latest preparation; `--directory /absolute/path/to/prepared-run` selects an
older one explicitly. Stop dev before preparing another revision. `--work-root`
changes the scratch root for all three commands. Remove an unused preparation
directory to discard its local Workflow/R2 state; Docker images remain subject
to your usual local Docker cleanup.

The Workflow checks both the source SHA and preparation ID before starting a
runner, so an old dev session rejects a newly prepared pipeline even at the same
Git revision. Preparation clears inherited Git repository selectors, including
hook-local `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`, before reading source.

The generated config omits Artifacts and cloud credentials, uses local R2 and
loopback listening, and disables Wrangler telemetry. The launcher always passes
`--local`, accepts no extra Wrangler flags, and has no cloud fallback. Source is
read from an archive baked into the image, so checkout needs no network service.
The local Sandbox class forces `localBucket: true` for backups, including on
Docker hosts with FUSE; no presigned remote R2 URLs are used. The SDK's public
provider discriminator remains `cloudflare-artifacts`, but the local source
adapter accepts only `local/workspace` and performs no Artifacts operations.

This avoids Cloudflare runtime and storage charges for these checks. It does not
prevent commands from calling paid APIs, using remote bindings in nested tools,
or deploying resources. Image/package downloads need network access, and local
CPU, disk and any Docker subscription still belong to your machine. Local runs
are for trusted code and do not establish hosted billing or provider acceptance.

Runtime/configuration evidence checked 2026-10-29:
[Cloudflare CI 0.2.0](https://github.com/cloudflare/ci/releases/tag/v0.2.0),
[local Containers](https://developers.cloudflare.com/containers/guides/local-dev/),
[local Workflows](https://developers.cloudflare.com/workflows/build/local-development/),
and [binding simulation](https://developers.cloudflare.com/workers/local-development/).
The pinned SDK's Sandbox 0.x API is intentional; newer Sandbox 1.x examples are
not interchangeable with it.

TypeScript compiles both Worker entrypoints against the actual SDK. Local config
snapshots and archive tests protect generated inputs, and the local-source Pact
pins offline checkout, credential refusal and binding-backed backups. The
pipeline/result protobuf and CUE constraints remain owned by `@hobo/ci`; this
mode adds no parallel pipeline format or separate execution ledger.

The development environment used for this change built the image and started
the Worker with all bindings local, but could not complete a native runner:
Cloudflare's proxy container failed with `iptables ... RULE_APPEND failed`
because the host lacked the required kernel module. Use a Docker host that
supports Cloudflare's local container networking. The passing contract tests
do not substitute for that native acceptance run.

## Use an existing cloud CI context

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
