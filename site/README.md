# HoBo site

The GitHub Pages site for HoBo: landing page, developer docs, and agent docs, served at
<https://tyler-r-kendrick.github.io/HoBo/>.

Built with [Astro](https://astro.build) in static output mode — no client-side framework.
The only JavaScript shipped to browsers is a small inline theme/nav toggle in
`src/layouts/Base.astro`. Everything else is prerendered HTML + one stylesheet
(`src/styles/global.css`).

## Working on the site

The site is a workspace package (`hobo-site`) in the root pnpm workspace — the repo's
architecture guard requires a single root `pnpm-lock.yaml`. It stays out of the repo's
turbo build/test filters (those target `./packages/*`), so site dependencies only affect
the root install step.

```sh
pnpm install                        # from the repo root
pnpm --filter hobo-site dev        # http://localhost:4321/HoBo/
pnpm --filter hobo-site build      # writes site/dist/
pnpm --filter hobo-site preview    # serve the built dist/
```


## Design system (DESIGN.md)

Visual identity for agents lives in **[`DESIGN.md`](./DESIGN.md)** — Google’s open
[DESIGN.md](https://github.com/google-labs-code/design.md) format (`@google/design.md`).

Aesthetic: **pixel RPG** — the palette and rules are derived from the CC0 Kenney
tilesets the game surface uses, so the site and the yard read as one world.
Runtime CSS remains `src/styles/global.css`; keep the two aligned.

### Repo-wide gate (pre-commit)

Every **web UI** package must ship a root `DESIGN.md`. Discovery:

| Signal | Meaning |
|---|---|
| Path is `site/` | Always a web UI root |
| `"hobo": { "webUi": true }` in package.json | Explicit web UI |
| Depends on `astro` / `next` / `nuxt` / … | Framework-hosted web app |
| Already has `DESIGN.md` | Opt-in visual contract |

Lint all of them with the same CLI:

```sh
pnpm run design:lint                            # all web UI DESIGN.md files (pre-commit)
pnpm --filter hobo-site run design:lint         # this package only
pnpm --filter hobo-site run design:export:css   # Tailwind v4 @theme export
pnpm --filter hobo-site run design:export:dtcg  # W3C design tokens
```

`pnpm run check:relevant:staged` (the pre-commit path) selects `design:lint` when
`DESIGN.md`, `site/` UI sources, or `scripts/check-design-md.mts` change.

Agent skill mirrors: `.agents/skills/design-md` and `.claude/skills/design-md`.

## Layout

| Path | What it is |
|---|---|
| `src/pages/index.astro` | The landing page. |
| `src/components/Logo.astro` | The HoBo mark: a 16×16 pixel tile, tokenized so it flips with the theme. |
| `src/components/{Header,Footer}.astro` | Site chrome; both use `Logo.astro`. |
| `public/fonts/` | Self-hosted display face — *not created yet*, see **Typography** below. |
| `public/pixel/` | Pixel art copied out of the Kenney packs — *not created yet*, see **Pixel art** below. |
| `src/pages/{guide,primitives,testing,reference,crew,roles,agents}/**/*.md` | Docs pages; frontmatter picks the `Docs.astro` layout. Sections: Guide, Primitives, **Testing**, **Reference**, **Crew**, Roles/Agents. |
| `src/nav.ts` | Single source of truth for header + sidebar navigation (all sections). |
| `src/layouts/` | `Base.astro` (head/header/footer/theme) and `Docs.astro` (sidebar + prose). |
| `src/styles/global.css` | The whole design system: tokens, light/dark themes, components. |
| `public/llms.txt` | Machine-readable briefing for AI agents (mirrors the pattern HoBo itself designs for). |

## Conventions

- **Base path:** the site deploys under `/HoBo/`. Internal links in `.md` content are
  written absolute with the base (`/HoBo/guide/...`) because Astro does not rewrite
  markdown hrefs. `.astro` files use the `href()` helper from `src/lib/url.ts` instead.
  If the repo is renamed, update `base` in `astro.config.ts` and these links together.
- **Repository links are chrome-only.** The site header (GitHub icon, top right)
  and footer link to github.com/Tyler-R-Kendrick/HoBo — that is the ONLY sanctioned
  repo linking. Page *content* stays standalone: never link to repo paths like
  `docs/design/` from prose — restate what's needed instead. The canonical sources
  in `docs/design/` inform the content but are not linked.
- **Voice:** playful "homeward bound" theme — the guiding principle is continuous
  migration to the cheapest home that passes policy. Whimsy in the prose, precision in
  the tables and code.
- **Design language:** **pixel RPG** — see `DESIGN.md`. The palette comes from the
  CC0 Kenney tilesets the game surface (`@hobo/control-yard`) is built on, so both
  surfaces read as one world:

  | Token | Hex | Role |
  |---|---|---|
  | `outline` | `#3f2631` | every border and edge |
  | `deep` | `#262b44` | dark ground / dark panels / night |
  | `stone` | `#c0cbdc` | light panel fill — the UI ground by day |
  | `slate` | `#52607c` | secondary chrome, muted text |
  | `grass` | `#84c669` | success, ground accents |
  | `path` | `#eaa56c` | warm highlight, roads |
  | `wood` / `wood-dk` | `#a35422` / `#763b36` | structural warm |
  | `accent` | `#37aaa5` | teal — links, focus, interactive |
  | `danger` | `#c34b35` | rust red — errors, destructive |

  Rules: 16px grid thinking; **integer scaling only** (1×, 2×, 3× — never a
  fractional scale); `image-rendering: pixelated` on every raster sprite (use the
  `.pixel-art` class); hard **2–3px** outlines in `outline`; blocky panels with a
  hard offset shadow — no blur, no glassmorphism, no gradients-as-brand, no
  border radius. Focus rings are `accent`. Body copy stays WCAG AA.
  New components must use the tokens (`--ink`, `--accent`, `--pop`, `--edge`,
  `--drop`, …), never hardcoded hex. Raw hues are exposed as `--pal-*`; everything
  else is a semantic token that day/night re-points.

  **Retired (do not reintroduce):** the rubberhose / Steamboat Willie identity —
  Bo the bindlebug (`Mascot.astro`, `BoIdle.astro`), the five traced story panels
  (`src/components/scenes/`), the parallax trail band and its plates
  (`ParallaxTrail.astro`, `src/lib/trail-*.ts`, `src/lib/bo-walk.ts`,
  `public/parallax/**`), the film-grain overlay, hand-drawn wobble/rotate-on-hover,
  and Chewy display type. All of it was deleted, not disabled.

- **No new JS-family files:** repo policy (AGENTS.md) — config is `astro.config.ts`, not `.mjs`.
- **Single lockfile:** never add a `site/pnpm-lock.yaml`; the architecture guard rejects
  nested lockfiles. Dependencies resolve through the root workspace lockfile.

## Typography

Display type (h1–h3, buttons, badges, brand) is a **pixel face**; body copy is
never set in it — prose stays `system-ui` at 1rem / 1.65 so technical tables and
docs remain readable.

The CC0 Kenney display face is **not vendored yet**. `--font-display` in
`src/styles/global.css` already lists `"Kenney Pixel"` first and falls back to a
chunky monospace stack until the file lands. To finish the job:

1. Copy `packages/control-yard/assets/fonts/KenneyPixel.woff2` (only
   `Chewy-Regular.woff2` is there today) to `public/fonts/kenney-pixel.woff2`.
2. Uncomment the `@font-face` block in `src/styles/global.css` — nothing else
   changes, the family name already matches.

Search the stylesheet for `TODO(pixel-font)` for the same note in place.

## Pixel art

There is no vendored Kenney art in the repo yet, so the landing page is
**typographic**: pixel-plate panels, hard outlines and hard drop shadows built
from tokens, plus the inline 16×16 `Logo.astro` mark. When the packs land under
`packages/control-yard/assets/kenney/`, copy only the sprites the site actually
uses into `public/pixel/` and render them with the `.pixel-art` class at an
**integer** multiple of their native size. Never resample pixel art, never scale
it fractionally, and never hand-author a "close enough" vector substitute.

## Publishing (no Actions)

The site is published by pushing the built output to the **`gh-pages` branch**, which
GitHub Pages serves directly ("Deploy from a branch"). This deliberately avoids any
GitHub Actions dependency. From the repo root:

```sh
pnpm --filter hobo-site run build
cd site/dist
git init -b gh-pages
git add -A
git commit -m "deploy: site @ $(git -C ../.. rev-parse --short HEAD)"
git push --force git@github.com:Tyler-R-Kendrick/HoBo.git gh-pages
cd .. && rm -rf dist/.git
```

Notes:

- `public/.nojekyll` ships in the build so Pages serves Astro's `_astro/` asset
  directory verbatim (Jekyll would otherwise drop underscore-prefixed paths).
- The push is `--force` on purpose: `gh-pages` is a build artifact with disposable
  single-commit history, never a source branch.
- One-time repo setting if Pages isn't already serving: **Settings → Pages →
  Source → Deploy from a branch → `gh-pages` / `(root)`**.
