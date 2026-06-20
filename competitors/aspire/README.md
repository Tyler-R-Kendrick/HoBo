# Aspire — Competitor Reference

> Captured for HoBo competitive analysis (research as of 2026). The most detailed capture in this folder. The HoBo↔Aspire parity tracker is in [`hobo-mapping.md`](./hobo-mapping.md).
>
> Files: [apphost-resource-model.md](./apphost-resource-model.md) · [integrations-catalog.md](./integrations-catalog.md) · [wiring-endpoints.md](./wiring-endpoints.md) · [manifest-publishers-deploy.md](./manifest-publishers-deploy.md) · [cli.md](./cli.md) · [dashboard-dcp-observability.md](./dashboard-dcp-observability.md) · [testing-polyglot-ai.md](./testing-polyglot-ai.md) · [differentiators.md](./differentiators.md) · [hobo-mapping.md](./hobo-mapping.md)

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
- **vs Humanitec** ([../humanitec](../humanitec/README.md)): Aspire is dev-to-deploy *tooling* (no platform-rules/matching, no RBAC/policy/cost, no hosted control plane); Humanitec is an enterprise **Platform Orchestrator**.
- **vs Nitric** ([../nitric](../nitric/README.md)): both are infrastructure-from-code, but Nitric targets serverless with a Go-based plugin runtime; Aspire is broader app composition + local-dev parity + OTel, .NET-rooted.

## Known gaps (opportunities for HoBo) — see [differentiators.md](./differentiators.md)
- **Deployment maturity** lags the local-dev experience; production typically still leans on `azd`/`kubectl`.
- **Not a full IDP** — no Resource-Definition/matching layer, no RBAC/policy/cost/multi-tenant model.
- **.NET heritage** despite the polyglot rebrand; ecosystem is still .NET-heavy.
- **Container-/process-centric**; dashboard is **dev-time**, not a production control plane.
- No event-sourced replay/audit; no agent-native generation.

See [hobo-mapping.md](./hobo-mapping.md) for HoBo's response to each.
