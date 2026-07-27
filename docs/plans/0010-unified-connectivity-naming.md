---
type: Implementation Plan
title: Unified connectivity, DNS-valid naming, multi-tenant foundations
status: landed-foundations
date: 2026-07-27
---

# 0010 — Unified connectivity & multi-tenant foundations

One-shot delivery of the v4.2 unified connectivity prompt: hierarchical DNS-valid naming, local named endpoints (portless optional), Tailscale-first overlay skeleton, pluggable public DNS, and first-class multi-tenant / PolicyEngine / metering hooks.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Language | TypeScript only |
| Local named HTTPS | Optional **portless** detection; port path unchanged when absent |
| Overlay | **Tailscale** primary; **Netbird** alternative behind `OverlayNetwork` |
| Naming | `{resource}.{app}.{env?}.{branch?}.{project?}.{tenant?}.hobo.{tld}`; never bare `.hobo` |
| Local TLD | `localhost`; overlay TLD | `test`; `prod` env omitted |
| Public DNS | `managedBy: hobo \| cloud-provider \| none` + swappable `DnsProvider` |
| DNS-as-Code | DNSControl preferred plan export; octoDNS noted; Dotnify not primary |
| Multi-tenancy | Soft isolation via `tenantId` + PolicyEngine; hard isolation later |
| Policy | `PolicyEngine` port; initial tag/ACL engine |
| Metering | `UsageEvent` + `MeteringBus` + memory/log sinks (no full billing engine) |

## Landed surface

- `@hobo/core`: `naming`, `ports/tenant`, `policy-engine`, `metering`, `dns`, `overlay`; `BindingSource` includes `named` / `overlay` / `service-discovery`.
- `@hobo/connectivity`: implementations + tests + contracts/data-models + README/ARCHITECTURE.
- `@hobo/hobo` / `@hobo/cli`: named endpoints on local + multi-host serve; `DevServeResult`; inspect/MCP discovery payload.

## Next steps (closed)

1. ~~Live Tailscale MagicDNS split + Funnel~~ — CLI + **Tailscale API** split DNS (`TS_API_KEY`).
2. ~~Netbird management API~~ — enroll, peers, DNS nameserver groups over HTTP.
3. ~~Cloudflare/Route53~~ — Route53 uses **built-in SigV4** (no unsigned default).
4. ~~OPA/Rego~~ — HTTP + CLI + **rego-lite** JSON policy documents.
5. ~~Billing~~ — durable ledger + **Stripe PaymentIntent** provider + `closeAndCharge`.
6. ~~Hard multi-tenant isolation~~ — `createTenantIsolationRegistry`.
7. ~~Dynamic DNS heartbeats~~ — junction agent integration.
8. ~~DPoP + JWT-SVID~~ — real ES256 DPoP + audience-bound SPIFFE JWTs.

## Gates

- Package tests: `@hobo/core` naming, `@hobo/connectivity` foundations.
- Default local path remains offline and port-based when portless is absent.
- Boundaries: `packages/connectivity` registered in conformance known paths.
