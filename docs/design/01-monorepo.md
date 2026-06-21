# Plan 1 — Monorepo & package architecture

> Part of the [HoBo Design Plan Suite](./README.md).

**Tooling:** pnpm workspaces + Turborepo; TypeScript (strict, `nodenext`); `tsup`/`unbuild` for builds; Vitest; Biome; Changesets for versioned publishing.

## Layering & dependency rule
Packages are layered; dependencies point **inward only** (`apps → adapters → sdk/runtime → core`). `@hobo/core` depends on nothing HoBo. This keeps adapters swappable and prevents the "agnostic" core from leaking provider details.
```
core  ←  sdk, runtime  ←  worlds/*, providers/*, iac/*, build/*  ←  cli, cloud, mcp, registry, identity
                          (all adapters depend only on core's port interfaces)
```

## Packages (initial layout)
```
packages/
  core/            @hobo/core         types, port interfaces, Hobo Code schema, event envelope, DI/container
  wit/             @hobo/wit          WIT worlds (wasi:* reuse + hobo:* ports) + generated TS bindings  [Plan 20]
  sdk/             @hobo/sdk          IfC resources (api/kv/bucket/queue/topic/secret/sql/...) + .allow(); bindle() (advanced)  [Plan 21]
  runtime/         @hobo/runtime      actors/grains, workflow/step, sagas, agent(), stubs, ctx
  componentize/    @hobo/componentize component build via jco + per-language toolchains -> OCI artifacts  [Plan 20]
  cli/             @hobo/cli          hobo dev|deploy|plan|inspect|login|registry|yard|forge
  worlds/
    world-local        @hobo/world-local       (built-in engine; sqlite/filesystem)
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
    build-wasm         @hobo/build-wasm        (jco/cargo-component/TinyGo/... -> wasm component, OCI artifact)
    build-dagger       @hobo/build-dagger      (container fallback images)
    build-packer / build-firecracker / build-vagrant
  cloud/             @hobo/cloud        The Yard (control plane), itself a Bindle
  registry/          @hobo/registry     Provider/Hobo Code catalog service
  identity/          @hobo/identity     SVID issuance, OIDC provider, token broker
  mcp/               @hobo/mcp          MCP server exposing HoBo to agents
  conformance/       @hobo/conformance  port contract test suites (shared by all adapters)
  contracts/         @hobo/contracts    HoBo Contract IR + compatibility/can-deploy engine (built-in)  [Plan 29]
  policy/            @hobo/policy        policy decision model + built-in TypeScript engine            [Plan 30]
  evals/             @hobo/evals         rubrics + promotion gates for semantic functions             [Plan 23]
  training/          @hobo/training      training-engine port + built-in OPTO optimizer + OpenInference capture (INTERNAL; not on the SDK surface)  [Plan 23]
    provider-pact             @hobo/provider-pact             (optional) Pact/Broker adapter behind contract-engine
    provider-opa              @hobo/provider-opa              (optional) OPA/Rego adapter behind policy-engine
    provider-cedar            @hobo/provider-cedar            (optional) Cedar adapter behind policy-engine
    provider-agent-lightning  @hobo/provider-agent-lightning  (optional, INTERNAL) Microsoft Agent Lightning behind training-engine
    provider-trace            @hobo/provider-trace            (optional, INTERNAL) Microsoft Trace (OPTO) behind training-engine
examples/
  hello-bindle/ multi-cloud-shop/ durable-agent/ self-host-yard/
```

## Conventions
- **Ports live in `core`**, implementations in adapter packages; adapters never import each other.
- **Every adapter runs `@hobo/conformance`** for the ports it claims, in CI ([Plan 9](./09-verification-open-questions.md)).
- **Examples are tests** — `examples/*` double as E2E fixtures.
- **Public type surface is the contract** — provider option types are exported for `.with(...)` autocomplete ([Plan 2](./02-sdk-api.md)).

## Iteration hooks
- Package boundaries; whether `runtime` and `sdk` merge.
- Build tooling (tsup vs unbuild vs tsc project refs).
- Versioning policy: lockstep vs independent semver per package.
