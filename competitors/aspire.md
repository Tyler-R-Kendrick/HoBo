# Aspire — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026). The most detailed capture in this folder. The HoBo↔Aspire parity tracker is in [`hobo-mapping.md`](#hobo-mapping).
>
> Files: [apphost-resource-model.md](#apphost-resource-model) · [integrations-catalog.md](#integrations-catalog) · [wiring-endpoints.md](#wiring-endpoints) · [manifest-publishers-deploy.md](#manifest-publishers-deploy) · [cli.md](#cli) · [dashboard-dcp-observability.md](#dashboard-dcp-observability) · [testing-polyglot-ai.md](#testing-polyglot-ai) · [differentiators.md](#differentiators) · [hobo-mapping.md](#hobo-mapping)

## What it is
**Aspire** (originally **.NET Aspire**; Microsoft dropped the ".NET" prefix in the **2025 polyglot rebrand** → **aspire.dev**) is a **code-first, opinionated application-composition & orchestration framework**. You describe your distributed app's topology — services, containers, databases, queues, and how they wire together — in a single **AppHost** program (C#, with a TypeScript AppHost also emerging); Aspire runs the whole graph locally with one command, gives you an integrated **OpenTelemetry dashboard**, and can **publish/deploy** the same graph to real targets (Azure Container Apps, Docker Compose, Kubernetes).

- **Positioning:** "your stack, streamlined" — *infrastructure described in code, local-dev parity, observable by default*.
- **License / model:** **MIT, fully open source**; **no SaaS** — it's a tool you run locally and deploy from, not a hosted control plane.
- **Repo / docs:** `github.com/dotnet/aspire` · `aspire.dev` (legacy docs at learn.microsoft.com/dotnet/aspire).

## The mental model (AppHost-centric)
```
AppHost program (C#/TS)            ── you write this
  builder.AddPostgres("db").AddDatabase("app")
  builder.AddProject<Projects.Api>("api").WithReference(db).WaitFor(db)
        │  builder.Build().Run()
        ▼
DCP (Developer Control Plane, Go)  ── local k8s-style orchestrator: containers + processes
        │  OTLP
        ▼
Aspire Dashboard                   ── logs · traces · metrics · resource graph
        │  aspire publish / deploy
        ▼
aspire-manifest.json → publishers  ── azd→ACA · Docker Compose · Kubernetes/Helm · custom
```
Single source of truth = the **AppHost**. The same description drives local run, the dashboard, and deployment.

## At a glance
| Dimension | Aspire |
|---|---|
| Category | Code-first app composition + local orchestration + deploy |
| Author surface | **AppHost** (C#; TypeScript emerging) |
| Local orchestrator | **DCP** (Go, Kubernetes-style) |
| Observability | **OpenTelemetry** (logs/traces/metrics) + bundled **Dashboard** |
| Deploy IR | **`aspire-manifest.json`** → publishers |
| Deploy targets | Azure Container Apps (azd+Bicep), Docker Compose, Kubernetes/Helm, custom |
| CLI | standalone **`aspire`** (`new`/`run`/`add`/`publish`/`deploy`/…) |
| Languages | C#/.NET first; **Python, Node/JS** first-class (2025); Go/Java/Rust via Community Toolkit |
| License / hosting | **MIT**, self-hosted; no SaaS |

## Where it sits vs the others in this folder
- **vs Humanitec** ([../humanitec](humanitec.md)): Aspire is dev-to-deploy *tooling* (no platform-rules/matching, no RBAC/policy/cost, no hosted control plane); Humanitec is an enterprise **Platform Orchestrator**.
- **vs Nitric** ([../nitric](nitric.md)): both are infrastructure-from-code, but Nitric targets serverless with a Go-based plugin runtime; Aspire is broader app composition + local-dev parity + OTel, .NET-rooted.

## Known gaps (opportunities for HoBo) — see [differentiators.md](#differentiators)
- **Deployment maturity** lags the local-dev experience; production typically still leans on `azd`/`kubectl`.
- **Not a full IDP** — no Resource-Definition/matching layer, no RBAC/policy/cost/multi-tenant model.
- **.NET heritage** despite the polyglot rebrand; ecosystem is still .NET-heavy.
- **Container-/process-centric**; dashboard is **dev-time**, not a production control plane.
- No event-sourced replay/audit; no agent-native generation.

See [hobo-mapping.md](#hobo-mapping) for HoBo's response to each.

## apphost-resource-model

**Aspire — AppHost & Resource Model**

> Part of the [Aspire competitor reference](aspire.md). The core composition model: the builder, the resource interfaces, resource types, annotations, lifecycle/eventing, custom resources, health checks, parameters/secrets, persistence. C# shown as quoted/illustrative excerpts (see the [fair-use note](README.md#sources--fair-use)).

### AppHost & the builder
The **AppHost** is a normal program whose job is to declare the app graph and run it.
```csharp
var builder = DistributedApplication.CreateBuilder(args);

var db  = builder.AddPostgres("postgres").AddDatabase("appdata");
var api = builder.AddProject<Projects.MyApi>("api")
                 .WithReference(db)
                 .WaitFor(db);
builder.AddNpmApp("web", "../web", "dev")
       .WithReference(api)
       .WithHttpEndpoint(env: "PORT");

builder.Build().Run();   // or await builder.Build().RunAsync();
```
- `DistributedApplication.CreateBuilder(string[] args)` (also no-arg and `(DistributedApplicationOptions)` overloads) → `IDistributedApplicationBuilder` (exposes `.Services` for DI and `.Eventing` for lifecycle).
- `builder.Build()` → `DistributedApplication` (`IHost`, `IAsyncDisposable`); `.Run()`/`.RunAsync()`.
- Project layout: a `*.AppHost` project (references the `Aspire.AppHost.Sdk` + project references to everything it orchestrates) plus a shared **ServiceDefaults** project (OTel + service discovery + resilience + health-check wiring). The single-file `apphost.cs` direction (run via the `aspire` CLI without a full project) is emerging.

### The resource model
Everything in the graph implements **`IResource`**, accessed through an **`IResourceBuilder<T>`** (fluent). Capabilities are expressed as **marker/capability interfaces** a resource type opts into:

| Interface | Grants |
|---|---|
| `IResourceWithEnvironment` | `WithEnvironment(...)` |
| `IResourceWithEndpoints` | `WithEndpoint`/`WithHttpEndpoint`/`GetEndpoint(name)` |
| `IResourceWithConnectionString` | exposes `ConnectionStringExpression` for `WithReference` |
| `IResourceWithServiceDiscovery` | injects discoverable endpoints into dependents |
| `IResourceWithArgs` | `WithArgs(...)` |
| `IResourceWithWaitSupport` | `WaitFor`/`WaitForStart`/`WaitForCompletion` |
| `IComputeResource` | a deployable compute unit (replicas, compute environment) |
| `IResourceWithContainerFiles` / `IResourceWithDockerfile` | contribute files / build from a Dockerfile |

#### Resource types
- **`ProjectResource`** — a .NET project: `builder.AddProject<Projects.MyApi>("api")` (typed via generated `Projects.*`).
- **`ContainerResource`** — `builder.AddContainer("cache", "redis:7")`.
- **`ExecutableResource`** — `builder.AddExecutable("tool", "./tool", workingDir, args…)`.
- **`ParameterResource`** — `builder.AddParameter("api-key")` / `AddParameter("pw", secret: true)`.
- **`ConnectionStringResource`** — `builder.AddConnectionString("external-db")` (BYO connection string, no resource provisioned).
- **`ExternalServiceResource`** — references an external URL.
- **Dockerfile resource** — `builder.AddDockerfile("svc", "../svc")` (build instead of pull).
- **Database resources** — returned by `.AddDatabase("name")` on a server resource (`PostgresDatabaseResource`, `SqlServerDatabaseResource`, …).

### Annotations — the extensibility substrate
Resource configuration is stored as **annotations**: each `With*` call attaches an `IResourceAnnotation` to `resource.Annotations`. Built-ins include `EndpointAnnotation`, `EnvironmentCallbackAnnotation` (lazy/deferred env), `ContainerMountAnnotation`, `ArgsAnnotation`, `HealthCheckAnnotation`, `WaitAnnotation`, `ReplicaAnnotation`, and `ManifestPublishingCallbackAnnotation` (controls what the manifest emits). You query them:
```csharp
var endpoints = api.Resource.Annotations.OfType<EndpointAnnotation>().ToList();
```

### Custom resources & integrations
A custom integration = a resource subclass + an `Add*` extension + optional `With*` annotation helpers:
```csharp
public sealed class LlmResource(string name) : Resource(name)
{ public string? Model { get; set; } }

public static class LlmResourceExtensions
{
    public static IResourceBuilder<LlmResource> AddLlm(this IDistributedApplicationBuilder b, string name)
        => b.AddResource(new LlmResource(name))
            .WithHttpEndpoint(targetPort: 8000, name: "http")
            .WithEnvironment("MODEL", "default");

    public static IResourceBuilder<LlmResource> WithModel(this IResourceBuilder<LlmResource> b, string m)
    { b.Resource.Model = m; return b.WithEnvironment("MODEL", m); }
}
// usage: builder.AddLlm("local").WithModel("mistral-7b");
```

### Lifecycle & eventing
```csharp
builder.Eventing.Subscribe<BeforeStartEvent>((evt, ct) => { /* mutate model */ return Task.CompletedTask; });
builder.Eventing.Subscribe<ResourceReadyEvent>((evt, ct) => { /* react when a resource is ready */ return Task.CompletedTask; });
```
Also `IDistributedApplicationLifecycleHook` for cross-cutting hooks. Events fire as resources transition (created → starting → running/ready).

### Health checks (gate dependencies)
```csharp
builder.AddProject<Projects.Api>("api").WithHttpHealthCheck("/health");      // GET /health → 200
builder.AddPostgres("pg").WithHealthCheck("custom-check");                    // DI-registered check
```
`WaitFor(x)` blocks a dependent until `x` is **running and all its health checks pass** (see [wiring-endpoints.md](#wiring-endpoints)).

### Parameters & secrets
```csharp
var pw = builder.AddParameter("db-password", secret: true);   // prompted; masked
builder.AddSqlServer("sql").WithPassword(pw);
var ext = builder.AddConnectionString("legacy-db");           // BYO connection string
```
Non-secret params show as text, secret params as password inputs; values flow in as env vars / connection strings. Binds to user-secrets/appsettings via the standard config system.

### Persistence
```csharp
builder.AddPostgres("pg").WithDataVolume();                          // named volume
builder.AddContainer("app", "img").WithBindMount("./cfg", "/cfg", isReadOnly: true);
builder.AddContainer("app", "img").WithVolume("data", "/data");
builder.AddPostgres("pg").WithLifetime(ContainerLifetime.Persistent); // survive restarts (vs Ephemeral default)
```

## cli

**Aspire — The `aspire` CLI**

> Part of the [Aspire competitor reference](aspire.md). The standalone command-line tool (distinct from `dotnet`), part of Aspire's move toward a language-agnostic, single-file-AppHost experience.

### Install
```bash
dotnet tool install -g aspire.cli      # or the installer at aspire.dev
aspire --version
```

### Project lifecycle
```bash
aspire new                 # scaffold a new Aspire solution (interactive; templates)
aspire init                # add Aspire to an existing repo (detects sln or file-based AppHost)
aspire add redis           # add a hosting integration package (e.g. Aspire.Hosting.Redis)
aspire add azure-cosmos-db
aspire update              # safely upgrade Aspire packages in the AppHost
```

### Run & inspect (local dev)
```bash
aspire run                 # find & run the AppHost; launches the dashboard
aspire run --no-dashboard
aspire run --project ./src/AppHost
aspire logs [resource] [--follow]   # stream resource logs
aspire exec <command>               # run a resource command (e.g. migrations)
```

### Publish & deploy
```bash
aspire publish [--publisher docker-compose|kubernetes] [--output-path ./dist]
aspire deploy [--refresh]
```
(See [manifest-publishers-deploy.md](#manifest-publishers-deploy) for what each publisher emits.)

### Config & secrets
```bash
aspire config list
aspire config set <key> <value>     # CLI/feature settings
aspire secret set ConnectionStrings__Db "..."   # user-secret management
```

### Direction
The CLI underpins the **single-file `apphost.cs`** experience (run an AppHost without a full project), the **TypeScript AppHost**, and **MCP/agent** entry points — part of repositioning Aspire from "a .NET feature" to "a polyglot orchestration tool you drive from the terminal." Exact command surface and flags evolve release-to-release; the groups above are the stable shape.

## dashboard-dcp-observability

**Aspire — Dashboard, DCP & Observability**

> Part of the [Aspire competitor reference](aspire.md). The runtime/visibility layer — a major part of Aspire's appeal and a reference point for [HoBo Plan 7](../docs/design/developer-experience.md#plan-07)/[Plan 14](../docs/design/reliability-observability-cost.md#plan-14).

### DCP — the Developer Control Plane
**DCP** is Aspire's **local orchestrator**, written in **Go**, that the AppHost drives when you `aspire run`:
- Manages the lifecycle of **containers**, **.NET projects**, and **executables/processes** as a unit.
- Provides a **Kubernetes-style local API** (pods/services/configmaps analogues) — but it is *not* Kubernetes and requires none.
- Handles a **bridge network + DNS** so resources reach each other by name (`http://api`, `postgres:5432`) and containers can tunnel to host processes; plus health-probe execution and restarts.
```
AppHost (C#/TS)  ──►  DCP API (Go, localhost)  ──►  containers + processes
       └────────────────────────────────────────►  Dashboard (OTLP)
```

### The Aspire Dashboard
A web UI bundled with `aspire run`:
- **Resources** — list + **dependency graph**, status, endpoints, environment variables, connection strings (with **sensitive-value masking**), and **start/stop/restart** controls.
- **Console logs** — raw stdout/stderr per resource.
- **Structured logs / Traces / Metrics** — via **OpenTelemetry (OTLP)**: searchable structured logs, distributed traces with spans, and metrics with percentiles.
- **Interactive parameters** — prompts for missing parameters before start.
- **AI assist** — when launched from VS / VS Code, **GitHub Copilot** can summarize logs and help root-cause across logs/traces/metrics.

### Standalone dashboard (any language)
The dashboard ships as a container and works as a **generic OTLP sink** for *any* stack — no Aspire app required:
```bash
docker run --rm -it -p 18888:18888 -p 4317:18889 \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
# point any OTEL_EXPORTER_OTLP_ENDPOINT at it (gRPC 4317 / HTTP 18889)
```
This is a common reason non-.NET teams adopt Aspire's dashboard on its own.

### OpenTelemetry by default
The **ServiceDefaults** project wires OTel logging/metrics/tracing, service discovery, and standard resilience into every .NET service; non-.NET services participate by exporting OTLP (Python/Node/Go SDKs). Telemetry is **dev-time first** — for production you still point OTel at Grafana/Datadog/etc. (the bundled dashboard is not a production monitoring system).

## integrations-catalog

**Aspire — Integration Catalog**

> Part of the [Aspire competitor reference](aspire.md). The breadth of `Add*` integrations. Names are stable API surface; some live in the core `Aspire.Hosting.*` packages, some in Azure/AWS packages, some in the **Community Toolkit**.

### Hosting vs client integrations (two halves)
Aspire ships integrations in **pairs**:
- **Hosting integration** (used in the AppHost): `builder.AddRedis("cache")` — declares/runs the resource and wires references.
- **Client integration** (used inside a service): `builder.AddRedisClient("cache")` — registers a typed, health-checked, OTel-instrumented client bound to the injected connection string/endpoint.
This doc focuses on the **hosting** side; nearly every data/messaging integration has a matching client package.

### Compute & runtimes
```csharp
builder.AddProject<Projects.Api>("api");           // .NET project
builder.AddContainer("nginx", "nginx:latest");     // any OCI image
builder.AddExecutable("tool", "./tool", ".", "--flag");
builder.AddDockerfile("svc", "../svc");            // build from Dockerfile
builder.AddNodeApp("api", "../api", "server.js");  // Node entrypoint
builder.AddNpmApp("web", "../web", "dev");         // npm/yarn/pnpm script
builder.AddPythonApp("worker", "../worker", "main.py");  // Python (uv/pip/venv)
builder.AddAzureFunctionsProject<Projects.Fn>("fn");
```
(MAUI, Orleans, IIS-Express/.NET-Framework projects, and SQL Server DB projects (`AddSqlProject`) also exist.)

### Relational databases
```csharp
builder.AddPostgres("pg").AddDatabase("appdata");
builder.AddSqlServer("sql").AddDatabase("appdata");
builder.AddMySql("mysql").AddDatabase("appdata");
builder.AddAzurePostgresFlexibleServer("pg");   // .RunAsContainer() for local
builder.AddAzureSqlServer("sql").AddDatabase("appdata");
```

### NoSQL / document / cache
```csharp
builder.AddMongoDB("mongo").AddDatabase("appdata");
builder.AddAzureCosmosDB("cosmos");
builder.AddRedis("cache").WithDataVolume();
builder.AddValkey("cache");      // Redis-compatible
builder.AddGarnet("cache");      // Microsoft's Redis-compatible store
```

### Messaging & streaming
```csharp
builder.AddRabbitMQ("rmq").WithManagementPlugin();
builder.AddKafka("kafka");
builder.AddNats("nats");
builder.AddAzureServiceBus("sb");
builder.AddAzureEventHubs("eh");
```

### Search & vector
```csharp
builder.AddElasticsearch("es");
builder.AddOpenSearch("os");
builder.AddQdrant("qdrant");     // vector DB
builder.AddMilvus("milvus");     // vector DB
```

### Identity, config & secrets
```csharp
builder.AddKeycloak("kc").WithRealmImport("./realm.json").WithDataVolume();
builder.AddAzureKeyVault("kv");
builder.AddAzureAppConfiguration("appcfg");
```

### Observability
```csharp
builder.AddSeq("seq");                 // structured-log server
builder.AddAzureApplicationInsights("ai");
```
(All resources emit OpenTelemetry to the bundled dashboard by default — see [dashboard-dcp-observability.md](#dashboard-dcp-observability).)

### AI / LLM
```csharp
builder.AddAzureOpenAI("openai").AddDeployment("gpt-4o", "gpt-4o", "2024-08-06");
builder.AddGitHubModel("ai", "openai/gpt-4o-mini");   // GitHub Models (newer)
builder.AddOllama("ollama").AddModel("llama3");        // local LLMs (Community Toolkit)
```

### Azure & AWS
Beyond those above: `AddAzureStorage` (+ `AddBlobs`/`AddQueues`/`AddTables`), `AddAzureSignalR`, `AddAzureWebPubSub`, `AddAzureContainerAppEnvironment` (deploy target). AWS support is provided via `Aspire.Hosting.AWS` (CloudFormation/CDK provisioning + resource references). Many Azure resources can `.RunAsContainer()`/emulator locally and provision the real service on deploy.

### Community Toolkit
`github.com/CommunityToolkit/Aspire` adds Go, Java (Spring Boot/Quarkus), Rust, Ollama, Dapr, SQL/Mongo extensions, and more — published to NuGet, community-maintained. This is how non-first-party languages/services become first-class AppHost resources.

## manifest-publishers-deploy

**Aspire — Manifest, Publishers & Deployment**

> Part of the [Aspire competitor reference](aspire.md). The deployment IR and how it reaches real targets. This is HoBo's closest structural analogue ([HoBo Plan 22](../docs/design/authoring-resources-wiring.md#plan-22)).

### The manifest (deployment IR)
`aspire publish` (or the legacy `dotnet run --project AppHost -- --publisher manifest`) emits **`aspire-manifest.json`** — a tool-agnostic description of the resolved graph that deployment tooling consumes.

#### Resource type versions
`project.v1`, `container.v1` (and legacy `container.v0`), `dockerfile.v0`, `parameter.v0`, `value.v0` (computed outputs), `azure.bicep.v0` (an Azure resource defined by a Bicep template). Each entry carries `type`, optional `connectionString`, `env`, `bindings`, `volumes`, and `params`/`outputs` for Bicep.

#### Token expressions
`env` and `connectionString` values reference other resources with `{...}` tokens, resolved by the deploy tool:
- `{resource.connectionString}`
- `{resource.bindings.<endpoint>.host|port|url}`
- `{parameter.value}`

#### Representative manifest
```json
{
  "$schema": "https://json.schemastore.org/aspire-8.0.json",
  "resources": {
    "postgres": {
      "type": "container.v1",
      "image": "postgres:16",
      "env": { "POSTGRES_PASSWORD": "{pg-password.value}", "POSTGRES_DB": "appdata" },
      "bindings": { "tcp": { "scheme": "tcp", "protocol": "tcp", "transport": "tcp", "targetPort": 5432 } },
      "volumes": [ { "source": "pg-data", "target": "/var/lib/postgresql/data", "readOnly": false } ],
      "connectionString": "Host={postgres.bindings.tcp.host};Port={postgres.bindings.tcp.port};Username=postgres;Password={pg-password.value};Database=appdata"
    },
    "api": {
      "type": "project.v1",
      "path": "../MyApp.Api/MyApp.Api.csproj",
      "env": {
        "ConnectionStrings__appdata": "{postgres.connectionString}",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "{otel.url}"
      },
      "bindings": { "http": { "scheme": "http", "protocol": "http", "transport": "http", "targetPort": 8080, "external": true } }
    },
    "pg-password": { "type": "parameter.v0", "value": "{pg-password.inputs.value}", "secret": true }
  }
}
```

### Publishers & compute environments
A **publisher** turns the model into deployment artifacts (and, for `deploy`, applies them) via `IDistributedApplicationPublisher`. You select a target by adding a **compute environment** resource in the AppHost:
```csharp
builder.AddAzureContainerAppEnvironment("cae");    // Azure Container Apps
builder.AddDockerComposeEnvironment("compose");    // Docker Compose
builder.AddKubernetesEnvironment("k8s");           // Kubernetes/Helm
```
Resources can be pinned to an environment (`.WithComputeEnvironment(env)`), enabling mixed targets.

### Deploy targets
- **Azure Container Apps via `azd`** — the **Azure Developer CLI** consumes the manifest, generates **Bicep**, provisions ACA + dependencies, builds/pushes images to ACR, and deploys. The most mature path.
- **Docker Compose** (`Aspire.Hosting.Docker`) — emits `docker-compose.yaml` + `.env` (services, networks, named volumes, `depends_on`); `docker compose up`.
- **Kubernetes / Helm** (`Aspire.Hosting.Kubernetes`) — emits a Helm chart (`Chart.yaml`, `values.yaml`, `templates/`). This supersedes the earlier community **Aspir8 / aspir8** tool that pioneered manifest→Helm.
- **Custom** — implement `IDistributedApplicationPublisher` to emit Terraform/Pulumi/anything and register it in the AppHost.

### Commands
```bash
aspire publish --output-path ./dist           # generate artifacts (manifest + target files)
aspire publish --publisher docker-compose
aspire deploy                                  # publish + apply to the configured target
aspire deploy --refresh                        # refresh credentials first
```
> **Maturity note:** publish/deploy and the compute-environment publishers matured through the 9.x line; many teams still hand off to `azd` (Azure) or `kubectl`/`helm` (K8s) for production. The local-dev experience is more mature than the deploy story.

## testing-polyglot-ai

**Aspire — Testing, Polyglot & AI; Versions & Licensing**

> Part of the [Aspire competitor reference](aspire.md). Integration testing, the polyglot rebrand, AI integrations, the release timeline, and the licensing/deployment model.

### Testing — `Aspire.Hosting.Testing`
Spin up the whole app graph in a test and exercise it end-to-end:
```csharp
using Aspire.Hosting.Testing;

var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.MyAppHost>();
await using var app = await appHost.BuildAsync();
await app.StartAsync();

var http = app.CreateHttpClient("api");
var res  = await http.GetAsync("/health");
Assert.Equal(HttpStatusCode.OK, res.StatusCode);
```
- Launches the AppHost (real DCP, real containers/processes) in-process for the test run; dashboard disabled, ports randomized for parallel runs.
- Access resources via `app.GetResource(name)`, `app.CreateHttpClient(name)`, `WaitFor*` helpers.
- **Limitation:** it's an *integration* harness (real processes) — no built-in mocking/substitution; for pure unit tests use `WebApplicationFactory`/test doubles.

### Polyglot & the rebrand
Microsoft's **2025 rebrand** dropped ".NET" → **"Aspire"** (aspire.dev), repositioning it as language-agnostic:
- **Python** — `AddPythonApp(...)` with **uv**/pip/venv detection; also module/script execution. Good for FastAPI/Flask/Celery.
- **Node / JS** — `AddNodeApp(...)`, `AddNpmApp(...)` (npm/yarn/pnpm), Vite support; a **TypeScript AppHost** is emerging.
- **Go / Java / Rust** — via the **Community Toolkit** (Spring Boot/Quarkus for Java, Cargo for Rust, etc.).
- **How non-.NET apps participate:** as containers/executables/projects in the graph, wired with the same `WithReference`/endpoints, and exporting **OTLP** to the dashboard. The orchestration, wiring, and observability are uniform; the deepest typed ergonomics remain strongest in .NET.

### AI / GenAI
```csharp
builder.AddAzureOpenAI("openai").AddDeployment("gpt-4o", "gpt-4o", "2024-08-06");
builder.AddGitHubModel("ai", "openai/gpt-4o-mini");   // GitHub Models
builder.AddOllama("ollama").AddModel("llama3");        // local (Community Toolkit)
```
Plus **GitHub Copilot in the dashboard** (log summarization / root-cause) when run from VS/VS Code.

### Version timeline
> Anchored on well-established releases; later items are *direction*, not precise dated facts.
- **8.0 — GA, May 2024.** First stable release; the AppHost/integration/dashboard model; service discovery + ServiceDefaults.
- **8.1 / 8.2 (2024).** More integrations; dashboard improvements.
- **9.0 — Nov 2024.** Dropped the workload requirement (SDK reference), `WaitFor`/health-gating, dashboard resource control (start/stop/restart), OTLP/CORS improvements.
- **9.x (2025).** **Publishers + `aspire publish`/`deploy`**, the standalone **`aspire` CLI**, compute environments (ACA/Compose/K8s), interactive parameters, **GitHub Models**, Copilot-in-dashboard.
- **2025 polyglot rebrand.** ".NET Aspire" → **"Aspire"**, aspire.dev, first-class Python/Node, TypeScript AppHost, single-file `apphost.cs` direction. (Specific post-rebrand version numbers/dates vary by source and are not asserted here.)

Support policy: effectively the latest major line is the supported one.

### Licensing & deployment model
- **MIT**, fully open source (`github.com/dotnet/aspire`).
- **No SaaS / no hosted control plane** — runs locally for dev and **publishes/deploys** to infra you own (Azure, Kubernetes, Docker Compose, custom). Manifests are plain JSON → low lock-in.

## wiring-endpoints

**Aspire — Wiring, References & Endpoints**

> Part of the [Aspire competitor reference](aspire.md). How resources discover and connect to each other — the part HoBo borrowed most directly ([HoBo Plan 22](../docs/design/authoring-resources-wiring.md#plan-22)).

### `WithReference` — the core wiring verb
```csharp
var db  = builder.AddPostgres("pg").AddDatabase("appdata");
var api = builder.AddProject<Projects.Api>("api")
                 .WithReference(db)                       // connection string + service discovery
                 .WithReference(cache.GetEndpoint("tcp")); // a specific endpoint
```
`WithReference` injects, by convention, into the dependent's environment:
- **Connection strings:** `ConnectionStrings__{name}` (e.g. `ConnectionStrings__appdata`).
- **Service endpoints:** `services__{name}__{endpointName}__{index}` (0-based; multiple endpoints/replicas → multiple indices), resolved by .NET **service discovery** at runtime.
The consuming service reads these through normal configuration / `HttpClient` + `AddServiceDiscovery()` (set up in ServiceDefaults).

### Direct env, args
```csharp
builder.AddContainer("svc", "img")
       .WithEnvironment("LOG_LEVEL", "debug")
       .WithEnvironment("DB", db)                 // resolves to its connection string
       .WithEnvironment("KEY", apiKeyParameter)   // ParameterResource
       .WithArgs("--port", "8080");
```
`WithEnvironment` also takes a callback (`EnvironmentCallbackAnnotation`) for values computed at run/publish time.

### Reference expressions
- **`ReferenceExpression`** — a deferred, interpolated string mixing literals + resource values (e.g. building a custom connection string from parts).
- **`EndpointReference`** — `resource.GetEndpoint("https")` with `.Url`/`.UriExpression`/`.Host`/`.Port` members usable in `WithEnvironment`. These become `{resource.bindings.https.url}`-style tokens in the manifest ([manifest-publishers-deploy.md](#manifest-publishers-deploy)).

### Endpoints & networking
```csharp
builder.AddProject<Projects.Api>("api")
       .WithHttpEndpoint(targetPort: 8080, port: 5000, name: "http")
       .WithHttpsEndpoint(name: "https")
       .WithExternalHttpEndpoints();              // expose beyond the dev host
builder.AddContainer("svc", "img")
       .WithEndpoint(targetPort: 9000, scheme: "tcp", name: "tcp", isProxied: true);
```
- `targetPort` = port the app listens on (inside the container/process); `port` = host-facing port (auto-assigned if omitted).
- `isProxied: true` (default) routes through Aspire's reverse proxy → stable URLs across restarts + automatic service discovery; `false` = direct container DNS.
- `WithExternalHttpEndpoints()` marks endpoints external (matters at deploy — ingress).
- `WithUrls(...)`/`WithUrlForEndpoint(...)` customize the URLs surfaced in the dashboard.

### Ordering: `WaitFor` family
```csharp
builder.AddProject<Projects.Api>("api")
       .WaitFor(db)              // wait until db is running AND healthy
       .WaitForStart(cache);    // wait until cache is merely running
builder.AddProject<Projects.Worker>("worker")
       .WaitForCompletion(migrations);  // wait until a one-shot task exits 0
```
`WaitFor` is gated by health checks ([apphost-resource-model.md](#apphost-resource-model)); `WaitForCompletion` is for run-to-completion jobs (migrations, seeders).

### Service discovery resolution
`WithReference` + ServiceDefaults' `AddServiceDiscovery()` mean a service calls a dependency by **logical name** (`http://api`), and resolution happens via configuration (`services__*` env), the platform (Container Apps/Kubernetes DNS), or DNS-SRV — the same code works locally and in production.

## differentiators

**Aspire — Differentiators & Gaps**

> Part of the [Aspire competitor reference](aspire.md). Condensed strengths/gaps + head-to-head comparisons.

### Differentiators (what's genuinely strong)
1. **Code-first composition** — the topology (services, deps, wiring) is a typed program (`WithReference`/`WaitFor`/endpoints), not YAML/HCL; refactorable, with IDE support.
2. **Local-dev parity** — one command (`aspire run`) stands up the whole multi-service graph (containers + processes) locally, closely matching the deploy shape.
3. **Integrated observability** — OpenTelemetry (logs/traces/metrics) + a bundled **dashboard** with a resource graph, out of the box; the dashboard also runs **standalone for any language**.
4. **Manifest IR + publishers** — a clean `aspire-manifest.json` → multiple targets (azd→ACA, Docker Compose, Kubernetes/Helm, custom).
5. **Polyglot direction** — first-class Python/Node alongside .NET; Go/Java/Rust via the toolkit; non-.NET apps wired uniformly and observed via OTLP.
6. **Extensible** — custom resources/integrations/publishers via NuGet; rich first-party + Azure/AWS + Community Toolkit catalog.
7. **MIT / no lock-in** — open source, self-hosted, plain-JSON IR; Microsoft-backed with a fast release cadence.

### Gaps (HoBo's openings)
1. **Deployment maturity** lags local dev — production often still leans on `azd`/`kubectl`/`helm`; publishers are newer than the run experience.
2. **Not a platform/IDP** — no platform-rules layer (no Resource-Definition/**matching** per environment), no **RBAC/policy/approvals/cost/multi-tenant**; one AppHost per repo.
3. **.NET heritage** — despite the rebrand, ergonomics and ecosystem skew .NET; the AppHost authoring is C#-first.
4. **Container-/process-centric** — no wasm/component runtime; non-containerized/legacy workloads need `ExecutableResource` glue.
5. **Dev-time dashboard** — not a production monitoring system; no event-sourced replay/time-travel/audit.
6. **No agent-native generation** — no Forge-style AI generation of integrations/definitions; AI shows up as *integrations* + Copilot-in-dashboard, not as a generation pipeline.

### Head-to-head
| vs | Aspire's edge | Their edge |
|---|---|---|
| **Docker Compose** | code-first, OTel, projects-not-just-containers, deploy publishers | dead-simple `up`, ubiquitous |
| **Skaffold / Tilt / Garden** | polyglot code-first, local-dev parity beyond K8s | K8s-native inner loop, mature |
| **Pulumi / Crossplane** | local-dev + observability + app composition | mature, broad IaC / control-plane provisioning |
| **Nitric** ([../nitric](nitric.md)) | broader app composition + OTel + local parity | serverless-first IfC + policy-from-code |
| **Humanitec** ([../humanitec](humanitec.md)) | superb local dev, code-first | enterprise Platform Orchestrator: matching, RBAC, governance, hosted |

### Net for HoBo
Aspire nails the **developer inner loop** — code-first wiring, local parity, a manifest IR, and observability — which is why HoBo adopts its **wiring + manifest model** ([Plan 22](../docs/design/authoring-resources-wiring.md#plan-22)). HoBo then adds what Aspire lacks: a **platform-rules/matching layer** ([Plan 25](../docs/design/platform-engineering.md#plan-25)), a **wasm-first polyglot runtime** ([Plan 20](../docs/design/wasm-runtime-wit.md#plan-20)), **event-sourced replay/audit** ([Plan 11](../docs/design/event-model.md#plan-11)), agent-native **Forge** generation ([Plan 6](../docs/design/ai-native-agent-auth.md#plan-06)), and a hosted, multi-tenant, governed control plane. See [hobo-mapping.md](#hobo-mapping).

## hobo-mapping

**Aspire → HoBo parity & mapping tracker**

> For every Aspire feature, the HoBo equivalent and the design doc that owns it. ✅ = designed at parity · ➕ = HoBo goes further · 🔜 = planned. HoBo design lives in [`../../docs/design/`](../docs/design/README.md). Aspire directly inspired HoBo's wiring/manifest layer, so parity here is high by design.

### Composition & wiring
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| AppHost (`DistributedApplication.CreateBuilder`) | `bindle()` topology + **IfC** resource collection | ✅ | [02](../docs/design/sdk-api.md#plan-02), [21](../docs/design/authoring-resources-wiring.md#plan-21) |
| `IResource` + capability interfaces | Resources behind **WIT-interface ports** + capability negotiation | ➕ | [20](../docs/design/wasm-runtime-wit.md#plan-20), [24](../docs/design/wasm-runtime-wit.md#plan-24) |
| `Add*` integration catalog | Resource catalog + capability providers | ✅ | [21](../docs/design/authoring-resources-wiring.md#plan-21), [03](../docs/design/control-plane.md#plan-03) |
| Hosting vs **client** integrations | Provider `realize` (deploy) vs generated typed clients (`code`) | ✅ | [03](../docs/design/control-plane.md#plan-03), [02](../docs/design/sdk-api.md#plan-02) |
| `WithReference` / `services__*` / `ConnectionStrings__*` | Aspire-style references + the same env conventions | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| `ReferenceExpression` / `EndpointReference` / placeholders | Lazy refs + `${resources..outputs}` placeholders | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22), [27](../docs/design/platform-engineering.md#plan-27) |
| `WaitFor` / `WaitForCompletion` (health-gated) | Saga ordering + readiness gates in the deploy DAG | ✅ | [04](../docs/design/control-plane.md#plan-04), [05](../docs/design/reliability-observability-cost.md#plan-05) |
| Endpoints / proxy / `WithExternalHttpEndpoints` | Endpoint model + ingress in the manifest | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22), [13](../docs/design/security-networking.md#plan-13) |
| Annotations (`IResourceAnnotation`) | Manifest annotations / extensibility metadata | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22) |
| Custom resources/integrations | Custom providers (any wasm language) + Forge-generated | ➕ | [03](../docs/design/control-plane.md#plan-03), [23](../docs/design/forge-generated-stack.md#plan-23) |
| Parameters & secrets | Parameters + brokered secrets (`secrets` port) | ✅ | [02](../docs/design/sdk-api.md#plan-02), [12](../docs/design/security-networking.md#plan-12) |

### Runtime, deploy & ops
| Aspire | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| `aspire-manifest.json` (deploy IR) | **manifest IR = Deployment Set** | ✅➕ | [22](../docs/design/authoring-resources-wiring.md#plan-22), [26](../docs/design/platform-engineering.md#plan-26) |
| Publishers (azd/Compose/K8s/custom) | Publisher targets incl. **GitOps publisher** | ✅ | [22](../docs/design/authoring-resources-wiring.md#plan-22), [28](../docs/design/platform-engineering.md#plan-28) |
| Compute environments | Camps + **environment types** | ✅ | [26](../docs/design/platform-engineering.md#plan-26) |
| DCP (local Go orchestrator) | local `runtime-local` host / dev loop; the Yard for hosted | ✅ | [20](../docs/design/wasm-runtime-wit.md#plan-20), [04](../docs/design/control-plane.md#plan-04) |
| Aspire Dashboard (resource graph, OTel) | Dashboard: resource graph + run inspector + replay | ➕ | [07](../docs/design/developer-experience.md#plan-07), [14](../docs/design/reliability-observability-cost.md#plan-14) |
| OpenTelemetry-by-default | OTel + event-sourced traces/replay | ➕ | [14](../docs/design/reliability-observability-cost.md#plan-14), [11](../docs/design/event-model.md#plan-11) |
| `Aspire.Hosting.Testing` | Conformance suites + E2E replay tests | ✅ | [09](../docs/design/verification.md#plan-09) |
| `aspire` CLI | `hobo` CLI | ✅ | [15](../docs/design/developer-experience.md#plan-15) |
| Polyglot (Python/Node/Go/Java/Rust) | **WASM/WASI components** (any language) + OCI fallback | ➕ | [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| AI integrations + Copilot-in-dashboard | Agents as principals + MCP + Forge generation | ➕ | [06](../docs/design/ai-native-agent-auth.md#plan-06), [23](../docs/design/forge-generated-stack.md#plan-23) |

### Where HoBo deliberately exceeds Aspire
| Capability | HoBo doc |
|---|---|
| **Platform-rules / Matching** (per-environment Resource Definitions — Aspire has no equivalent) | [25](../docs/design/platform-engineering.md#plan-25) |
| **Hosted, multi-tenant, governed control plane** (RBAC/policy/approvals/cost) | [04](../docs/design/control-plane.md#plan-04), [12](../docs/design/security-networking.md#plan-12), [16](../docs/design/reliability-observability-cost.md#plan-16) |
| **Event-sourced replay / time-travel / DR-as-replay** | [11](../docs/design/event-model.md#plan-11), [05](../docs/design/reliability-observability-cost.md#plan-05) |
| **WASM-first polyglot runtime** (vs container/process) | [20](../docs/design/wasm-runtime-wit.md#plan-20) |
| **Agent-native Forge** generation of providers/implementations/definitions | [06](../docs/design/ai-native-agent-auth.md#plan-06), [23](../docs/design/forge-generated-stack.md#plan-23) |
| **Stubbable ports** (run before implementations exist) | [23](../docs/design/forge-generated-stack.md#plan-23) |

### What HoBo borrows wholesale (credit Aspire)
`WithReference`-style wiring, uniform config for any component/container, annotations as extensibility, and the **manifest as deploy IR** — adopted in [Plan 22](../docs/design/authoring-resources-wiring.md#plan-22). HoBo's contribution is wrapping that ergonomic core in a wasm runtime, a matching/platform layer, event-sourcing, and a governed hosted plane.
