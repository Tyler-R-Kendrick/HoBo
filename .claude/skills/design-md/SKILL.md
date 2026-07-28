---
name: design-md
description: Google DESIGN.md visual identity for coding agents. HoBo site truth is site/DESIGN.md (rubberhose / Steamboat Willie / Cuphead). Lint with designmd.
---

# design-md (HoBo)

## When to use

- Editing `site/` UI, CSS, scenes, or components
- Generating UI that must match the public Pages aesthetic
- Changing design tokens or theme (light/dark inversion)

## Source of truth

| Artifact | Role |
|---|---|
| **`site/DESIGN.md`** | Agent-facing Google [DESIGN.md](https://github.com/google-labs-code/design.md) contract |
| **`site/src/styles/global.css`** | Runtime CSS tokens implementation |
| **`pnpm --filter hobo-site run design:lint`** | Structural + WCAG gate (`designmd lint`) |

## Aesthetic (non-negotiable)

**Steamboat Willie / Cuphead / Fleischer rubberhose** — thick ink outlines, hard sticker shadows, film grain, Chewy title-card type, black-and-white day/night inversion. Bo the bindlebug is soot with googly eyes. Traced art only.

### Do

- Ink (`#101010`) + paper (`#ffffff`) as the base language
- Spark vermillion only for focus / rare emphasis
- Squash-and-stretch motion; respect `prefers-reduced-motion`
- Keep night as token inversion of day

### Don't

- SaaS blues, purple AI glow, glassmorphism, multi-stop brand gradients
- Replace traced scenes with stock isometric / flat AI blobs
- Thin outlines below ~2px on primary chrome

## CLI (installed on `hobo-site`)

```bash
pnpm --filter hobo-site run design:lint          # 0 errors required
pnpm --filter hobo-site run design:export:css    # Tailwind v4 @theme export
pnpm --filter hobo-site run design:export:dtcg   # W3C DTCG tokens
pnpm --filter hobo-site run design:spec          # print format spec
```

Package: `@google/design.md` (bin aliases `designmd` / `design.md`).

## Workflow

1. Read `site/DESIGN.md` front matter tokens + Overview.
2. Edit CSS/components using those tokens (or update DESIGN.md first, then CSS).
3. Run `design:lint` — fix errors and serious contrast warnings before PR.
4. Site content still follows `site/README.md` (base `/HoBo/`, no raw `docs/design/` links in prose).

## Spec

- Format: https://github.com/google-labs-code/design.md  
- Stitch context (optional external design tool): https://stitch.withgoogle.com/
