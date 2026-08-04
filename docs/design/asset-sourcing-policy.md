---
type: Reference
title: "Asset Sourcing Policy for the Control Yard"
description: "Source classes, provenance rules, and license boundaries for HIGHBALL! game assets."
tags: [hobo, design]
---

> **Superseded in part by [ADR-0148](adr/07-portability-extensibility.md#adr-0148).**
> The identity is now a top-down pixel RPG built from vendored CC0 pixel-art
> packs. The pre-1929 public-domain *trace plate* workflow below is retained for
> reference but is no longer the primary path: art is **sourced**, not traced or
> drawn in renderer code. CC0 game-art packs (Kenney and equivalents) are the
> first-choice source; every vendored file keeps its upstream licence file beside
> it and a row in `packages/pixel-village/assets/CREDITS.md`.


# Asset Sourcing Policy for the Control Yard

Governs every visual, audio, and font asset that ships in a HoBo surface. The
design identity depends on which surface: the product surfaces (`site/`,
`@hobo/control-yard`) are **HoBo Rubberhose** (`site/DESIGN.md`), and
`@hobo/pixel-village` — the separate pixel-RPG game project — is **HoBo Pixel**
(`packages/pixel-village/DESIGN.md`). See
[ADR-0149](./adr/07-portability-extensibility.md#adr-0149). This policy governs
where the raw material may come from and what provenance must travel with it,
whichever identity applies.

One rule crosses both, carried over from
[ADR-0148](./adr/07-portability-extensibility.md#adr-0148): **art is authored as
art and vendored as assets.** Assembling props from `rect`/`line` primitives
inside a renderer is prohibited on every surface — that practice is what
produced the rejected build, and it is a defect regardless of which identity is
being rendered.

Two artifacts enforce the policy:

- **A per-surface provenance ledger** — every sourced or derived asset gets a
  row: what it is, where it came from, license, and (for traced plates) source
  work + timestamp.
  - `packages/pixel-village/assets/CREDITS.md` — the vendored Kenney CC0 packs
    and anything derived from them.
  - **Gap:** `packages/control-yard/` ships art (Bo, chrome, guests, particles,
    trail plates) with **no** ledger. It never had one — the ledger arrived with
    the pixel packs and left with them under
    [ADR-0149](./adr/07-portability-extensibility.md#adr-0149). Recorded here
    rather than papered over; it predates that ADR and is not discharged by it.
- **[`scripts/check-licenses.ts`](../../scripts/check-licenses.ts)** — the
  `ALLOWED` SPDX allowlist that gates inbound licenses repo-wide. Asset licenses
  are judged against the same list; anything off-list requires the same
  explicit review-note process the script documents.

## Source classes

### (a) Pre-1929 US public-domain film frames — reference/trace plates

Frames from US works published before 1929 (e.g. *Steamboat Willie*, 1928;
early Fleischer shorts) may be used as **reference and trace plates** for the
Spriterrific pipeline (`packages/control-yard/assets/guests/SPRITERRIFIC_PROMPT.md`).
Conservative rules, all mandatory:

- **Verify per-work public-domain status before use.** "Old" is not a status;
  check the specific work's US publication date and renewal history. When in
  doubt, don't trace it.
- **Record provenance per traced plate** in
  `packages/pixel-village/assets/CREDITS.md`: source work title, year, and the
  timestamp of the traced frame.
- **Derived ORIGINAL characters only.** Trademark rights survive copyright
  expiry — a recognizable protected character (Mickey silhouette, Betty Boop,
  Bimbo…) may never appear, even traced from a PD frame. Trace the *motion and
  construction*, not the identity.
- **Bo remains the sole protagonist** per the art bible
  (`site/public/parallax/README.md`). Traced material feeds NPCs and props;
  it never replaces or competes with Bo.

### (b) CC0 audio — the juice layer

CC0 audio (Kenney audio packs, freesound CC0 uploads) is allowed for gameplay
juice — stamps, semaphore clanks, whistle hits. Each pack or clip gets a
CREDITS.md row. Verify the individual upload is actually CC0 (freesound hosts
mixed licenses); CC-BY audio falls under class (e), not here.

### (c) Fonts — OFL, vendored

Display and UI fonts must carry a permissive licence on the allowlist — Kenney's pixel faces are CC0. (An earlier revision of this doc claimed Chewy was OFL; it is Apache-2.0, and it is no longer used.) No CDN
loading, no converted formats that strip the license, and a CREDITS.md row per
family.

### (d) **CC0 pixel/prop art — used directly.** Vendored packs (Kenney and
    equivalents) are the first-choice source and are used **as shipped**,
    unmodified, with their upstream licence file beside them and a row in
    `packages/pixel-village/assets/CREDITS.md`. Any modification (e.g. a crop to
    satisfy a grid invariant) must be disclosed in that row.
pass is what makes it HoBo. Re-inked derivations get a CREDITS.md row naming
the reference source.

### (e) Disallowed without explicit review

- **CC-BY-NC, CC-BY-SA, or GPL art** — not on the
  [`scripts/check-licenses.ts`](../../scripts/check-licenses.ts) allowlist;
  NC conflicts with the repo's outbound MIT posture and SA/GPL are viral.
  Using any such asset requires the same explicit allowlist review note the
  script requires for dependencies.
- **Raw marketplace drops** — purchased or bundled asset-store packs pasted in
  unmodified, regardless of the store's license claims.
- **AI-generated art outside the traced Spriterrific provenance pipeline** —
  generative output is admissible only as an intermediate inside the
  Spriterrific trace flow, where the final asset is a hand-checked ink pass
  with recorded provenance. Untraceable "AI app glop" is banned outright
  (see the DESIGN.md don'ts).

## Enforcement

- A game-surface PR that adds or changes assets without matching
  `packages/pixel-village/assets/CREDITS.md` rows is incomplete.
- License questions resolve against the `ALLOWED` set in
  [`scripts/check-licenses.ts`](../../scripts/check-licenses.ts); additions to
  that set need a dated review note, same as dependency licenses.
- The DESIGN.md pixel contract (ADR-0148) always wins a conflict
  with a sourced asset: if the source can't survive the re-ink, it doesn't ship.
