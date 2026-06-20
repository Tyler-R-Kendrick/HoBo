# Aspire — Wiring, References & Endpoints

> Part of the [Aspire competitor reference](./README.md). How resources discover and connect to each other — the part HoBo borrowed most directly ([HoBo Plan 22](../../docs/design/22-wiring-manifest.md)).

## `WithReference` — the core wiring verb
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

## Direct env, args
```csharp
builder.AddContainer("svc", "img")
       .WithEnvironment("LOG_LEVEL", "debug")
       .WithEnvironment("DB", db)                 // resolves to its connection string
       .WithEnvironment("KEY", apiKeyParameter)   // ParameterResource
       .WithArgs("--port", "8080");
```
`WithEnvironment` also takes a callback (`EnvironmentCallbackAnnotation`) for values computed at run/publish time.

## Reference expressions
- **`ReferenceExpression`** — a deferred, interpolated string mixing literals + resource values (e.g. building a custom connection string from parts).
- **`EndpointReference`** — `resource.GetEndpoint("https")` with `.Url`/`.UriExpression`/`.Host`/`.Port` members usable in `WithEnvironment`. These become `{resource.bindings.https.url}`-style tokens in the manifest ([manifest-publishers-deploy.md](./manifest-publishers-deploy.md)).

## Endpoints & networking
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

## Ordering: `WaitFor` family
```csharp
builder.AddProject<Projects.Api>("api")
       .WaitFor(db)              // wait until db is running AND healthy
       .WaitForStart(cache);    // wait until cache is merely running
builder.AddProject<Projects.Worker>("worker")
       .WaitForCompletion(migrations);  // wait until a one-shot task exits 0
```
`WaitFor` is gated by health checks ([apphost-resource-model.md](./apphost-resource-model.md)); `WaitForCompletion` is for run-to-completion jobs (migrations, seeders).

## Service discovery resolution
`WithReference` + ServiceDefaults' `AddServiceDiscovery()` mean a service calls a dependency by **logical name** (`http://api`), and resolution happens via configuration (`services__*` env), the platform (Container Apps/Kubernetes DNS), or DNS-SRV — the same code works locally and in production.
