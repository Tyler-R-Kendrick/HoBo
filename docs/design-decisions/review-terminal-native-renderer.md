---
type: Architecture Decision Record
title: Native HoBo review terminal (reject Hunk / OpenTUI)
description: The durable-review TTY pane is a HoBo-owned rubberhose renderer. Hunk and OpenTUI were evaluated and not vendored.
tags: [hobo, code, review, tui]
---

# Native HoBo review terminal renderer

**Status:** Accepted (Swarm G, durable review)

## Context

HoBo Code already owns its TTY chrome: `InteractiveShell` rides
`@earendil-works/pi-tui` as a *library* while HoBo paints every visible line
(`packages/code/ARCHITECTURE.md`, `site/DESIGN.md`). The durable-review
aggregate (`ReviewSnapshot`, generations, coverage, threads, exact-effect
pending reviews) needs a keyboard-only terminal pane.

[Hunk](https://github.com/modem-dev/hunk) (modem-dev/hunk, OpenTUI + Pierre
diffs) is the obvious off-the-shelf review-first terminal viewer. It already
ships unified / split / stacked streams, sticky file headers, a sidebar, and
a reusable `HunkDiffView` / `HunkReviewStream` OpenTUI component. The
question was whether to vendor that renderer or write a native one.

## Options

### A. Vendor Hunk / `hunkdiff/opentui`

- **Ownership:** OpenTUI becomes the product frame. HoBo's hard rule is the
  opposite: Pi is not the product UI; a second, third-party chrome (Hunk's
  skin, Pierre highlighting, OpenTUI components) is worse.
- **Pi TUI:** InteractiveShell already depends on `@earendil-works/pi-tui`.
  OpenTUI is a separate render/input runtime. Two loops, two key maps, two
  resize stories.
- **Perf:** Hunk/Pierre tokenize and highlight whole files. The review pane
  must leave a 25k-character offscreen comment un-highlighted and paint
  viewport rows only. A component tree that re-highlights the document on
  every generation refresh fails that budget.
- **Visual language:** Hunk is a modern TUI skin. DESIGN.md forbids foreign
  skins and flat SaaS chrome. Rubberhose is thick ink (`┏━┓`), sticker
  shadow, strict B&W; vermillion only on a mutating decision.
- **Commands:** Hunk's VCS adapters run git. Review mutations must be
  `ReviewCommand` values (`stage-selection`, `unstage-selection`,
  `apply-suggestion`, `publish-submission`) with exact-effect approval.
  Raw `git add` / `git apply` is out of scope for this pane.
- **Domain:** Hunk is file/diff oriented. The aggregate needs inbox
  disposition, generations, coverage/stale, draft publication state, agent
  route, stack provenance, and pending-review digest challenge.

### B. Native HoBo renderer (chosen)

Pure model / layout / actions / sanitize / pane modules next to the existing
review ports. Ideas reused; no Hunk or OpenTUI code, package, or skin.

## Decision

1. **Do not vendor Hunk, OpenTUI, or Pierre diffs.** Default is native.
2. **Reuse ideas, not chrome:** continuous manifest-first stream, sticky
   file/hunk headers, width bands (narrow / medium / wide), unified / split
   / stacked layouts, keyboard-only motion.
3. **Paint with rubberhose** (`inkCard`, `statusStripe`). Vermillion
   (`ACCENT.spark`) only on the pending-review approval challenge.
4. **Sanitize before paint:** strip CSI, OSC (including title 0/2 and
   clipboard 52), DCS, BEL, CR, and bidi from paths and comment bodies.
5. **Viewport-only work:** highlight comment bodies only for rows inside the
   current scroll window. After a shorter refresh, clamp selection/scroll.
6. **Commands, not git:** the reducer emits `ReviewCommand` only.

## Consequences

- **(+)** One TUI runtime, one visual language, one command/approval path.
  Hostile review text cannot set the window title or clipboard. Offscreen
  comment bytes are not re-highlighted.
- **(−)** We do not inherit Hunk's highlighter, watch mode, or extension
  host. Syntax colour and live-reload stay out of this pane on purpose.
- **Follow-up:** a later swarm may mount this pane in the resident tmux
  session the same way `runGitTerminalPane` is mounted — without growing
  `session-control-server.ts` or the public package export surface here.

## Evidence

- Implementation: `packages/code/src/review/review-terminal-*.ts`
- Tests: `packages/code/test/review-terminal-pane.test.ts`,
  `packages/code/test/review-terminal-security.test.ts`
- Hunk README / OpenTUI component docs (evaluated 2026-08-12):
  https://github.com/modem-dev/hunk
  https://github.com/modem-dev/hunk/blob/main/docs/opentui-component.md
