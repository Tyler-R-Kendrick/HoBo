# Cloudflare native execution backend

Status: implemented SDK adapter, locally contract-tested. No Cloudflare resources
are created or deployed by this change.

Local execution uses this same adapter and SDK in a separate Worker entrypoint,
with Wrangler-emulated Workflows/R2 and Docker Sandbox instances. A prepared Git
archive lives in the image at `/opt/hobo-ci/source.tar.gz`; the SDK source adapter
returns a file URL rather than reading Artifacts. Each preparation gets fresh
local state and an immutable source SHA. The pipeline checks that SHA and the
preparation ID before
executing commands. We retain the public SDK 0.2.0 source discriminator because
its `getProvider()` signature fixes the generic provider to CloudflareArtifacts;
this is local metadata, not a remote Artifacts binding.

The local Sandbox subclass forces binding-backed `createBackup` even when the
SDK detects FUSE, preventing an accidental presigned remote R2 path on macOS/WSL.
It preserves native snapshot handles and restore semantics. Config and launcher
contain no deployment operation, remote binding or fallback. Cross-run cache and
source credentials are disabled. No extra HTTP command endpoint is introduced:
Wrangler's local Workflow commands own triggering, status and termination.

The package reuses the generated `@hobo/ci` pipeline/result boundary and its
protobuf/CUE constraints. Local source is an implementation of the real upstream
adapter types, protected by a consumer Pact; config is checked against Wrangler's
types and a committed characterization snapshot. Archive preparation is tested
against a real temporary Git repository. These are local contract expectations,
not Cloudflare provider verification.

Self-review found that Git hooks can export repository selectors which override
`git -C`, and that an old dev session can have the same source SHA but a different
pipeline. Preparation clears Git's local repository selectors; trigger metadata
binds the unique preparation ID and the Worker rejects mismatches before starting
a runner. The local tests reproduce both failures. This opt-in mode remains
experimental until a compatible Docker host completes native acceptance.

The adapter implements the shared `PipelineBackend`/`PipelineSession` ports and
consumes the generated shared pipeline, step-result and artifact records. It imports
actual `CiContext` and `CiRunnerResult` types from pinned `@cloudflare/ci` 0.2.0.
Runtime Worker imports are confined to the compiled Worker example; Node consumers
can load the adapter without resolving `cloudflare:workers`.

Native SDK chaining is semantically significant: `ci.runner` starts an independent
workspace, while `result.runner` restores the previous snapshot. The adapter uses
one root and then chains every command/artifact read. Native source overlays would
otherwise overwrite tracked-file mutations. The first command creates a private
source copy at `.hobo-ci-workspaces/<pipeline.id>` using tar with the reserved
namespace excluded. Later chained runners restore that untracked copy; the SDK
overlays only the outer checkout. User working directories are canonically confined
to the private copy and artifacts retain symlink checks. A namespace collision
fails before executing user commands. The setup runs inside the command timeout. A deterministic protobuf
command envelope preserves original exit status/stdout/stderr while a zero wrapper
status lets the SDK persist its snapshot. Native Workflow retries are zero, so
non-idempotent commands are not silently repeated. Pipeline replay belongs to the
native Workflow and the HoBo reservation actor.

Parse, don't validate: shared `ParsedPipeline` is a derived domain type. Local
`CommandEnvelope` and readiness records are generated from protobuf; CUE constraints
and valid/invalid fixtures cover both. Native outputs cross one parser boundary.
The SDK methods' typed options are used directly instead of a parallel handwritten
representation. The readiness view is immutable and signals implemented execution.

A required termination callback requests the actual Workflow binding/controller
operation. An optional application-owned `verifyShutdown` port must positively
acknowledge stopped work before an in-flight cancellation, timeout or unknown native
failure can be settled. A completed command with a nonzero exit needs no stop request. A termination request alone remains uncertain. Native command callbacks, streamed output
and artifact reads share the caller's abort signal. The shared actor owns command
admission, event store, projection, snapshot and read store; this adapter does not
mutate those read models or start another ledger.

PACT consumer fixtures exercise the shipped backend over a simulated native SDK
context and real local shell commands. They verify snapshot chaining, request names,
zero retries, bounded timeout, working directory/environment, outputs and artifact
integrity. Other tests cover command failure, quoting, streamed output, malformed
responses, missing artifacts, cancellation and failed termination.

The upstream package publishes TypeScript source with extensionless Worker imports.
This package therefore uses `moduleResolution: bundler` and `module: esnext`, while
retaining `strict: true`. Upstream source does not compile with
`exactOptionalPropertyTypes` or `noUncheckedIndexedAccess`; only this package scopes
those two flags off rather than patching upstream or inventing SDK types. The Worker
example is part of both build and typecheck. SDK API/type changes fail those gates.

SDK 0.2.0 destroys each command sandbox after outputs drain but swallows cleanup
errors; randomized sandbox IDs are not exposed by CiContext. The adapter therefore
does not turn a Workflow termination request into a shutdown guarantee. The Worker
example intentionally lacks a verifier and yields uncertain stop outcomes until
the application supplies authoritative ownership evidence. Successful command
results remain usage estimates, not invoices or proof of host resource destruction.

The native runner contract tests extract the pinned SDK configuration resolver via
the TypeScript compiler AST and execute that actual code in an isolated VM. This
protects the required 10-second command/Workflow timeout margin; a fixture that
merely accepted every typed RunnerOptions object would miss the real runtime gate.

The snapshot fixture reproduces upstream source overlay before every command; a
regression modifies one tracked file and deletes another, then verifies both changes
and the resulting artifact survive. No eager whole-pipeline execution is used to
hide checkpoint differences. Initial source-copy cost is part of execution usage.
