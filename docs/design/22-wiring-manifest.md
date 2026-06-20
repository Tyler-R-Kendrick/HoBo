# Plan 22 — Wiring, config & the manifest IR (Aspire model)

> Part of the [HoBo Design Plan Suite](./README.md). Adopts **.NET Aspire's** wiring/config model: `WithReference`-style bindings, uniform config for any component/container, annotations as extensibility, and a **manifest** as the deployment IR — produced by IfC resource-collection ([Plan 21](./21-resources-catalog.md)) and consumed by the Planner ([Plan 4](./04-control-plane.md)).

## Wiring: `bind` = reference (lazy, convention-based)
HoBo `bind` adopts Aspire `.WithReference()` semantics:
- Declaring `bind: { db }` (or referencing a resource inside a handler) records a **dependency edge** (drives the DAG + link), and **injects connection info/endpoints** into the consumer.
- **Lazy resolution** (Aspire's `ReferenceExpression`): references resolve at deploy/runtime, so the *same component* runs locally and on any provider with no code change.
- **Convention:** endpoints/connection info are injected with predictable keys (Aspire uses `services__<name>__<endpoint>__<i>` and `ConnectionStrings__<name>`); HoBo exposes them as a typed `ctx.bindings.<name>` client generated from the resource's WIT port, with the raw env convention available underneath for non-wasm/container fallback.

```ts
const db  = sql("db");
const api = service("api", { bind: { db } });   // api gets a typed db client; edge + link recorded
// container/component fallback receives ConnectionStrings__db / services__db__... env vars
```

## Config for any component *or* container (uniform)
Adopt Aspire's `AddContainer` surface, applied identically to wasm components and OCI containers (wasm-on-OCI is just another image):
- **Endpoints:** `withHttpEndpoint(port, targetPort, name)`, `withEndpoint({ scheme, port, targetPort, external, protocol })`.
- **Env / args:** `withEnvironment(k, v)`, `withArgs(...)` (values may be lazy references).
- **Storage:** `withBindMount(src, dst, readOnly?)`, `withVolume(name, dst)`.
- **Lifecycle:** `withLifetime("persistent")`, `withExplicitStartup()`, `waitFor(dep)`, `waitForCompletion(job)`.
- **Health:** `withHttpHealthCheck(path)` / `withHealthCheck()` — feeds rollout gates ([Plan 5](./05-reliability-ha.md)).
```ts
container("legacy-gpu", "ghcr.io/acme/cuda-job:1.2")     // OCI fallback workload
  .withEndpoint({ port: 8080, scheme: "http" })
  .withEnvironment("MODEL", "yolo")
  .withVolume("models", "/models")
  .withHttpHealthCheck("/healthz");
```

## Annotations = typed extensibility (`.with(...)`)
Aspire attaches behavior via resource **annotations** consumed by deploy tools. HoBo's existing provider-specific options pattern **is** this: `.with(provider.options())` adds typed annotations that the resolved Provider/IaC adapter consumes; non-resolved providers' annotations are inert ([Plan 2](./02-sdk-api.md)). New first-party annotations (health, lifetime, replicas, scaling, residency) are typed and provider-neutral.

## The manifest IR (deployment intermediate representation)
Resource-collection ([Plan 21](./21-resources-catalog.md)) emits a **HoBo manifest** — the union of Nitric's resource spec and Aspire's `aspire-manifest.json`. It is the single artifact the Planner/Orchestrator consume and that publishers/IaC adapters render to real infra. Sketch:
```jsonc
{
  "schema": "hobo.manifest/v1",
  "resources": {
    "db":  { "type": "sql.v1", "port": "wasi:sql", "allow": ["query"],
             "connectionString": "{db.connectionString}" },
    "api": { "type": "component.v1", "image": "oci://.../api@sha256:…", "runtime": "wasm",
             "exports": ["wasi:http/incoming-handler"],
             "links": [ { "import": "wasi:sql", "to": "db" } ],
             "endpoints": { "http": { "scheme": "http", "targetPort": 8080, "external": true } },
             "env": { "ConnectionStrings__db": "{db.connectionString}" },
             "annotations": { "scaling": { "min": 1, "max": 10 }, "with": { "aws.fargate": { "cpu": 512 } } } },
    "site":{ "type": "website.v1", "bind": ["api"] }
  }
}
```
- **Tokens** like `{db.connectionString}` are lazy references resolved at deploy (Aspire pattern).
- **`links`** are the wasm capability bindings ([Plan 20](./20-wasm-wasi-runtime.md)); **`allow`** mirrors the permission model ([Plan 21](./21-resources-catalog.md)).
- The manifest is **content-addressed and event-sourced** (`deployment.Planned` carries it), so it's auditable/replayable ([Plan 11](./11-event-model.md)).

## Publishers (deploy targets)
Like Aspire publishers / `azd`, the manifest is rendered by pluggable backends: the default **Pulumi Automation API** adapter ([Plan 3](./03-providers-iac.md)), plus Crossplane (k8s), and container/wasm-host targets (SpinKube/containerd-wasm, wasmCloud lattice). The manifest decouples *what to deploy* from *how*.

## Iteration hooks
- Exact manifest schema + how close to Aspire's `aspire-manifest.json` to stay (interop?).
- Env-injection convention for the container/wasm-host fallback (reuse Aspire's `services__…`?).
- Which annotations are first-party/provider-neutral vs `.with(...)` provider-specific.
- Whether HoBo can *import* an Aspire manifest as one input format.
