---
type: Reference
title: "Try HoBo browser WIT delivery state"
description: "Durable SDLC state for the repository-backed Examples console and browser-local WIT Environment Station."
tags: [hobo, plans, sdlc, site, examples, wit]
---

# Initiative: Try HoBo browser WIT

**Phase:** closed  
**Slug:** `try-hobo-browser-wit`  
**Opened:** 2026-08-02  
**Host:** Cursor (Composer)

## Goal

Ship the repository-backed `/examples/` console with sparse policy planning and
a real browser-local WebAssembly Component Model guest, while keeping remote
provider bootstrap fail-closed on the static site.

**Temporary Accounts + all-provider anon (2026-08-06):** Cloudflare Environment
Stations + OpenSaaS ship via Temporary Accounts (`/api/cf-temp`, zero permanent
tokens, never `blob:` as Cloudflare). Other yards
(railway/netlify/vercel/webernetes/lakebed/browser-wasm) use
same-origin agent hosts (`/api/anon/:provider`) — real HTTP under `astro dev`.
Live Playwright: `examples:regression`, `examples:regression:opensaas`,
`examples:regression:anon`.

## Delivery

- Branch: `feat/examples-temporary-anon-hosts`
- PR: [#1048](https://github.com/Tyler-R-Kendrick/HoBo/pull/1048)
- Merge: `e2012e5dea44d7ea42118e4ce74ab7a35138595f` (squash, 2026-08-06)
- Pages: `pnpm run site:deploy` @ merge SHA; #1049 fixed nested gitignore so
  runtime could be staged. **WIT wasm omitted from `gh-pages`** — Pages legacy
  builds fail/hang on ~25MB wasm; deploy ships catalog + `runtime/PAGES.md`.
- Stack: single layer

## Acceptance

- Cloudflare Temporary Accounts station + OpenSaaS ship work without permanent API tokens.
- Non-CF yards provision HTTP same-origin anon stations (never `blob:` as remote).
- GitHub Pages `/HoBo/examples/` includes catalog (WIT wasm local-only; see
  `scripts/deploy-site.mts`).

## Finish evidence

- Live Playwright (2026-08-06): CF / OpenSaaS CF / anon matrix PASS.
- `/sdlc --finish`: #1048 + #1049 + #1050 squash-merged (local `agent:check` /
  githooks only — do not gate on or retrigger Action runners).
- `site:deploy` pushed `gh-pages` tip with Examples catalog; WIT wasm omitted.
  Agent must not poll/cancel/`POST …/pages/builds` for promote.
