# SDLC state — HIGHBALL: gamified pixel-RPG control plane

**Phase:** 5 — finish (integration merged; PR #1026 open; review fixes landed)
**Branch:** `worktree/rapid-meadow-3f6e`
**Entered the loop late:** this work began as a direct redesign request, not via
`/sdlc` phases 1–4, so there is no brainstorm/plan/Linear trail behind it. It is
being closed out through the loop's Done gate rather than retrofitted backwards.

## What shipped

| Slice | Outcome |
|---|---|
| `@hobo/yard-world` | New zero-dep world model promoted from the `otel-office` draft (51 tests) |
| `@hobo/control-api` | Demo mode, world snapshot/stream SSE, OTLP ingest, deployment + credential-audit views |
| `@hobo/management` | `projectDeploymentView` / `projectCredentialAudit`; provenance fields on synthetic signals |
| `@hobo/control-yard` | Phaser host replacing the hand-rolled canvas; waybill/stamp approval loop; village renderer |
| `@hobo/cli` | First-class `--demo` / `--demo-seed` / `--host` / `--home` for `hobo serve control` |
| `site/` | Marketing site moved to the pixel identity (138 pages) |
| Governance | ADR (yard v2) + ADR (pixel identity); DESIGN.md rewritten, mirrors byte-identical |
| Validation | HYX rubric, playtest protocol, 29 e2e specs, cucumber core loop, evidence pipeline |

## Decisions

- **Art is sourced, never drawn in renderer code.** The first redesign attempt
  assembled props from rects/lines because the contract mandated a style while
  supplying no art; the owner rejected it. Recorded as a binding rule in the
  pixel-identity ADR.
- **Rubberhose identity retired repo-wide** (owner-directed): Bo sprites, action
  sheets, derived bindlebugs and parallax plates removed; Kenney CC0 packs
  vendored with licences + per-asset CREDITS.
- **Done means observed, not asserted:** the liveness/duality gates repeatedly
  caught real dead regions; each was fixed rather than the assertion weakened.

## Integration findings (this phase)

- **ADR numbering collision.** `origin/main` now occupies ADR-0147…0144. This
  branch independently used 0140 and 0141. Both renumber to the next free
  numbers; every reference updated by the coordinator (single writer).
- Branch base is 71 commits behind `origin/main`; integration merge required.

## Open / not done

- Human playtest round (HYX ONB-1 and the two core-loop timing items are
  unscored by design — they need real operators, protocol is written).
- Rolling stock is still drawn as rectangles: no vendored pack ships a 16px rail
  car. Flagged rather than substituted with an off-style prop.
- Crew/incident mechanics remain designed but unbuilt (no `crew.*` runtime).

## Done gate — how it is satisfied here

GitHub Actions is **off by owner decision** (all 12 repo workflows are
`disabled_manually`; no runner minutes are to be spent). The SDLC rule "GitHub
reports the PR checks green" therefore cannot be satisfied and is **replaced by
the local hook gate plus an independent agent review**:

- **Hook gate** — `.githooks/pre-commit` runs `generated:guard` +
  `check:relevant:staged`. Verified against `origin/main` for every package this
  branch touches. `@hobo/hobo` fails identically on `origin/main`
  (11 failed / 205 passed), i.e. pre-existing and not introduced here — worth
  fixing separately, because a permanently-red hook trains everyone to
  `--no-verify` and then enforces nothing.
- **Independent review** — a reviewer that did not write the code found 5
  blockers and 11 should-fixes; all blockers and the substantive should-fixes
  are fixed in `c708902de`. Notably it caught an unauthenticated,
  cross-origin-writable OTLP path that rendered as real unbadged telemetry, two
  gates certifying deleted capabilities, and 175MB of scratch swept into the
  merge.
- The only GitHub status (CodeRabbit) reports "pass" but actually **skipped** —
  890 files exceeded its 150-file limit. It is not evidence of review.

## Honest caveats carried into merge

- `@hobo/hobo` package tests are red on `main` and stay red here.
- The e2e Playwright suite is not wired into any automated runner (CI is off);
  it must be run locally via `pnpm --filter @hobo/control-yard run e2e`.
- Human playtest round (HYX ONB-1 + two core-loop timing items) still unscored.
