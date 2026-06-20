# Aspire — Testing, Polyglot & AI; Versions & Licensing

> Part of the [Aspire competitor reference](./README.md). Integration testing, the polyglot rebrand, AI integrations, the release timeline, and the licensing/deployment model.

## Testing — `Aspire.Hosting.Testing`
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

## Polyglot & the rebrand
Microsoft's **2025 rebrand** dropped ".NET" → **"Aspire"** (aspire.dev), repositioning it as language-agnostic:
- **Python** — `AddPythonApp(...)` with **uv**/pip/venv detection; also module/script execution. Good for FastAPI/Flask/Celery.
- **Node / JS** — `AddNodeApp(...)`, `AddNpmApp(...)` (npm/yarn/pnpm), Vite support; a **TypeScript AppHost** is emerging.
- **Go / Java / Rust** — via the **Community Toolkit** (Spring Boot/Quarkus for Java, Cargo for Rust, etc.).
- **How non-.NET apps participate:** as containers/executables/projects in the graph, wired with the same `WithReference`/endpoints, and exporting **OTLP** to the dashboard. The orchestration, wiring, and observability are uniform; the deepest typed ergonomics remain strongest in .NET.

## AI / GenAI
```csharp
builder.AddAzureOpenAI("openai").AddDeployment("gpt-4o", "gpt-4o", "2024-08-06");
builder.AddGitHubModel("ai", "openai/gpt-4o-mini");   // GitHub Models
builder.AddOllama("ollama").AddModel("llama3");        // local (Community Toolkit)
```
Plus **GitHub Copilot in the dashboard** (log summarization / root-cause) when run from VS/VS Code.

## Version timeline
> Anchored on well-established releases; later items are *direction*, not precise dated facts.
- **8.0 — GA, May 2024.** First stable release; the AppHost/integration/dashboard model; service discovery + ServiceDefaults.
- **8.1 / 8.2 (2024).** More integrations; dashboard improvements.
- **9.0 — Nov 2024.** Dropped the workload requirement (SDK reference), `WaitFor`/health-gating, dashboard resource control (start/stop/restart), OTLP/CORS improvements.
- **9.x (2025).** **Publishers + `aspire publish`/`deploy`**, the standalone **`aspire` CLI**, compute environments (ACA/Compose/K8s), interactive parameters, **GitHub Models**, Copilot-in-dashboard.
- **2025 polyglot rebrand.** ".NET Aspire" → **"Aspire"**, aspire.dev, first-class Python/Node, TypeScript AppHost, single-file `apphost.cs` direction. (Specific post-rebrand version numbers/dates vary by source and are not asserted here.)

Support policy: effectively the latest major line is the supported one.

## Licensing & deployment model
- **MIT**, fully open source (`github.com/dotnet/aspire`).
- **No SaaS / no hosted control plane** — runs locally for dev and **publishes/deploys** to infra you own (Azure, Kubernetes, Docker Compose, custom). Manifests are plain JSON → low lock-in.
