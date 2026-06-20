# Aspire — Integration Catalog

> Part of the [Aspire competitor reference](./README.md). The breadth of `Add*` integrations. Names are stable API surface; some live in the core `Aspire.Hosting.*` packages, some in Azure/AWS packages, some in the **Community Toolkit**.

## Hosting vs client integrations (two halves)
Aspire ships integrations in **pairs**:
- **Hosting integration** (used in the AppHost): `builder.AddRedis("cache")` — declares/runs the resource and wires references.
- **Client integration** (used inside a service): `builder.AddRedisClient("cache")` — registers a typed, health-checked, OTel-instrumented client bound to the injected connection string/endpoint.
This doc focuses on the **hosting** side; nearly every data/messaging integration has a matching client package.

## Compute & runtimes
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

## Relational databases
```csharp
builder.AddPostgres("pg").AddDatabase("appdata");
builder.AddSqlServer("sql").AddDatabase("appdata");
builder.AddMySql("mysql").AddDatabase("appdata");
builder.AddAzurePostgresFlexibleServer("pg");   // .RunAsContainer() for local
builder.AddAzureSqlServer("sql").AddDatabase("appdata");
```

## NoSQL / document / cache
```csharp
builder.AddMongoDB("mongo").AddDatabase("appdata");
builder.AddAzureCosmosDB("cosmos");
builder.AddRedis("cache").WithDataVolume();
builder.AddValkey("cache");      // Redis-compatible
builder.AddGarnet("cache");      // Microsoft's Redis-compatible store
```

## Messaging & streaming
```csharp
builder.AddRabbitMQ("rmq").WithManagementPlugin();
builder.AddKafka("kafka");
builder.AddNats("nats");
builder.AddAzureServiceBus("sb");
builder.AddAzureEventHubs("eh");
```

## Search & vector
```csharp
builder.AddElasticsearch("es");
builder.AddOpenSearch("os");
builder.AddQdrant("qdrant");     // vector DB
builder.AddMilvus("milvus");     // vector DB
```

## Identity, config & secrets
```csharp
builder.AddKeycloak("kc").WithRealmImport("./realm.json").WithDataVolume();
builder.AddAzureKeyVault("kv");
builder.AddAzureAppConfiguration("appcfg");
```

## Observability
```csharp
builder.AddSeq("seq");                 // structured-log server
builder.AddAzureApplicationInsights("ai");
```
(All resources emit OpenTelemetry to the bundled dashboard by default — see [dashboard-dcp-observability.md](./dashboard-dcp-observability.md).)

## AI / LLM
```csharp
builder.AddAzureOpenAI("openai").AddDeployment("gpt-4o", "gpt-4o", "2024-08-06");
builder.AddGitHubModel("ai", "openai/gpt-4o-mini");   // GitHub Models (newer)
builder.AddOllama("ollama").AddModel("llama3");        // local LLMs (Community Toolkit)
```

## Azure & AWS
Beyond those above: `AddAzureStorage` (+ `AddBlobs`/`AddQueues`/`AddTables`), `AddAzureSignalR`, `AddAzureWebPubSub`, `AddAzureContainerAppEnvironment` (deploy target). AWS support is provided via `Aspire.Hosting.AWS` (CloudFormation/CDK provisioning + resource references). Many Azure resources can `.RunAsContainer()`/emulator locally and provision the real service on deploy.

## Community Toolkit
`github.com/CommunityToolkit/Aspire` adds Go, Java (Spring Boot/Quarkus), Rust, Ollama, Dapr, SQL/Mongo extensions, and more — published to NuGet, community-maintained. This is how non-first-party languages/services become first-class AppHost resources.
