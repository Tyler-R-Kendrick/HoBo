---
version: 1
slug: "site-src-pages-examples"
primary_target: "site/src/pages/examples"
related_targets: []
---

# Examples console (Operate)

Mode: Operate. World: HoBo Rubberhose (site/DESIGN.md).

Structure: film-strip storyboard (concept seed 116fd7b0, grounded candidate 3).
Sequential boards under a title-card host stage:

1. **Pool** — yards via combobox multi-select; selecting a yard shows that yard’s deploy surface on Stage Source (`examples/try-site/yards/<target>.deploy.ts`)
2. **Ship** — locked until Pool has stations; single app combobox (Bindle Source)
3. **Live** — deployment combobox + Preview / Open / Claim

No plate lists / track-switch rows. No SaaS sidebar card stack.

Local URL: `http://localhost:4321/HoBo/examples/` (not `/examples/` — Astro `base` is `/HoBo`).

Agent-browser feature: `pnpm --filter hobo-site run examples:regression`
(`features/examples-console-cloudflare-station.feature` — Pool stamps a **live**
Cloudflare Temporary Accounts Environment Station via same-origin
`/api/cf-temp`, then Playwright navigates to real `*.workers.dev`). No mock
broker success path.

Honesty:
- Stage Source = yard **station** deploy file (Pool focus) or Bindle `app.ts` (Ship/Live focus).
- Yard surfaces are operator station bootstrap only — no `waspApp` / `cli` / Bindle packaging.
- Selecting Cloudflare widens the station resource pool; Deploy stations uses
  same-origin Temporary Accounts (`/api/cf-temp`). OpenSaaS Kit ships via
  `POST /api/cf-temp/opensaas` → real `examples/wasp-opensaas` client +
  `wrangler deploy --temporary`. Never `blob:` / never permanent API tokens.
  Playwright: `examples:regression` (station) + `examples:regression:opensaas` (ship).
- Non-Cloudflare yards (railway, netlify, vercel, webernetes, lakebed,
  kubernetes, browser-wasm) use same-origin agent anon hosts (`/api/anon/:provider`)
  — real HTTP under `astro dev`, never `blob:` stamped as remote. Railway/Vercel
  have no password-free Temporary Accounts API; Netlify `--allow-anonymous` is
  password-gated (bad for iframe), so Examples serve agent hosts instead.
  Playwright: `examples:regression:anon`.
- Cloudflare yard capabilities include `container` (Workers Containers) — not a local Docker dependency.
- hello-world = `@trainable` Hello + `bindle((b) => ({ web: b.web(Hello) }))` on browser WIT.
- OpenSaaS app ship may use an optional local bridge for Compose/provider CLIs; Stations themselves do not.
- Browser controller must not import Node `fs` (yard deploy sources load via `examples/yards-deploy.json`).
