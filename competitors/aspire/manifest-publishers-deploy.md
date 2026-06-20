# Aspire — Manifest, Publishers & Deployment

> Part of the [Aspire competitor reference](./README.md). The deployment IR and how it reaches real targets. This is HoBo's closest structural analogue ([HoBo Plan 22](../../docs/design/22-wiring-manifest.md)).

## The manifest (deployment IR)
`aspire publish` (or the legacy `dotnet run --project AppHost -- --publisher manifest`) emits **`aspire-manifest.json`** — a tool-agnostic description of the resolved graph that deployment tooling consumes.

### Resource type versions
`project.v1`, `container.v1` (and legacy `container.v0`), `dockerfile.v0`, `parameter.v0`, `value.v0` (computed outputs), `azure.bicep.v0` (an Azure resource defined by a Bicep template). Each entry carries `type`, optional `connectionString`, `env`, `bindings`, `volumes`, and `params`/`outputs` for Bicep.

### Token expressions
`env` and `connectionString` values reference other resources with `{...}` tokens, resolved by the deploy tool:
- `{resource.connectionString}`
- `{resource.bindings.<endpoint>.host|port|url}`
- `{parameter.value}`

### Representative manifest
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

## Publishers & compute environments
A **publisher** turns the model into deployment artifacts (and, for `deploy`, applies them) via `IDistributedApplicationPublisher`. You select a target by adding a **compute environment** resource in the AppHost:
```csharp
builder.AddAzureContainerAppEnvironment("cae");    // Azure Container Apps
builder.AddDockerComposeEnvironment("compose");    // Docker Compose
builder.AddKubernetesEnvironment("k8s");           // Kubernetes/Helm
```
Resources can be pinned to an environment (`.WithComputeEnvironment(env)`), enabling mixed targets.

## Deploy targets
- **Azure Container Apps via `azd`** — the **Azure Developer CLI** consumes the manifest, generates **Bicep**, provisions ACA + dependencies, builds/pushes images to ACR, and deploys. The most mature path.
- **Docker Compose** (`Aspire.Hosting.Docker`) — emits `docker-compose.yaml` + `.env` (services, networks, named volumes, `depends_on`); `docker compose up`.
- **Kubernetes / Helm** (`Aspire.Hosting.Kubernetes`) — emits a Helm chart (`Chart.yaml`, `values.yaml`, `templates/`). This supersedes the earlier community **Aspir8 / aspir8** tool that pioneered manifest→Helm.
- **Custom** — implement `IDistributedApplicationPublisher` to emit Terraform/Pulumi/anything and register it in the AppHost.

## Commands
```bash
aspire publish --output-path ./dist           # generate artifacts (manifest + target files)
aspire publish --publisher docker-compose
aspire deploy                                  # publish + apply to the configured target
aspire deploy --refresh                        # refresh credentials first
```
> **Maturity note:** publish/deploy and the compute-environment publishers matured through the 9.x line; many teams still hand off to `azd` (Azure) or `kubectl`/`helm` (K8s) for production. The local-dev experience is more mature than the deploy story.
