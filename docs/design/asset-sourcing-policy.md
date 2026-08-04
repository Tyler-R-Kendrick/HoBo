---
type: Reference
title: "Asset Sourcing Policy for the Control Yard"
description: "Source classes, provenance rules, and license boundaries for HIGHBALL! game assets."
tags: [hobo, design]
---

> **Superseded in part by [ADR-0146](adr/07-portability-extensibility.md#adr-0146).**
> The identity is now a top-down pixel RPG built from vendored CC0 pixel-art
> packs. The pre-1929 public-domain *trace plate* workflow below is retained for
> reference but is no longer the primary path: art is **sourced**, not traced or
> drawn in renderer code. CC0 game-art packs (Kenney and equivalents) are the
> first-choice source; every vendored file keeps its upstream licence file beside
> it and a row in `packages/control-yard/assets/CREDITS.md`.


# Asset Sourcing Policy for the Control Yard

Governs every visual, audio, and font asset that ships in `@hobo/control-yard`
(the HIGHBALL! game surface, [ADR-0145](./adr/07-portability-extensibility.md#adr-0145))
and any future game surface. The design identity is the pixel-RPG contract in
`site/DESIGN.md` / `packages/control-yard/DESIGN.md`; this policy governs where
the raw material may come from and what provenance must travel with it.

Two artifacts enforce the policy:

- **`packages/control-yard/assets/CREDITS.md`** — the per-asset provenance
  ledger. Every sourced or derived asset gets a row: what it is, where it came
  from, license, and (for traced plates) source work + timestamp.
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
  `packages/control-yard/assets/CREDITS.md`: source work title, year, and the
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
    `packages/control-yard/assets/CREDITS.md`. Any modification (e.g. a crop to
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
  `packages/control-yard/assets/CREDITS.md` rows is incomplete.
- License questions resolve against the `ALLOWED` set in
  [`scripts/check-licenses.ts`](../../scripts/check-licenses.ts); additions to
  that set need a dated review note, same as dependency licenses.
- The DESIGN.md pixel contract (ADR-0146) always wins a conflict
  with a sourced asset: if the source can't survive the re-ink, it doesn't ship.
