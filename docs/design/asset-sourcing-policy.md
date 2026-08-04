---
type: Reference
title: "Asset Sourcing Policy for the Control Yard"
description: "Source classes, provenance rules, and license boundaries for HIGHBALL! game assets."
tags: [hobo, design]
---

> **Superseded in part by [ADR-0141](adr/07-portability-extensibility.md#adr-0141).**
> The identity is now a top-down pixel RPG built from vendored CC0 pixel-art
> packs. The pre-1929 public-domain *trace plate* workflow below is retained for
> reference but is no longer the primary path: art is **sourced**, not traced or
> drawn in renderer code. CC0 game-art packs (Kenney and equivalents) are the
> first-choice source; every vendored file keeps its upstream licence file beside
> it and a row in `packages/control-yard/assets/CREDITS.md`.


# Asset Sourcing Policy for the Control Yard

Governs every visual, audio, and font asset that ships in `@hobo/control-yard`
(the HIGHBALL! game surface, [ADR-0140](./adr/07-portability-extensibility.md#adr-0140))
and any future game surface. The design identity is the rubberhose contract in
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

Display and UI fonts must be **SIL OFL** licensed (Chewy already is), vendored
into the repo **with their license text** alongside the font files. No CDN
loading, no converted formats that strip the license, and a CREDITS.md row per
family.

### (d) CC0 pixel/prop art — silhouette reference only

CC0 pixel art and prop sets may be used **only as silhouette or construction
reference**, re-inked by hand to the 2–3px black-and-white rubberhose spec —
**never dropped in raw**. A raw CC0 tile reads as a different game; the ink
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
- The Bo art bible and the DESIGN.md rubberhose contract always win a conflict
  with a sourced asset: if the source can't survive the re-ink, it doesn't ship.
