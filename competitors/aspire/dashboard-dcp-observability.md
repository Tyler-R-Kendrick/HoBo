# Aspire — Dashboard, DCP & Observability

> Part of the [Aspire competitor reference](./README.md). The runtime/visibility layer — a major part of Aspire's appeal and a reference point for [HoBo Plan 7](../../docs/design/developer-experience.md#plan-07)/[Plan 14](../../docs/design/reliability-observability-cost.md#plan-14).

## DCP — the Developer Control Plane
**DCP** is Aspire's **local orchestrator**, written in **Go**, that the AppHost drives when you `aspire run`:
- Manages the lifecycle of **containers**, **.NET projects**, and **executables/processes** as a unit.
- Provides a **Kubernetes-style local API** (pods/services/configmaps analogues) — but it is *not* Kubernetes and requires none.
- Handles a **bridge network + DNS** so resources reach each other by name (`http://api`, `postgres:5432`) and containers can tunnel to host processes; plus health-probe execution and restarts.
```
AppHost (C#/TS)  ──►  DCP API (Go, localhost)  ──►  containers + processes
       └────────────────────────────────────────►  Dashboard (OTLP)
```

## The Aspire Dashboard
A web UI bundled with `aspire run`:
- **Resources** — list + **dependency graph**, status, endpoints, environment variables, connection strings (with **sensitive-value masking**), and **start/stop/restart** controls.
- **Console logs** — raw stdout/stderr per resource.
- **Structured logs / Traces / Metrics** — via **OpenTelemetry (OTLP)**: searchable structured logs, distributed traces with spans, and metrics with percentiles.
- **Interactive parameters** — prompts for missing parameters before start.
- **AI assist** — when launched from VS / VS Code, **GitHub Copilot** can summarize logs and help root-cause across logs/traces/metrics.

## Standalone dashboard (any language)
The dashboard ships as a container and works as a **generic OTLP sink** for *any* stack — no Aspire app required:
```bash
docker run --rm -it -p 18888:18888 -p 4317:18889 \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
# point any OTEL_EXPORTER_OTLP_ENDPOINT at it (gRPC 4317 / HTTP 18889)
```
This is a common reason non-.NET teams adopt Aspire's dashboard on its own.

## OpenTelemetry by default
The **ServiceDefaults** project wires OTel logging/metrics/tracing, service discovery, and standard resilience into every .NET service; non-.NET services participate by exporting OTLP (Python/Node/Go SDKs). Telemetry is **dev-time first** — for production you still point OTel at Grafana/Datadog/etc. (the bundled dashboard is not a production monitoring system).
