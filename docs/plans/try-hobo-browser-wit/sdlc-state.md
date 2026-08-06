---
type: Reference
title: "Try HoBo browser WIT delivery state"
description: "Durable SDLC state for the repository-backed Examples console and browser-local WIT Environment Station."
tags: [hobo, plans, sdlc, site, examples, wit]
---

# Initiative: Try HoBo browser WIT

**Phase:** finishing  
**Slug:** `try-hobo-browser-wit`  
**Opened:** 2026-08-02  
**Host:** Cursor (Composer)

## Goal

Ship the repository-backed `/examples/` console with sparse policy planning and
a real browser-local WebAssembly Component Model guest, while keeping remote
provider bootstrap fail-closed on the static site.

**Follow-on (2026-08-05):** station-first console (deploy stations from the
provider pool, then examples onto those stations), hello-world try-runtime +
`handlers.mjs`, and OpenSaaS-shaped try-site kit demo.

**UX redesign (2026-08-05):** `/examples/` rebuilt as a Rubberhose film-strip
storyboard (Operate mode, concept seed `116fd7b0`): title-card host stage,
sequential Pool → Ship → Live boards. Replaces the stacked SaaS sidebar card
console. Surface brief: `site/.impeccable/surfaces/site-src-pages-examples.md`.

**Three-stamp IA (2026-08-05):** (1) Pool deploys stations, (2) Ship multi-selects
catalog apps to deploy onto those stations, (3) Live previews hosts and claims
one. App selection moved off the top reel into Ship.

**Critique follow-ups (2026-08-05):** progressive board dimming via `data-phase`,
policy chrome folded into `<details>`, Stage empty uses stamp path (no sad SVG),
claim peaks as Stage title-card + banner, Live board stays on-paper (no soot
CRT), Ship rows badge `APP` so app plates read distinct from Pool stations.

**Honest Bindle→web path (2026-08-05):** Ship hard-gated (no selected apps /
deployable CTA until stations exist). hello-world is only
`bindle((b) => ({ web: b.web(Hello) }))` with a real `@trainable` greet;
Source pane shows `app.ts` alone; WIT guest handlers are derived from the
web entrypoint (not authored). `@hobo/bindles` accepts nameless `bindle(build)`
and instantiates `@trainable` classes on `b.web`.

**Combobox boards + real Wasp OpenSaaS (2026-08-05):** Pool/Ship/Live use
Rubberhose combobox selectlists (single app on Ship). OpenSaaS is real
`wasp new -t saas` under `examples/wasp-opensaas`, packaged as HoBo
container/service Bindle, deployed through `examples:bridge` (Docker Compose
or wasp/railway/wrangler) onto Webernetes/Lakebed/Cloudflare/Railway — WIT
stub kit retired. Pool yard focus shows `examples/try-site/yards/<target>.deploy.ts`.

**Station metaphor props (2026-08-05):** front-elevation tokens (not
bird's-eye): long roof signboard station (`station-generic`) + orthographic
lever left/right (`switch-off` / `switch-on`) from one dual-panel sheet so the
stand stays identical. Style ref depot only; runs under
`media/runs/examples-props-v4/`; shipped in `site/public/examples/props/`.
Meta on hover.

**Temporary Accounts + all-provider anon (2026-08-06):** Cloudflare Environment
Stations + OpenSaaS ship via Temporary Accounts (`/api/cf-temp`, zero permanent
tokens, never `blob:` as Cloudflare). Other yards
(railway/netlify/vercel/webernetes/lakebed/kubernetes/browser-wasm) use
same-origin agent hosts (`/api/anon/:provider`) — real HTTP under `astro dev`.
Live Playwright: `examples:regression`, `examples:regression:opensaas`,
`examples:regression:anon`.

## Delivery

- Branch: `feat/examples-temporary-anon-hosts`
- PR: (open during `/sdlc --finish`)
- Prior merge: [#1008](https://github.com/Tyler-R-Kendrick/HoBo/pull/1008) @ `af7fa3911`
- Stack: single layer
- Unrelated local Headroom, OptimizeXP, `.venv`, media/impeccable package docs,
  and submodule cache changes stay outside this delivery.

## Acceptance

- Repository examples and sparse policies are parsed from tracked source.
- The generated WIT guest executes every exposed example action in component-local state.
- Generated browser assets are digest-verified before execution.
- A sandboxed Environment Station boots and completes a user-visible action.
- Cloudflare Temporary Accounts station + OpenSaaS ship work without permanent API tokens.
- Non-CF yards provision HTTP same-origin anon stations (never `blob:` as remote).
- Site tests, typecheck, clean component generation, build, and PR-base gates pass.

## Finish evidence

- Live Playwright (2026-08-06): CF station PASS; OpenSaaS CF PASS; all 7 anon
  providers station+OpenSaaS PASS; Railway UI same-origin smoke PASS.
- `/sdlc --finish` in progress.
