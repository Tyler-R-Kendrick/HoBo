# Aspire — AppHost & Resource Model

> Part of the [Aspire competitor reference](./README.md). The core composition model: the builder, the resource interfaces, resource types, annotations, lifecycle/eventing, custom resources, health checks, parameters/secrets, persistence. C# shown as quoted/illustrative excerpts (see the [fair-use note](../README.md#sources--fair-use)).

## AppHost & the builder
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

## The resource model
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

### Resource types
- **`ProjectResource`** — a .NET project: `builder.AddProject<Projects.MyApi>("api")` (typed via generated `Projects.*`).
- **`ContainerResource`** — `builder.AddContainer("cache", "redis:7")`.
- **`ExecutableResource`** — `builder.AddExecutable("tool", "./tool", workingDir, args…)`.
- **`ParameterResource`** — `builder.AddParameter("api-key")` / `AddParameter("pw", secret: true)`.
- **`ConnectionStringResource`** — `builder.AddConnectionString("external-db")` (BYO connection string, no resource provisioned).
- **`ExternalServiceResource`** — references an external URL.
- **Dockerfile resource** — `builder.AddDockerfile("svc", "../svc")` (build instead of pull).
- **Database resources** — returned by `.AddDatabase("name")` on a server resource (`PostgresDatabaseResource`, `SqlServerDatabaseResource`, …).

## Annotations — the extensibility substrate
Resource configuration is stored as **annotations**: each `With*` call attaches an `IResourceAnnotation` to `resource.Annotations`. Built-ins include `EndpointAnnotation`, `EnvironmentCallbackAnnotation` (lazy/deferred env), `ContainerMountAnnotation`, `ArgsAnnotation`, `HealthCheckAnnotation`, `WaitAnnotation`, `ReplicaAnnotation`, and `ManifestPublishingCallbackAnnotation` (controls what the manifest emits). You query them:
```csharp
var endpoints = api.Resource.Annotations.OfType<EndpointAnnotation>().ToList();
```

## Custom resources & integrations
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

## Lifecycle & eventing
```csharp
builder.Eventing.Subscribe<BeforeStartEvent>((evt, ct) => { /* mutate model */ return Task.CompletedTask; });
builder.Eventing.Subscribe<ResourceReadyEvent>((evt, ct) => { /* react when a resource is ready */ return Task.CompletedTask; });
```
Also `IDistributedApplicationLifecycleHook` for cross-cutting hooks. Events fire as resources transition (created → starting → running/ready).

## Health checks (gate dependencies)
```csharp
builder.AddProject<Projects.Api>("api").WithHttpHealthCheck("/health");      // GET /health → 200
builder.AddPostgres("pg").WithHealthCheck("custom-check");                    // DI-registered check
```
`WaitFor(x)` blocks a dependent until `x` is **running and all its health checks pass** (see [wiring-endpoints.md](./wiring-endpoints.md)).

## Parameters & secrets
```csharp
var pw = builder.AddParameter("db-password", secret: true);   // prompted; masked
builder.AddSqlServer("sql").WithPassword(pw);
var ext = builder.AddConnectionString("legacy-db");           // BYO connection string
```
Non-secret params show as text, secret params as password inputs; values flow in as env vars / connection strings. Binds to user-secrets/appsettings via the standard config system.

## Persistence
```csharp
builder.AddPostgres("pg").WithDataVolume();                          // named volume
builder.AddContainer("app", "img").WithBindMount("./cfg", "/cfg", isReadOnly: true);
builder.AddContainer("app", "img").WithVolume("data", "/data");
builder.AddPostgres("pg").WithLifetime(ContainerLifetime.Persistent); // survive restarts (vs Ephemeral default)
```
