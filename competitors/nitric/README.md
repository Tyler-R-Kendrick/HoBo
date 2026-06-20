# Nitric — Competitor Reference

> Captured for HoBo competitive analysis. Source: nitric.io/docs, github.com/nitrictech (as researched). This folder documents **Nitric's** offering faithfully; the HoBo↔Nitric mapping/parity tracker is in [`hobo-mapping.md`](./hobo-mapping.md).
>
> Files: [resources.md](./resources.md) · [providers.md](./providers.md) · [cli-workflow.md](./cli-workflow.md) · [security-iam.md](./security-iam.md) · [differentiators.md](./differentiators.md) · [hobo-mapping.md](./hobo-mapping.md)

## Positioning & pitch
- **Tagline:** *"Build cloud backends that run anywhere, fast."*
- **Paradigm:** **Infrastructure from Code (IfC)** — you declare the cloud resources your app needs *inline in application code*; Nitric infers and provisions the infrastructure (and least-privilege IAM) automatically.
- **Mental model:** "Developer In" (start from "what workflow does the developer need?") vs traditional IaC's "System Out" (start from "what can the platform do?").
- **Promise:** one codebase deploys to AWS, GCP, Azure, Kubernetes, or a single server — even multiple clouds at once — with no code changes.
- **Target user:** backend developers building serverless/cloud apps who want multi-cloud portability and dev velocity over cloud-specific control.

## How it works (architecture)
```
App code (with inline resource declarations + .allow())
  → Nitric SDK (Node / Python / Go / Dart)
  → Nitric Runtime ("the Membrane", gRPC)
  → Provider plugin (Pulumi- or Terraform-based; deploy + runtime layers)
  → AWS / GCP / Azure / Kubernetes / server
```
- **Services vs Resources.** *Services* are containerized entry points to your code (API handlers, schedule handlers, subscribers, websocket handlers, batch handlers, websites) — each becomes an independently scaling container. *Resources* are the building blocks services use (apis, kv, buckets, queues, topics, secrets, sql, schedules, websockets, jobs, websites).
- **Resource collection.** On `nitric up`, each service is run in a special **resource-collection mode**: SDK calls that declare resources are *captured but not executed*, producing a resource/dependency graph the provider plugin turns into IaC.
- **The Membrane.** A gRPC runtime that sits between app code and the provider runtime, exposing service contracts (document/kv, storage, queue, topic, secret, sql). SDKs are thin gRPC clients generated from proto contracts (`github.com/nitrictech/contracts`).
- **Permissions.** Declared inline via `.allow(...)`; Nitric generates **least-privilege IAM** per cloud automatically.

## At-a-glance feature list (each detailed in sibling files)
- Full resource catalog (api, kv, bucket, queue, topic, secret, sql, schedule, websocket, job/batch, website) — see [resources.md](./resources.md).
- Inline `.allow()` capability-permission model → auto least-privilege IAM — see [security-iam.md](./security-iam.md).
- Multi-cloud providers (AWS/GCP/Azure) over **Pulumi or Terraform**, swappable via stack config; **custom providers** (extend or build new) with deploy + runtime layers — see [providers.md](./providers.md).
- Multi-language SDKs over gRPC (Node, Python, Go, Dart; experimental .NET/JVM) — see [providers.md](./providers.md).
- Local dev: `nitric start` (emulation + dashboard) / `nitric run` (containers); rich local dashboard — see [cli-workflow.md](./cli-workflow.md).
- Stack files for per-target/per-env config; `.env`/secrets integration.
- Escape hatches: direct cloud SDK access; provider extension; custom providers.
- Commercial: **Nitric Deploy** (formerly "Suga") — managed deploys, visual infra, observability.

## Known limitations (as researched)
- SQL databases in **preview** (hourly pricing, not serverless); enable via config.
- Custom domains **AWS-only** currently.
- Security rules (OIDC) **not enforced locally** — only when deployed.
- Bounded to abstracted services; anything else needs the cloud SDK directly (some coupling).
- Custom-provider development requires Go.
