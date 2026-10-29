# HoBo CI Azure DevOps

`@hobo/ci-ado` runs HoBo's portable command checks locally and generates Azure
Pipelines YAML that runs the same checks on an official self-hosted Linux agent.
The configuration names a self-hosted pool; generated jobs never select a
Microsoft-hosted image. Azure DevOps Services still manages the pipeline, job
status, checkout, logs and Pipeline Artifacts.

## Configuration and local checks

Run from the HoBo monorepo root with Node 24, pnpm, Bash and the tools needed by
your checks installed. Local checks require no Azure account, agent, PAT or
network access beyond what the check commands themselves need. Initial dependency
installation and build can require network access.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run build --filter=@hobo/ci-ado --concurrency=100%
node packages/ci-ado/dist/cli.js run packages/ci-ado/examples/ci.json .
```

The project file selects the pool and a workspace-relative portable Pipeline JSON:

```json
{
  "schemaVersion": "hobo.ci.ado/v1",
  "pool": "hobo-local",
  "demands": ["Agent.OS -equals Linux"],
  "pipelinePath": "packages/ci-ado/examples/pipeline.json",
  "artifactPrefix": "hobo"
}
```

Use `pipelinePath` to point to your actual checks. The example writes
`hobo-ci-result.txt`; replace it with lint, build and test argv commands. Steps
run sequentially and stop at the first nonzero exit. `cwd` is workspace-relative;
`env` supplies explicit environment values. Ambient ADO tokens and arbitrary host
variables are not inherited. Keep credentials out of committed JSON. The current
CLI has no secret binding resolver; checks requiring secrets need an authorized
SDK host to supply step environments in memory.

The shared runtime enforces the pipeline deadline, confirms process-group
shutdown even after repeated cancellation signals, bounds each output stream and each artifact file to 1 MiB, and hashes
artifact bytes with SHA-256. Artifacts must be regular files in the workspace,
not directories or glob patterns. Successful artifacts remain at their declared
paths on disk. Local mode does not upload them or create an ADO run/status.
Each invocation gets a fresh execution ID, including repeated local runs and ADO
job attempts; this direct runner does not provide durable replay/idempotency.

## Run the actual ADO pipeline on your machine

1. Create a dedicated Azure DevOps self-hosted agent pool named `hobo-local` (or
   change `pool`). Register Microsoft's Linux agent on your machine and keep it
   online. Registration/authentication is an operator setup step, outside HoBo's
   JSON config. Authorize the pipeline to use that pool. Use a dedicated agent
   workspace and only trusted repository code; a self-hosted agent executes code
   with the machine user's access. The YAML cleans the agent workspace.
2. Generate and commit a pipeline definition from the same configuration:

   ```sh
   node packages/ci-ado/dist/cli.js yaml packages/ci-ado/examples/ci.json . > azure-pipelines.yml
   ```

3. Create an ADO pipeline pointing to that YAML and queue it manually. Configure
   triggers or Azure Repos branch build-validation policies explicitly as needed.
   The generated example disables automatic triggers. With the agent offline,
   the job queues in its configured pool; there is no hosted fallback.

The generated YAML bootstraps this HoBo monorepo with a frozen install and a
scoped Turbo build, then calls the same local CLI in `Build.SourcesDirectory`.
Its job timeout adds ten minutes for bootstrap and publication to the command
plan's timeout. Regenerate after changing the config, timeout or artifact list.
`examples/azure-pipelines.yml` is the approved deterministic rendering fixture.

After successful checks, `PublishPipelineArtifact@1` uploads each declared file
as `<artifactPrefix>-<1-based index>` on the original ADO run. Downstream jobs can
use `DownloadPipelineArtifact@2` or `download: current` with those artifact names.
Missing/oversized artifacts fail the checks before publication. Publication is a
separate ADO task and can itself fail the job. Failed/cancelled checks publish no
artifacts, matching the shared portable runtime. ADO publishes from the original
file path after collection; the local hash does not attest those later uploaded
bytes. Pipeline retention controls artifact lifetime.

## Costs and supported boundary

Vendor documentation checked 2026-10-29:

- [Self-hosted parallel jobs](https://learn.microsoft.com/en-us/azure/devops/pipelines/licensing/concurrent-jobs?view=azure-devops): private projects include one self-hosted parallel job, with unlimited minutes, plus entitlements for eligible Visual Studio Enterprise subscribers. Additional concurrent jobs can require paid capacity. Verify your organization's actual entitlement.
- [Pipeline Artifacts](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/pipeline-artifacts?view=azure-devops): Pipeline Artifacts and Pipeline Caching are exempt from storage billing. Azure Artifacts package feeds are a different service.
- [Self-hosted agents](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/linux-agent?view=azure-devops): use Microsoft's official agent for real Azure Pipelines execution.

Using your machine avoids Microsoft-hosted compute minutes. It does not erase
hardware, electricity, network, extra parallel-job or other service costs. Pure
local preflight consumes no ADO parallel job. A real ADO run requires connectivity
to Azure DevOps even though the checks execute on your machine.

This package supports Linux self-hosted Azure DevOps **Services** pipelines and
a portable command subset for offline preflight. It does not interpret arbitrary
Azure YAML, tasks, templates, variable groups, service connections, matrices,
approvals or deployment jobs offline. Existing arbitrary ADO YAML should keep
using the official self-hosted agent. Azure DevOps Server needs Build Artifacts
instead of the Pipeline Artifact task and is outside this initial package.
No agent installation, remote pipeline registration, or account budget routing
is performed. The existing scheduler offer/config vocabulary remains unchanged;
`createAdoBackend({workspace})` is a direct, explicitly bound execution adapter.

## Contracts and verification

Parse, don't validate: the parser produces derived types at the boundary.
`parseAdoProject` derives a frozen `ParsedAdoProject` from generated Protobuf
records. CUE and valid/invalid fixtures pin config constraints; strict runtime
parsing also rejects duplicate/conflicting OS demands. `parsePipeline` owns the
shared command plan boundary. TypeScript build/typecheck, schema-tools codegen
and drift checks, real local command tests, a YAML approval fixture, and the
hand-authored consumer Pact cover this package. The Pact exercises generated YAML
expectations, not a provider-verified ADO service interaction. Live ADO assignment,
upload/download and billing have not been exercised by the offline lane.

This direct adapter emits no new durable commands/events. `PipelineScheduler`
continues to own `ci.*` command/event actor coordination, the event store,
materialized projections, snapshot and read store persistence for its supported routed backends. Running
this CLI bypasses that scheduler and has no budget/lease journal side effects.

```sh
corepack pnpm --filter @hobo/ci-ado build
corepack pnpm --filter @hobo/ci-ado typecheck
corepack pnpm --filter @hobo/ci-ado test
corepack pnpm codegen --filter packages/ci-ado
corepack pnpm codegen:check --filter packages/ci-ado
```
