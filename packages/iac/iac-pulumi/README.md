# @hobo/iac-pulumi

Production Infrastructure-as-Code backend for HoBo built on the Pulumi Automation
API. S2-05 promotes the near-production draft proof
(`src/draft/technical-proofs/s2-06-iac-pulumi-automation-adapter/`) into
`packages/iac/iac-pulumi/`.

The adapter satisfies the `IacProvider` port with a per-resource stack model:
each resource in an `IacProgram` gets its own Pulumi stack
(`deploymentId/resourceName`) so blast radius stays isolated. It guards against
preview/apply divergence, reports drift, holds per-stack locks, and resolves
`${resources.X.outputs.Y}` references into bindings.

## Offline engine

The default backend is a deterministic in-memory Automation engine so the package
builds and tests without the Pulumi CLI. `createPulumiAutomationAdapter({ engine })`
takes any engine speaking the same preview/apply/refresh/destroy shape, so a real
Pulumi Automation API engine — pinned to `PINNED_PULUMI_AUTOMATION_VERSION`
(`3.130.0`) — drops in behind the same interface later (see the `ponytail:` notes
in `src/iac-pulumi-automation-adapter.ts`).

## Exports

- `createPulumiAutomationAdapter` — the `IacProvider` adapter.
- `runIacBackendConformance` — the `@hobo/conformance/iac-backend` suite
  (`preview-diff / apply-outputs / binding-outputs / refresh-clean / destroy-clean`).
- `validateIacProgram`, `createTrivialIacProgram`, `createPerResourceStackKey`,
  `outputsToBindings`, `createInMemoryAutomationEngine`, `createInMemoryStateBackend`,
  `createStateBackendConfig`, `IAC_PULUMI_PORT`.

## Verification

```sh
pnpm --filter @hobo/iac-pulumi build
pnpm --filter @hobo/iac-pulumi test
pnpm --filter @hobo/iac-pulumi test:contract:consumer
```
