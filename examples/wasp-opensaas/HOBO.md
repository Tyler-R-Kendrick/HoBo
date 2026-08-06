---
type: Reference
title: "Wasp OpenSaaS on HoBo local station bridge"
description: "Real Wasp Open-SaaS app packaged as HoBo containers; deployed via Examples local bridge."
tags: [hobo, examples, wasp, opensaas]
---

# Wasp OpenSaaS (HoBo packaging path)

This tree is a **real** [Wasp](https://wasp.sh) Open-SaaS app (`wasp new -t saas`),
not a browser-WIT stub.

## Layout

- `app/` — Wasp OpenSaaS sources (`main.wasp.ts`, Prisma, React client)
- `docker-compose.yml` — Postgres + server + static client (Webernetes/Lakebed)
- `docker/` — Dockerfiles that run `wasp build` then package artifacts

## Local run (Examples console)

URL (site `base` is `/HoBo`): **http://localhost:4321/HoBo/examples/**

1. `pnpm --filter hobo-site run dev` (and `examples:runtime` once if WIT hosts 404)
2. Pool → select a yard → **Deploy stations**
   - **Cloudflare:** same-origin Temporary Accounts `/api/cf-temp/station` → live `*.workers.dev`
   - **Other yards** (railway, netlify, vercel, webernetes, lakebed, kubernetes, browser-wasm):
     same-origin agent host `/api/anon/:provider/station` (real HTTP; never `blob:` as remote).
     Railway/Vercel have no password-free Temporary Accounts API; Netlify `--allow-anonymous`
     is password-gated, so Examples use agent hosts for iframeable demos.
3. Ship → pick **OpenSaaS Kit** → Deploy onto that station
   - Cloudflare: `POST /api/cf-temp/opensaas` → `wrangler deploy --temporary` (zero permanent tokens)
   - Other yards: `POST /api/anon/:provider/opensaas` → static OpenSaaS client on same-origin host
   - Optional: Webernetes/Lakebed Docker via `examples:bridge` when you want full server/API

Requires: Wasp CLI `npm i -g @wasp.sh/wasp-cli@^0.25` (first ship runs `wasp build` + `vite build` if artifacts missing).

Agent-browser features (live — no mocks):

```bash
pnpm --filter hobo-site run examples:regression
HOBO_OPENSAAS_SKIP_BUILD=1 pnpm --filter hobo-site run examples:regression:opensaas
HOBO_OPENSAAS_SKIP_BUILD=1 pnpm --filter hobo-site run examples:regression:anon
```


## HoBo Bindle

Stage Source (Ship) shows [`../try-site/apps/opensaas/app.ts`](../try-site/apps/opensaas/app.ts):
container Postgres + `service` web surface with `require: ["http","container"]` / `runtimes: ["oci"]`.

## Notes

- Live Stripe/OAuth keys are optional for local smoke; set them in compose/provider env for full OpenSaaS payments.
- Browser-wasm is not an OpenSaaS allowed yard — use Webernetes, Lakebed, Cloudflare, or Railway.
