---
type: Reference
title: "Live provider readiness matrix"
description: "Honest matrix of production cloud/CI/IaC adapters: realize vs apply, credential gates, and what is still mock/in-memory. Complements ship residual H-E5."
tags: [hobo, design, providers, honesty]
---

# Live provider readiness matrix

> **Purpose.** Stop reading “package exists” as “live multi-cloud apply works.”  
> **Residual:** full multi-cloud live apply remains **H-E5** in
> [`instances/residual-human-blockers-2026-07-30.md`](./instances/residual-human-blockers-2026-07-30.md).  
> **Default product lane:** in-memory Pulumi stand-in via `@hobo/hobo` compose (HONEST SCOPE).

## Legend

| Level | Meaning |
|---|---|
| **IR / realize** | Emits `hobo.iac-program/v1` (or equivalent) — no cloud API call |
| **Cred-gated apply** | Live HTTP/API path when tokens present; offline otherwise |
| **In-memory** | Deterministic offline stand-in (default for plan/up) |
| **Stub** | Explicit unimplemented refuse |

## Cloud providers (`packages/providers/`)

| Adapter | Realize IR | Live apply | Notes |
|---|---|---|---|
| `@hobo/provider-cloudflare` | Yes | Partial | `realize()` → program; composed CF deploy provider is **credential-gated** fixture/worker path |
| `@hobo/provider-aws` | Yes | No default | IR only unless wired through live IaC engine |
| `@hobo/provider-gcp` | Yes | No default | IR only |
| `@hobo/provider-azure` | Yes | No default | IR only |
| `@hobo/provider-kafka` | Capability | N/A messaging | Not a full cloud Yard provider |
| `@hobo/provider-lakebed` | Yes | Partial | Deploy-driver style (ADR-0127) |
| `@hobo/provider-convex` | Yes | Cred-gated | Deploy-driver style (ADR-0144); Management API client fails closed without a broker-minted `CONVEX_DEPLOY_KEY` (presence-only check, injected fetch); typed impedance limits exported |
| `@hobo/provider-ax` / `agentv` | Eval | N/A | AI-eval adapters |

## IaC engines (`packages/iac/`)

| Adapter | Default | Live |
|---|---|---|
| `@hobo/iac-pulumi` | **In-memory** Automation stand-in | `HOBO_PULUMI_LIVE=1` (+ engine binary/module) |
| `@hobo/iac-terraform` | Offline/test | CLI engine when binary present |
| `@hobo/iac-crossplane` | Offline/test | Cluster-gated |

## Runtimes

| Runtime | Status |
|---|---|
| `runtime-local` | Default durable SQLite Camp |
| `runtime-wasm` | Real Wasmtime path when toolchain present |
| `runtime-oci` | kubectl transport when cluster available |
| `runtime-cloud-native` | **Stub** providers (`HOBO_CLOUD_NATIVE_UNIMPLEMENTED`) |
| `runtime-dapr` / `runtime-browser` | Specialized |

## Traffic-routing staging cutover lane (`pnpm run staging:cutover`)

The Phase-5 transparency demo: `scripts/staging-cutover-demo.mts` drives the
production control loop (`@hobo/stations`) + progressive cutover through a real
adapter while an external uptime probe (default 1 req/s) watches the public
URL. The verdict (event trace, probe log, success rate) is archived under
[`instances/staging-cutover/`](./instances/staging-cutover/). Only the adapter
binding changes between lanes — the swap logic is identical.

| Lane | Binding | Gate | Status |
|---|---|---|---|
| `--provider=simple` | Loopback backends + routing proxy | none | **Green** — archived run: 100% probe success across a budget-driven 10→50→100 swap |
| `--provider=vercel` | Rolling Release canary between two mapped deployments | `VERCEL_TOKEN`, `VERCEL_PROJECT`, `VERCEL_DEPLOYMENT_A/B`, `HOBO_STAGING_PROBE_URL` | Cred-gated; fails closed (exit 2) without env |
| `--provider=cloudflare` | LB pools + health checks on a staging zone | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `HOBO_STAGING_BACKEND_A/B`, `HOBO_STAGING_PROBE_URL` | Cred-gated; fails closed (exit 2) without env |

Success requires `reapplied` **and** zero failed probe samples; any probe
failure exits non-zero and the archived evidence names the failing samples.

## Operator takeaway

1. **Offline dogfood:** hello-bindle + self-host-yard + self-host-station — no cloud account.  
2. **First live cloud:** credential-gated CF/Vercel / Pulumi live flags — still not “unedited Bindle on N clouds.”  
3. **S4 multi-cloud GA:** blocked on H-E5 + H-V1 CI + dogfood residuals.

## Maintenance

Update this matrix when a provider graduates from IR-only to default-offline-safe live apply with tests. Do not mark live without a fail-closed no-credential test and a credentialed lane doc.
