# `@hobo/control-yard` — agent instructions

Game-first control-plane UI (ADR-0135). Projections only; Bo art bible locked;
asset index is the sole clip metadata source.

## Evidence is mandatory (do not claim without files)

**Self-report is not acceptance.** A feature is not done until Playwright has
written **screenshots and MP4 recordings** under this package and the
evidence manifest validates them.

### Required evidence layout

```text
public/shots/
  evidence-manifest.json     # written by `pnpm run play` / `pnpm run evidence`
  visual-report.json         # automated check log
  01-boot-live.png
  02-connection-bay-sheet.png
  03-cost-booth.png
  04-policy-board.png
  05-error-bunker.png
  06-after-actions.png
  07-walk.png
  canvas-only.png
  recordings/
    01-yard-loop.mp4           # full loop: boot → zones → sheets
    02-connection-sheet.mp4    # connection bay open + confirm path
    03-bo-walk-east-west.mp4   # AnimTest east then west (not mirrored)
    04-rail-cost-doctor.mp4    # policy / cost / error bunker sheets
  baselines/                   # imgdiff baselines (gamedev/playwright skills)
```

### Agent rules

1. **Capture before claim.** After any UX/game-loop/asset change, run:

   ```bash
   pnpm --filter @hobo/control-yard run evidence
   ```

   This must produce non-empty PNGs **and** MP4s, then write
   `public/shots/evidence-manifest.json` with byte sizes + sha256 digests.

2. **Read the evidence.** Open/read at least:
   - one full-yard PNG
   - east + west AnimTest PNGs (bindle arm must not be a horizontal flip)
   - the primary MP4 (`01-yard-loop.mp4`)

   Use the image/video tools available to you. If you cannot open an MP4, run
   `ffprobe` and extract key frames with ffmpeg, then read those PNGs.

3. **Manifest is the gate.** `pnpm run evidence:check` fails when:
   - any required path is missing
   - any file is under the minimum size (PNG ≥ 2KB, MP4 ≥ 10KB)
   - digests in the manifest do not match on-disk files

4. **No “it passed in my head.”** Unit tests and architecture:guard are
   necessary but not sufficient for visual features. Screenshot + MP4
   evidence is required for zone interaction, Bo walk E/W, generative
   sheets, traffic/cost meter, and guest agents.

5. **Recordings must show motion.** Static single-frame “videos” are invalid.
   Prefer ≥ 2s wall-clock recording of interactive play. Use Playwright
   `recordVideo` (webm) then `ffmpeg` → H.264 MP4 (`yuv420p`, `+faststart`).

6. **Builderpack skills.** Use installed skills under `.agents/skills/`:
   - `gamedev-assets` — probe/coverage before loading sheets
   - `phaser-gamedev` — measure-before-load STOP rule
   - `playwright-testing` — `__TEST__` seam, deterministic `?test=1&seed=…`

7. **Sync UX proof.** When evidence changes, copy/link key shots + MP4s into
   `src/draft/exp-proofs/ux/control-yard/assets/evidence/` in the same change
   (see that package’s `AGENTS.md`).

## Experiential validation is part of acceptance

Screenshots prove a frame *rendered*. They do not prove the yard is **alive**,
**operable**, or **honest**. Those are separate, automated gates — a UX change
is not done until they pass (or until a failure is written up as a product gap,
never silenced).

### The gates

| Gate | Command | Blocking? | What it decides |
| --- | --- | --- | --- |
| **Core loop** | `pnpm run test:behavior` | yes | The waybill desk offers exactly the real work the projection contains; Highball only from a genuinely clean board. Headless — no browser. |
| **Liveness** | `pnpm --filter @hobo/control-yard run e2e` | yes | Every scenario beat with `mustChange` moves pixels *inside its own region* **and** satisfies its `seamPredicate`. Pixels changed AND the seam agrees why. |
| **Motion / stillness duality** | same | yes | The idle yard reads alive with motion allowed, and holds still — never blank — under `prefers-reduced-motion`, within `docs/validation/feel-budgets.json`. |
| **Clip coverage** | same | yes | Every character clip in `assets/assets_index.json` is reachable from some scenario+tick, or is on `KNOWN_UNBOUND_CLIPS` **with a written reason**. |
| **Access + trust** | same | yes | Keyboard-only path to a confirmed command; visible focus on every keyboard stop in both themes; no serious/critical axe violations on the DOM chrome; SIMULATED provenance present in demo and absent live. |
| **HYX vision review** | `run review:experience` | no | Advisory 0-3 scores for the `auto-visual` rubric items. Writes `public/shots/experience-review.json`; **this report must exist** before claiming a milestone. |
| **HYX drift** | `run review:drift` | no (`--strict` opts in) | Fails when any rubric item's median dropped >= 1.0 vs its trailing-5 median. **A HYX score is required at milestones.** |

### Rules

1. **Assert through the seam, not through baselines.** The suite drives
   `window.__TEST__` (`loadScenario` / `advanceToTick` / `setTheme` /
   `selectZone` / `runAction` / `advanceFrame`) and derives every pixel region
   from `YARD_LAYOUT` or a scenario's `expectedBeats[].region` at runtime.
   **Never hard-code prop coordinates and never add a golden-image baseline** —
   the art is expected to move; the semantics are not.
2. **A failing experiential gate is a finding, not a flake.** There are no
   retries (`playwright.config.ts` sets `retries: 0`). If a spec fails because
   a feature is missing, leave it red and report it; do not weaken the
   assertion. If it fails because the art moved, make the assertion structural.
3. **Adding a scenario means adding its beats.** A new `YardScenario` without
   `expectedBeats` is invisible to the liveness gate.
4. **`review:experience` never blocks.** It exits 0 and writes
   `{"skipped": true, ...}` when `ANTHROPIC_API_KEY` is absent.
5. **The e2e harness never writes into `public/`.** `scripts/demo-harness.mts`
   bundles `src/main.ts` into a scratch dir and serves it at `/dist/yard.js`,
   so the suite and the evidence tour cannot clobber each other.

## Commands

```bash
pnpm --filter @hobo/control-yard run assets:validate
pnpm --filter @hobo/control-yard run assets:coverage
pnpm --filter @hobo/control-yard test
pnpm --filter @hobo/control-yard run evidence      # capture screenshots + MP4s
pnpm --filter @hobo/control-yard run evidence:check
pnpm --filter @hobo/control-yard run e2e           # feel + liveness + access-trust
pnpm --filter @hobo/control-yard run review:experience   # advisory HYX vision pass
pnpm --filter @hobo/control-yard run review:drift        # advisory HYX regression watch
pnpm run test:behavior                             # headless core-loop acceptance
```

## Non-goals

- Live cloud E2E
- Hand-edited generated codegen outside asset index
- **Assembling props from rects and lines in the renderer.** Art is sourced
  from the vendored CC0 packs (ADR-0148); primitive-drawn scenery is what
  produced the surface this replaced.
