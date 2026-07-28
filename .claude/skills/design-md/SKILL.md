---
name: design-md
description: Google DESIGN.md visual identity for coding agents. HoBo site truth is site/DESIGN.md (rubberhose / Steamboat Willie / Cuphead). Lint with designmd; pre-commit runs pnpm run design:lint for all web UI packages.
---

# design-md (HoBo)

## When to use

- Editing `site/` UI, CSS, scenes, or components
- Generating UI that must match the public Pages aesthetic
- Changing design tokens or theme (light/dark inversion)
- Adding a new web UI package (must ship `DESIGN.md`)

## Source of truth

| Artifact | Role |
|---|---|
| **`site/DESIGN.md`** | Agent-facing Google [DESIGN.md](https://github.com/google-labs-code/design.md) contract |
| **`site/src/styles/global.css`** | Runtime CSS tokens implementation |
| **`pnpm run design:lint`** | Repo-wide gate — every web UI `DESIGN.md` (pre-commit) |

## Aesthetic (non-negotiable)

**Steamboat Willie / Cuphead / Fleischer rubberhose** — thick ink outlines, hard sticker shadows, film grain, Chewy title-card type, black-and-white day/night inversion. Bo the bindlebug is soot with googly eyes. Traced art only. CTAs are **cartoon signage**, not pill ellipses.

### Do

- Ink (`#101010`) + paper (`#ffffff`) as the base language
- Spark vermillion only for focus / rare emphasis
- Squash-and-stretch motion; respect `prefers-reduced-motion`
- Keep night as token inversion of day

### Don't

- SaaS blues, purple AI glow, glassmorphism, multi-stop brand gradients
- Replace traced scenes with stock isometric / flat AI blobs
- Thin outlines below ~2px on primary chrome
- Pill `border-radius: 999px` buttons

## Web UI discovery

A package is a web UI if any of:

1. Path is `site/`
2. `"hobo": { "webUi": true }` in package.json
3. Depends on `astro` / `next` / `nuxt` / `@sveltejs/kit` / …
4. Already has a root `DESIGN.md`

Missing `DESIGN.md` on a web UI package **fails** `pnpm run design:lint`.

## CLI

```bash
pnpm run design:lint                             # ALL web UI DESIGN.md (pre-commit)
pnpm --filter hobo-site run design:lint          # site only
pnpm --filter hobo-site run design:export:css
pnpm --filter hobo-site run design:export:dtcg
pnpm --filter hobo-site run design:spec
```

Package: `@google/design.md` (bins `designmd` / `design.md`).

## Workflow

1. Read `site/DESIGN.md` (or the package’s DESIGN.md) front matter + Overview.
2. Edit CSS/components using those tokens (or update DESIGN.md first, then CSS).
3. Run `pnpm run design:lint` before PR — pre-commit will re-run via `check:relevant:staged`.
4. Site content still follows `site/README.md` (base `/HoBo/`, no raw `docs/design/` links in prose).

## Spec

- Format: https://github.com/google-labs-code/design.md
- Stitch context (optional): https://stitch.withgoogle.com/
