# SDLC state — hobo-code InteractiveShell

**phase:** closed (shell v1 landed; residual phases open as product backlog)
**branch:** feat/hobo-code-interactive-shell (merged)
**PR:** https://github.com/Tyler-R-Kendrick/HoBo/pull/995
**merge:** `8d9a7b89a4f49b7ce2f85ee5b30019d8baf56b4d` (2026-07-31)

## Delivered (Phase 0–1)

- Default bare TTY is **HoBo InteractiveShell** (not stock Pi chrome)
- Bo + logo header, chat, slash palette, Tab Chat→Tasks→Status, product footer
- Pi only via escape hatch: `HOBO_CODE_TUI=pi` / `hobo-code --pi`
- Identity hard-fail tests; optimizexp feature `hobo-code-interactive-shell`
- Stale-dist launcher (`bin/hobo-code.mjs`) from #994

## Session PRs this initiative wave

| PR | Merge | Notes |
|---|---|---|
| #994 | `704a5063` | Auto-rebuild stale dist |
| #995 | `8d9a7b89` | InteractiveShell default TTY |
| #992–#993 | earlier | TUI craft / persona optimizexp (one-shot) + closeout |

## Finish notes

- Local: `@hobo/code` vitest 115 passed for shell PR
- CI: billing-budget empty-step class when red — squash-merged per sdlc finish

## Residual (product backlog — not claimed done)

- Streaming agent runtime (Pi/Flue as engine only)
- Real mouse hit regions / live Grok-class tasks
- Claude-feel craft + warning budget
- Richer in-session nix/hermetic UX
- Optimizexp assert-complete hard-gate requiring interactive PTY evidence
