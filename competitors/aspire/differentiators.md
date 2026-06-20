# Aspire — Differentiators & Gaps

> Part of the [Aspire competitor reference](./README.md). Condensed strengths/gaps + head-to-head comparisons.

## Differentiators (what's genuinely strong)
1. **Code-first composition** — the topology (services, deps, wiring) is a typed program (`WithReference`/`WaitFor`/endpoints), not YAML/HCL; refactorable, with IDE support.
2. **Local-dev parity** — one command (`aspire run`) stands up the whole multi-service graph (containers + processes) locally, closely matching the deploy shape.
3. **Integrated observability** — OpenTelemetry (logs/traces/metrics) + a bundled **dashboard** with a resource graph, out of the box; the dashboard also runs **standalone for any language**.
4. **Manifest IR + publishers** — a clean `aspire-manifest.json` → multiple targets (azd→ACA, Docker Compose, Kubernetes/Helm, custom).
5. **Polyglot direction** — first-class Python/Node alongside .NET; Go/Java/Rust via the toolkit; non-.NET apps wired uniformly and observed via OTLP.
6. **Extensible** — custom resources/integrations/publishers via NuGet; rich first-party + Azure/AWS + Community Toolkit catalog.
7. **MIT / no lock-in** — open source, self-hosted, plain-JSON IR; Microsoft-backed with a fast release cadence.

## Gaps (HoBo's openings)
1. **Deployment maturity** lags local dev — production often still leans on `azd`/`kubectl`/`helm`; publishers are newer than the run experience.
2. **Not a platform/IDP** — no platform-rules layer (no Resource-Definition/**matching** per environment), no **RBAC/policy/approvals/cost/multi-tenant**; one AppHost per repo.
3. **.NET heritage** — despite the rebrand, ergonomics and ecosystem skew .NET; the AppHost authoring is C#-first.
4. **Container-/process-centric** — no wasm/component runtime; non-containerized/legacy workloads need `ExecutableResource` glue.
5. **Dev-time dashboard** — not a production monitoring system; no event-sourced replay/time-travel/audit.
6. **No agent-native generation** — no Forge-style AI generation of integrations/definitions; AI shows up as *integrations* + Copilot-in-dashboard, not as a generation pipeline.

## Head-to-head
| vs | Aspire's edge | Their edge |
|---|---|---|
| **Docker Compose** | code-first, OTel, projects-not-just-containers, deploy publishers | dead-simple `up`, ubiquitous |
| **Skaffold / Tilt / Garden** | polyglot code-first, local-dev parity beyond K8s | K8s-native inner loop, mature |
| **Pulumi / Crossplane** | local-dev + observability + app composition | mature, broad IaC / control-plane provisioning |
| **Nitric** ([../nitric](../nitric/README.md)) | broader app composition + OTel + local parity | serverless-first IfC + policy-from-code |
| **Humanitec** ([../humanitec](../humanitec/README.md)) | superb local dev, code-first | enterprise Platform Orchestrator: matching, RBAC, governance, hosted |

## Net for HoBo
Aspire nails the **developer inner loop** — code-first wiring, local parity, a manifest IR, and observability — which is why HoBo adopts its **wiring + manifest model** ([Plan 22](../../docs/design/22-wiring-manifest.md)). HoBo then adds what Aspire lacks: a **platform-rules/matching layer** ([Plan 25](../../docs/design/25-resource-definitions-matching.md)), a **wasm-first polyglot runtime** ([Plan 20](../../docs/design/20-wasm-wasi-runtime.md)), **event-sourced replay/audit** ([Plan 11](../../docs/design/11-event-model.md)), agent-native **Forge** generation ([Plan 6](../../docs/design/06-ai-native-agent-auth.md)), and a hosted, multi-tenant, governed control plane. See [hobo-mapping.md](./hobo-mapping.md).
