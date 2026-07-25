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
| `src/pages/{guide,agents,develop}/*.md` | Docs pages; frontmatter picks the `Docs.astro` layout. |
| `src/nav.ts` | Single source of truth for header + sidebar navigation. |
| `src/layouts/` | `Base.astro` (head/header/footer/theme) and `Docs.astro` (sidebar + prose). |
| `src/styles/global.css` | The whole design system: tokens, light/dark themes, components. |
| `public/llms.txt` | Machine-readable briefing for AI agents (mirrors the pattern HoBo itself designs for). |

## Conventions

- **Base path:** the site deploys under `/HoBo/`. Internal links in `.md` content are
  written absolute with the base (`/HoBo/guide/...`) because Astro does not rewrite
  markdown hrefs. `.astro` files use the `href()` helper from `src/lib/url.ts` instead.
  If the repo is renamed, update `base` in `astro.config.ts` and these links together.
- **Content is curated, not mirrored.** Pages summarize and deep-link to the canonical
  sources on GitHub (`docs/design/`, `AGENTS.md`, …) rather than duplicating them, so the
  site stays accurate as the design suite evolves.
- **No new JS-family files:** repo policy (AGENTS.md) — config is `astro.config.ts`, not `.mjs`.
- **Single lockfile:** never add a `site/pnpm-lock.yaml`; the architecture guard rejects
  nested lockfiles. Dependencies resolve through the root workspace lockfile.

## Deployment

`.github/workflows/deploy-pages.yml` builds `site/` and deploys to GitHub Pages on pushes to
`main`. One-time repo setting: **Settings → Pages → Source → GitHub Actions**.
