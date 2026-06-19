# Plan 1 — Monorepo & package architecture

> Part of the [HoBo Design Plan Suite](./README.md).

**Tooling:** pnpm workspaces + Turborepo; TypeScript (strict, `nodenext`); `tsup`/`unbuild` for builds; Vitest; Biome; Changesets for versioned publishing.

## Packages (initial layout)
```
packages/
  core/            @hobo/core         types, port interfaces, Hobo Code schema, DI/container
  sdk/             @hobo/sdk          bindle(), resource builders (web/service/database/queue/...)
  runtime/         @hobo/runtime      actors/grains, workflow/step, sagas, agent(), ctx
  cli/             @hobo/cli          hobo dev|deploy|inspect|login|registry
  worlds/
    world-local        @hobo/world-local       (built-in engine; filesystem/sqlite)
    world-postgres     @hobo/world-postgres
    world-temporal     @hobo/world-temporal
    world-restate      @hobo/world-restate
    world-cloudflare   @hobo/world-cloudflare  (Durable Objects)
  providers/
    provider-aws       @hobo/provider-aws
    provider-azure     @hobo/provider-azure
    provider-gcp       @hobo/provider-gcp
    provider-cloudflare/-fly/-kubernetes ...
  iac/
    iac-pulumi         @hobo/iac-pulumi        (Automation API — primary)
    iac-cdktf / iac-crossplane / iac-opentofu
  build/
    build-dagger       @hobo/build-dagger
    build-packer / build-firecracker / build-vagrant
  cloud/             @hobo/cloud        The Yard (control plane), itself a bindle
  registry/          @hobo/registry     Provider/Hobo Code catalog service
  identity/          @hobo/identity     SVID issuance, OIDC provider, token broker
  mcp/               @hobo/mcp          MCP server exposing HoBo to agents
  conformance/       @hobo/conformance  port contract test suites (shared by all adapters)
examples/
  hello-bindle/ multi-cloud-shop/ durable-agent/ self-host-yard/
```

## Iteration hooks
- Package boundaries.
- Whether `runtime` and `sdk` merge.
- Build tooling choices.
