# Nitric — Differentiators, Comparisons & Gaps

> Part of the [Nitric competitor reference](./README.md). What's genuinely novel, how Nitric frames itself vs others, and where it falls short.

## Headline differentiators
1. **Infrastructure from Code (IfC)** — resources declared inline where used; no separate IaC files; resource graph inferred by running code in collection mode.
2. **Automatic least-privilege IAM** from `.allow()` declarations.
3. **True multi-cloud portability** — one codebase → AWS/GCP/Azure/K8s/server, no cloud-specific code paths.
4. **Multi-language via a gRPC membrane** — identical SDK surface across Node/Python/Go/Dart; new languages by compiling proto contracts.
5. **Integrated local dev** — full local emulation + dashboard, no LocalStack.
6. **Resource-collection model** — prevents orphaned infra and code↔IaC drift.
7. **Escape hatches** — direct cloud SDK, provider extension, custom providers.

## How Nitric positions vs others (their framing)
- **vs Terraform:** developer-centric + auto-IAM + multi-cloud without per-provider code (Terraform is IaC-first, explicit, per-provider).
- **vs Pulumi:** higher-level abstractions + built-in local dev + true portability (Pulumi is lower-level infra control).
- **vs AWS SAM:** multi-cloud + multi-language + auto-IAM (SAM is AWS-only, YAML).
- **vs Serverless Framework:** real cloud-agnostic abstraction + integrated local dev (SF is AWS-centric, plugin-driven).
- **vs SST:** cloud-agnostic + provider-agnostic + extensible (SST is AWS + Pulumi, opinionated full-stack AWS).
- **vs Encore:** broader resource set + multiple clouds (Encore is more opinionated full-stack).

## Gaps / limitations (opportunities for HoBo)
- SQL databases in **preview** (hourly pricing, not serverless); enable via config.
- Custom domains **AWS-only**.
- Security rules **not enforced locally**.
- Bounded to abstracted services — anything else needs the cloud SDK (some coupling).
- Custom-provider authoring requires **Go**; "not easy to iterate on" (the user's own words).
- No first-class **actor/durable-workflow/event-sourcing** model.
- No **agent-native** story (agent identity, agent token brokering, MCP control surface).
- No **WASM/WASI** runtime / polyglot-via-components story.
- No **AI-generated providers/implementations**; provider breadth is human-driven.

## Commercial
- **Nitric Deploy** (formerly "Suga") — managed deployments (sub-10s), visual infra, observability; for teams who don't want to self-manage providers.

> See [`hobo-mapping.md`](./hobo-mapping.md) for how HoBo matches each feature and where it deliberately goes further.
