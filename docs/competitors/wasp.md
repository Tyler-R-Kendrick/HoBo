---
type: Competitive Reference
title: "Wasp — Competitor Reference"
description: "Wasp (wasp.sh) — a Rails-like full-stack framework for React/Node.js/Prisma driven by a declarative .wasp config; captured as App-Kit inspiration and a packaging path, not a runtime target."
tags: [hobo, competitors]
---

# Wasp — Competitor Reference

> Captured for HoBo competitive analysis; researched August 2026. This file documents
> **Wasp's** offering faithfully; the HoBo↔Wasp mapping/parity tracker lives in the
> [HoBo mapping](#hobo-mapping) section below. Posture per
> [ADR-0144](../design/adr/07-portability-extensibility.md#adr-0144): thin,
> inspirational alignment only — no dual authoring, no runtime embedding.

## Positioning

- **Tagline:** *"Develop full-stack web apps without boilerplate."*
- **Paradigm:** a declarative DSL (`main.wasp` / `main.wasp.ts`) describing an app's
  pages, routes, auth, queries/actions, jobs, and email senders — compiled into a
  React + Node.js + Prisma project. "Rails for JS" with the config as the single
  source of app-level intent.
- **Open-SaaS:** a batteries-included SaaS starter (auth, payments via
  Stripe/Lemon Squeezy, admin dashboard, analytics, email, AI examples) built on
  Wasp — the marketing wedge for "a SaaS in a day".

## Feature surface

- **Declarative app spec** — entities (Prisma models), pages/routes, `query`/
  `action` operations with automatic client RPC + cache invalidation, `job`
  (pg-boss cron/background), `api` (raw Express endpoints), `app.auth`
  (username/password, email, Google/GitHub/Discord OAuth) — all wired from the
  spec; the compiler generates the React glue, server plumbing, and typed client.
- **Full-stack type safety** — generated TypeScript types flow from Prisma
  entities through operations into React hooks.
- **Deployment** — `wasp deploy` one-command paths (Fly.io, Railway); `wasp build`
  emits a standard Node.js + static bundle deployable anywhere.
- **Escape hatches** — arbitrary React/Node code beside the spec; the spec stays
  the composition layer rather than a sandbox.

## Differentiators

### Strengths
- The declarative-spec-over-framework model proves that **app-level intent as
  config** (auth, jobs, operations declared once, glue generated) removes real
  boilerplate — the same bet HoBo makes with Bindles + IfC, at a smaller scope.
- Open-SaaS shows the value of **opinionated kits**: a curated feature set
  (auth + payments + admin) as one install.

### Gaps (opportunities for HoBo)
- Single stack (React/Node/Prisma), single database (Postgres via Prisma), no
  multi-cloud story, no policy/audit plane, no agent surface; deployment is
  hosted-VM-shaped, not provider-negotiated.
- The `.wasp` spec is compiler input, not a portable IR — no matching, no
  provider equivalence, no event-sourced control plane.

## HoBo mapping

> Legend: ✅ parity · ➕ HoBo goes further · ◐ HoBo thinner · 🔜 planned. HoBo is
> design-phase; Wasp ships today — maturity credit is Wasp's.

| Wasp concept | HoBo equivalent | Notes |
|---|---|---|
| `main.wasp` declarative app spec | **Bindle** (TypeScript closure builder, IfC) | ➕ Bindle is provider-agnostic IR with matching + audit, not compiler input ([Plan 25](../design/platform-engineering.md#plan-25)) |
| Entities (Prisma models) | `data` resources + projections | ◐ HoBo's data plane is event-sourced ([Plan 11](../design/data-plane.md#plan-11)); Prisma-style ORM ergonomics are thinner today |
| `query`/`action` + generated RPC | Handlers/operations + generated `_generated/` client ([ADR-0037](../design/adr/01-architecture-core.md#adr-0037)) | ✅ same "declare once, typed client for free" bet |
| `job` (cron/background) | `schedule` + `job` resource kinds, durable workflows | ➕ durable, replayable ([Plan 02](../design/sdk-api.md#plan-02)) |
| `app.auth` one-liner | `auth` resource kind + identity plane (SVIDs, OIDC) | ➕ agent principals included ([Plan 06](../design/ai-native-agent-auth.md#plan-06)) |
| Open-SaaS starter kit | **App Kits / Resource Packs** — curated, signed bundles | 🔜 the borrow: ship opinionated kits (auth+payments+admin) as Packs ([Plan 25](../design/platform-engineering.md#plan-25)) |
| `wasp deploy` (Fly/Railway) | `hobo up` with Matching-selected providers | ➕ provider-negotiated, `match.Decided`-audited |
| `wasp build` standard bundle | Packaging path: an existing Wasp app deploys onto HoBo as a `container`/`service` resource | ✅ one-directional adoption, no dual authoring |

**The borrow HoBo takes:** modular, spec-style feature composition and the
Open-SaaS-shaped kit as **Resource Pack / App Kit inspiration** — higher-level
Bindle kits with curated features, not a second authoring surface.

**Try-site demo:** `/HoBo/examples/` ships real Wasp Open-SaaS under
[`examples/wasp-opensaas/`](../../examples/wasp-opensaas/HOBO.md) (from `wasp new -t saas`),
packaged as a HoBo Bindle (`container` Postgres + `service`). **Pool** stamps
Environment Stations first (Cloudflare Temporary Accounts + CORS relay
`POST /station` — anonymous `*.workers.dev` + claim URL; relay bootstrapped with
Temporary Accounts, zero permanent API tokens; no Bindle in the yard surface).
**Ship** then places the app onto those stations
(Compose / Railway / Cloudflare app paths). Yard deploy files are station-only
(`stationBootstrap`; no `waspApp` / `cli`).
Console URL: `/HoBo/examples/`. Start the bridge with
`pnpm --filter hobo-site run examples:bridge`. Agent-browser feature:
`pnpm --filter hobo-site run examples:regression`.

**The one-line takeaway:** Wasp validates declarative app-level intent and
opinionated kits; HoBo adopts those lessons at the Bindle/Pack layer and offers
existing Wasp apps a packaging path — full dual authoring and generated React
glue stay out of scope.
