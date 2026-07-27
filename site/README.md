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
| `src/components/ParallaxTrail.astro` | The scrolling trail band above the hero (see below); `facing` turns it around. |
| `src/components/BoIdle.astro` | Bo standing about — rest, bounce and blink (see below). |
| `src/lib/trail-art.ts` | The telephone wire — the one thing the band draws for itself. |
| `src/lib/trail-plates.ts` | Picks up supplied artwork from `public/parallax/plates/`. |
| `src/lib/trail-clouds.ts` | The cloud sprites and where each one sits in the tile. |
| `src/lib/bo-walk.ts` | The walk sheets, one per direction, and the refusal to fake a missing one. |
| `src/pages/parallax/[layer].svg.ts` | Serves those tiles as static SVGs, one per layer and theme. |
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
- **Design language:** strict black-and-white 1930s cartoon. All artwork is *traced
  from the reference illustrations* (never procedural): `Mascot.astro` is Bo, and
  `src/components/scenes/` holds the five story panels (crossroads, depot, train,
  blimp, steamboat) placed by narrative on the landing page. White paper/black ink by
  day, exact inversion at night — everything routes through `--ink`/`--pop`/theme
  tokens; no hues anywhere (code blocks are grayscale-filtered). Limelight title-card
  display type, Baloo 2 for rounded UI chrome, film-grain overlay, thick ink outlines
  with hard offset shadows. New components must use the tokens, not hardcoded colors.
  Story panels stay traced. The trail band draws only what cannot be cropped out of a
  plate — which is the telephone wire and nothing else. **Scenery objects are supplied
  artwork, not drawn here:** clouds, hills, poles, ground, birds, wind, rocks, flowers
  and plants go in `public/parallax/plates/` (or `public/parallax/clouds/`) and are used
  as given. Do not hand-author replacements for them.
- **No new JS-family files:** repo policy (AGENTS.md) — config is `astro.config.ts`, not `.mjs`.
- **Single lockfile:** never add a `site/pnpm-lock.yaml`; the architecture guard rejects
  nested lockfiles. Dependencies resolve through the root workspace lockfile.

## The parallax trail band

`ParallaxTrail.astro` sits between the header and the hero. Nearly all of it is supplied
artwork; the split is deliberate.

**Supplied artwork** goes in `public/parallax/plates/`, one file per slot, and is used
exactly as given, at its own aspect ratio, tiled and scrolled at that slot's speed. See
the README in that folder for the slot table and how the shipped plates were composed.
An empty slot renders nothing. **Scenery objects are not to be hand-authored in this
repo**; if a plate is missing, the answer is to supply it, not to draw a substitute.

Everything in the band is cut out of the reference plates: four clouds, three telephone
poles, and the ground strip — split at the emptiest row in it into the part behind Bo
and the near bank in front of him. Each capture is cropped to the rows actually used,
normalized to the same 6-level grayscale + alpha the Bo sheets use, and recomposed on a
full-height canvas so it lands at its scene position: 2.6MB of source crops became ~95KB
of plates.

**The clouds are sprites, not a plate.** They live in `public/parallax/clouds/` with
their placements in `src/lib/trail-clouds.ts`, because each one squashes and bobs on its
own and a single background image can only move as a whole. The layer is a track of
identical segments scrolling by exactly one segment, so it loops on the same guarantee a
tiled plate does.

**Night is per-layer, not one filter.** Grayscale artwork makes it cheap, but a single
`invert(1)` across the band is wrong: it turns clouds into holes in the sky and
telephone poles into white posts. Each slot declares its own treatment — `invert` for
line art, `keep` for artwork whose own ink is the point, `rim` for silhouettes that
should stay dark and take an outline instead — and each is graded by a `tone` that
tracks the parallax speed, so the far layers sit back in the dark instead of all
arriving at the same brilliant white. The plates folder README has the reasoning.

**Drawn here** is one thing only: the wire between the poles, in `src/lib/trail-art.ts`,
served as one static SVG per theme. A wire cannot be cropped out of a plate the way an
object can — it has to span whatever gap the poles happen to leave and close across the
tile seam — so it is generated, as the stroked catenary it actually is. Everything else
that used to be drawn here (ridges, posts, signposts, grass) was replaced by the
captured props and deleted.

**How it stays aligned.** A drawn layer is a 1200×300 tile, sized in CSS as `4 × --band-h`
wide by `--band-h` tall. A plate gets its own tile width — its aspect ratio times the band
height — so it is never squashed, and it is composed on a full-height canvas against that
same 300-unit scene, which is what keeps it registered with everything else. Either way a
layer scrolls by translating exactly one of its own tile widths, so the wrap lands on
identical pixels. A plate has to repeat cleanly on its own; nothing mirrors or blends the
join for it at runtime, which is why the ground plates are mirrored into `A A'` tiles when
they are composed. `--band-h` is a whole number at every breakpoint on purpose — a
fractional tile width brings back sub-pixel seams.

**Which way he walks.** `<ParallaxTrail facing="west" />` turns him around: it picks the
west sheet and reverses every layer, so the world slides the other way and his feet still
plant. His own two animations never reverse — the gait plays forward whichever way he is
pointed — and `animation-direction` does not inherit, so the cloud squash inside the
cloud track is left alone too.

**The west sheet is a separate drawing, not a flip.** Bo is not symmetric: the bindle
hangs from one specific anatomical arm, and mirroring hands it to the other one. Walking
west that arm becomes the far arm, behind the fur silhouette, with the bundle trailing to
screen-right — which is how the supplied sheet draws it. `public/parallax/README.md`
carries the brief, how the sheet was rebuilt from the supplied artwork, and the one thing
that could not be verified: the west poses do not carry a consistent ground contact, so
his feet do not plant against the scrolling ground the way they do going east. If a
sheet for a direction is missing, `facing` **fails the build** with that reason rather
than falling back — a mirrored sheet looked plausible enough to ship once already.

**How fast it goes.** Bo is a 36-frame sprite sheet (`public/parallax/bo-walk.png`, a 6×6
grid, downscaled and posterized to the four tones the drawing uses, with the bindle sack
filled white so it does not vanish on a dark ground). Nine frames make a step, eighteen a
stride, and his planted foot tracks backwards about 11px of a 554px frame per frame. At
the size the band draws him and the export's own 50ms frame timing, that is ~52 tile units
a second, which is where `TRAIL_SECONDS` comes from. **Change his size or frame rate and
`TRAIL_SECONDS` has to change with them**, or he skates — his stride length scales with
him, so the two move together. Every other layer is a fraction of that one speed, and
that fraction is the entire parallax.

`TRAIL_SECONDS` is defined per 1200-unit tile, and each layer's duration is derived from
it *and that layer's own tile width*. This is not decoration: a plate whose aspect is not
4:1 covers a different distance per loop, so a duration taken straight from
`TRAIL_SECONDS` would move it at the wrong speed and the parallax you get would not be
the parallax the slot table claims.

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
