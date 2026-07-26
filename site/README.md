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
| `src/components/ParallaxTrail.astro` | The scrolling trail band above the hero (see below). |
| `src/components/BoIdle.astro` | Bo standing about — rest, bounce and blink (see below). |
| `src/lib/trail-art.ts` | The trail, poles and grass, drawn at build time. |
| `src/lib/trail-plates.ts` | Picks up supplied artwork from `public/parallax/plates/`. |
| `src/pages/parallax/[layer].svg.ts` | Serves those tiles as static SVGs, one per layer and theme. |
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
- **Design language:** strict black-and-white 1930s cartoon. All artwork is *traced
  from the reference illustrations* (never procedural): `Mascot.astro` is Bo, and
  `src/components/scenes/` holds the five story panels (crossroads, depot, train,
  blimp, steamboat) placed by narrative on the landing page. White paper/black ink by
  day, exact inversion at night — everything routes through `--ink`/`--pop`/theme
  tokens; no hues anywhere (code blocks are grayscale-filtered). Limelight title-card
  display type, Baloo 2 for rounded UI chrome, film-grain overlay, thick ink outlines
  with hard offset shadows. New components must use the tokens, not hardcoded colors.
  Story panels stay traced. The trail band draws only what has to be exact — the ridges
  and wires, which need to be periodic by construction to tile seamlessly. **Scenery
  objects are supplied artwork, not drawn here:** clouds, birds, wind, rocks, flowers and
  plants go in `public/parallax/plates/` and are used as given. Do not hand-author
  replacements for them.
- **No new JS-family files:** repo policy (AGENTS.md) — config is `astro.config.ts`, not `.mjs`.
- **Single lockfile:** never add a `site/pnpm-lock.yaml`; the architecture guard rejects
  nested lockfiles. Dependencies resolve through the root workspace lockfile.

## The parallax trail band

`ParallaxTrail.astro` sits between the header and the hero. It has two sources, and the
split is deliberate.

**Supplied artwork** goes in `public/parallax/plates/`, one file per slot — `sky`,
`clouds`, `hills` — and is used exactly as given, at its own aspect ratio, tiled and
scrolled at that slot's speed. See the README in that folder. An empty slot renders
nothing. **Scenery objects are not to be hand-authored in this repo**; if a plate is
missing, the answer is to supply it, not to draw a substitute.

The `clouds` and `hills` slots ship filled, with props captured from the reference
plates (via the rubber-hose asset site): four cloud crops composed into one tile, and
the horizon strip with its bridge. Each capture is cropped to the rows actually used,
normalized to the same 6-level grayscale + alpha the Bo sheets use, and recomposed on a
full-height canvas so it lands at its scene position — 2.6MB of source crops became
~20KB of plates. Being grayscale is also what makes the night theme free: plates take
`filter: invert(1)` in dark mode, the design system's exact ink/paper inversion.

**Drawn here** are only the things that must be exact to tile: the trail's two ragged
banks, the telephone poles and their wires, fence posts, signposts and grass. These live
in `src/lib/trail-art.ts` and are served as one static SVG per layer and theme.

**How it stays aligned.** Every drawn layer is the same 1200×300 tile, sized in CSS as
`4 × --band-h` wide by `--band-h` tall, so they share one geometry and cannot drift apart
vertically however differently they scroll. A plate gets its own tile width — its aspect
ratio times the band height — so it is never squashed. Either way a layer scrolls by
translating exactly one of its own tile widths, so the wrap lands on identical pixels.
Drawn tiles repeat invisibly because spanning shapes are sums of whole-cycle sines and so
periodic, while discrete props are drawn again at −1200 and +1200. A plate has to repeat
cleanly on its own; nothing mirrors or blends the join for it. `--band-h` is a whole
number at every breakpoint on purpose — a fractional tile width brings back sub-pixel
seams.

**How fast it goes.** Bo is a 36-frame sprite sheet (`public/parallax/bo-walk.png`, a 6×6
grid, downscaled and posterized to the four tones the drawing uses, with the bindle sack
filled white so it does not vanish on a dark ground). Nine frames make a step, eighteen a
stride, and his planted foot tracks backwards about 11px of a 554px frame per frame. At
the size the band draws him and the export's own 50ms frame timing, that is ~42 tile units
a second, which is where `TRAIL_SECONDS` comes from. **Change his size or frame rate and
`TRAIL_SECONDS` has to change with them**, or he skates. Every other layer is a fraction
of that one speed — that fraction is the entire parallax.

**How it stops.** A hovering cursor, a held or tapped finger, the pause button, a hidden
tab and a band scrolled out of view all set one inherited custom property, `--plx-play`,
which every animation in the band reads. Nothing can freeze Bo without freezing the
scenery with him. `prefers-reduced-motion` pins it to paused and hides the button.

## Bo idling

`BoIdle.astro` renders Bo standing still, and every so often he blinks or takes a hop.
One strip, `public/parallax/bo-idle.png`, holds three independent states:

| Frames | State | |
|---|---|---|
| `0` | rest | the still pose, shown when nothing is playing |
| `1`–`10` | bounce | one hop, which lands back on the rest pose |
| `11` | blink | eyes shut, on a body pose that matches rest |

The clips were picked by silhouette rather than by eye. Alpha is identical whether his
eyes are open or shut, so the outline is a pure pose key: the bounce ends **1.78** units
from rest and the blink sits **6.38** from it, both under the **7.55** median step between
neighbouring frames of the source sheet. That is what lets a clip start or stop at any
moment without a visible pop, and it is why the states can be triggered independently
instead of being locked into one long loop.

Each instance runs its own timer, so several Bos on a page drift apart rather than
blinking in unison. `<BoIdle still="rest" />` freezes him on one frame and never
animates; `prefers-reduced-motion` does the same. He sleeps while off screen or on a
hidden tab. Pass `label` for a Bo that should be announced, otherwise he is `aria-hidden`.

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
