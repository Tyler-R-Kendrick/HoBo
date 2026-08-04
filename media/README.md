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
