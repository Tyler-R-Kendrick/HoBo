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

## Layout

| Path | What it is |
|---|---|
| `src/pages/index.astro` | The landing page. |
| `src/pages/{guide,primitives,agents}/*.md` | Docs pages; frontmatter picks the `Docs.astro` layout. |
| `src/nav.ts` | Single source of truth for header + sidebar navigation. |
| `src/layouts/` | `Base.astro` (head/header/footer/theme) and `Docs.astro` (sidebar + prose). |
| `src/styles/global.css` | The whole design system: tokens, light/dark themes, components. |
| `public/llms.txt` | Machine-readable briefing for AI agents (mirrors the pattern HoBo itself designs for). |

## Conventions

- **Base path:** the site deploys under `/HoBo/`. Internal links in `.md` content are
  written absolute with the base (`/HoBo/guide/...`) because Astro does not rewrite
  markdown hrefs. `.astro` files use the `href()` helper from `src/lib/url.ts` instead.
  If the repo is renamed, update `base` in `astro.config.ts` and these links together.
- **No repository references.** The repo is private; the site is standalone product
  developer documentation. Never link to github.com/Tyler-R-Kendrick/HoBo (or any repo
  path like `docs/design/`) from published pages — restate what's needed instead. The
  canonical sources in `docs/design/` inform the content but are not linked.
- **Voice:** playful "homeward bound" theme — the guiding principle is continuous
  migration to the cheapest home that passes policy. Whimsy in the prose, precision in
  the tables and code.
- **Design language:** storybook cartoon line-art starring **Bo the bindlebug**
  (`src/components/Mascot.astro`, also the logo and favicon): thick ink outlines, hard
  offset "sticker" shadows, dashed rules, puffy `Cloud.astro` clouds, Baloo 2 display
  type. Ink/paper invert between themes via the `--ink`/`--pop` custom properties —
  new components should use those tokens, not hardcoded colors.
- **No new JS-family files:** repo policy (AGENTS.md) — config is `astro.config.ts`, not `.mjs`.
- **Single lockfile:** never add a `site/pnpm-lock.yaml`; the architecture guard rejects
  nested lockfiles. Dependencies resolve through the root workspace lockfile.

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
