# Bo's art department

A catalogue of every drawing of Bo — reference sheets, sprite sheets, scenery
plates and the 3D lift — published at `/HoBo/media/`.

It exists because **a sprite sheet shown flat tells you nothing about what it
does.** The sheets play here at their exported cadence, driven from the same
frame geometry the site reads, so the catalogue and the product cannot silently
disagree about how many frames a walk cycle has.

```sh
pnpm --filter hobo-media run dev      # local
pnpm --filter hobo-media run build    # dist/
```

## What lives here, and what does not

| | Source of truth | Here |
|---|---|---|
| `bo-walk`, `bo-walk-left`, `bo-idle`, `bo-stand` | `site/public/parallax/` | reference copies |
| scenery plates | `site/public/parallax/plates/` | reference copies |
| turnaround, expressions, poses, props, `bo.glb` | **here** | originals |

The shipped sprite sheets and plates stay owned by `site/`, because that is what
the live site loads and a second copy in the load path is a second thing to keep
in sync. This package owns the *reference* art — the material you draw or
generate **from**, which the site never serves.

## Two characters

**Bo** is the original — long-bodied, and the only one the site ships. Every
sheet under `sprites/` and every scenery plate is his.

**HoBit Bill** is not Bo. He came out of a turnaround generated *from* Bo's
sheets and landed somewhere visibly different: rounder, squatter, differently
furred. That was a failure of the generation. It is kept on purpose, under its
own name, because the result was good — the alternative was to throw it away or,
worse, to pass it off as Bo. Everything under `reference/bill-*` and the 3D lift
is Bill's.

**Do not mix them.** A Bill pose is not a Bo reference, and generating new Bo
work from Bill's turnaround is precisely how Bo stops being Bo.

## The 3D viewer

`ModelViewer.astro` renders the `.glb` with **three.js**, bundled through Astro
rather than loaded from a CDN: the published page runs under a CSP that blocks
every external host, so an import map pointing at unpkg would work in dev and
render an empty box in production — the worst failure shape there is. The cost
is a ~613KB module, loaded only on this page.

It renders only while the canvas is on screen (an idle WebGL loop is a laptop
fan for nothing), keeps the still render as a poster until the mesh is ready,
and does not auto-spin under `prefers-reduced-motion` — you can still orbit by
hand.

## Identity: inherited, not defined

This surface renders **HoBo Rubberhose**, and it does not get a vote. The
authority is [`site/DESIGN.md`](../site/DESIGN.md) under
[ADR-0149](../docs/design/adr/07-portability-extensibility.md#adr-0149).

**There is deliberately no `media/DESIGN.md`.** `scripts/check-design-md.mts`
treats any directory containing one as a design project with its own identity,
and the repo already carries three — a fourth copy of the same contract is a
fourth thing to drift, and `packages/control-yard/DESIGN.md` has already drifted
from `site/DESIGN.md`. Pointing at the single contract serves the gate's actual
purpose (*"agents share one visual contract"*) better than duplicating it.

The consequence, stated plainly: `pnpm run design:lint` does **not** lint this
package. If this surface ever grows its own visual language, that is the moment
to add a DESIGN.md and accept the fourth identity — not before.

## Bo is asymmetric

Repeated here because it is the failure that keeps recurring: the bindle hangs
from one specific anatomical arm. Mirroring hands it to the other one, which
looks plausible at a glance and is wrong. It has shipped twice — once in the
west walk sheet, once as `<Mascot flip />` on the homepage CTA, directly above
the words "Pack a bindle".

**No asset in this catalogue may be produced by reflecting another.** The
turnaround was drawn as four views for that reason, and the 3D lift ran with
symmetry enforcement off — it would otherwise have "corrected" the bindle by
giving him two, or by deleting it.

## The 3D lift is scaffolding

`reference/bo.glb` was lifted from the four turnaround views to give video
generation a consistent pose and lighting reference. It is **not** a shipping
asset and not a modelled character: it is a generated approximation, and the
drawings remain the identity. Judge new video work against the 2D sheets, not
against the mesh.

## Generating more

The recipe, learned the expensive way — see the closeout notes in
`site/public/parallax/README.md` for the sprite-format half:

- **Do not pass reference images for new poses, expressions or compositions.**
  With `medias` attached, `nano_banana_2` reproduces the reference and ignores
  the prompt — seven sheets came back as byte-identical copies of the input,
  including one that explicitly said "objects only, NO character". It is the
  same reason a generated blink came back with the eyes open.
- **Text-only follows the prompt.** Describe Bo precisely in words and the grid
  sheets, turnarounds and new poses all come out on-model.
- Use references only when you want the *same* pose reproduced faithfully.

## Publishing

The catalogue ships with the main site, not separately:
`pnpm run site:deploy` builds both and publishes this one **nested** at
`/HoBo/media/`. Nested rather than merged, because each Astro build has its own
hashed `_astro/` bundle and a flattened root would let the two fight over that
directory. One deploy commit therefore describes the whole published tree, and
the script refuses to run if either `site/` or `media/` has uncommitted changes.
