---
type: Agent Skill Reference
title: "OptimizeXP evidence capture"
description: "What personas see: capture, store, overwrite policy, and media preference for feature scenarios."
tags: [hobo, optimizexp, evidence, screenshot, video, tui, web]
timestamp: 2026-07-30T00:00:00Z
---

# Evidence

Evidence is **what the persona sees** while a scenario runs — not only logs of what the agent thinks. Every scored scenario should produce durable media under the feature’s `evidence/` tree.

## One recording per scenario

```text
.optimizexp/features/<feature-slug>/evidence/<scenario-slug>/
```

Rules:

1. **Exactly one current primary artifact** per scenario (`primary.*` + `manifest.json`).
2. A new capture **overwrites** the previous primary for that scenario (no version pile-up in-tree).
3. Optional `frames/` is replaced as a set when keyframe mode runs.
4. Bus outcome entries **link** to the evidence path; they do not embed binaries.
5. Run-local copies under `.optimizexp/runs/<runId>/artifacts/` are allowed as scratch; **canonical** evidence is the feature folder path.

## Capture priority by interface

| Interface | Prefer | Fallback chain |
|---|---|---|
| **web** | Browser video recording (Playwright / browser MCP) | Screenshot sequence → stitch to video → GIF |
| **native** | Computer-use / OS recorder video | Screenshots at key moments → stitch → GIF |
| **tui** | Terminal recording (asciinema cast / script) + screen size | Full terminal transcript + cols×rows + optional PNG of terminal if available |
| **cli** (non-TUI) | Replayable asciicast (`primary.cast`) + HTML player + transcript | Transcript only when recording is impossible; mark degraded |
| **docs** | Rendered page screenshot or HTML snapshot | Markdown excerpt + path |

**Visual artifacts prefer video.** If video cannot be produced or attached:

1. Capture keyframe screenshots at expect/act/outcome boundaries
2. Stitch to **mp4/webm** if `ffmpeg` exists
3. Else stitch to **GIF** (markdown/PR friendly)
4. Else keep ordered PNGs + `frames/index.md`

## meta.json (required)

```json
{
  "featureId": "agent-check-staged",
  "scenarioSlug": "staged-skill-edit-selects-skill-gates",
  "personaIds": ["developer"],
  "interface": "cli",
  "driver": "cli",
  "capturedAt": "2026-07-30T21:00:00.000Z",
  "runId": "20260730-dx-baseline",
  "screen": { "cols": 120, "rows": 40, "widthPx": null, "heightPx": null },
  "primary": {
    "file": "primary.cast",
    "kind": "recording",
    "bytes": 4096,
    "sha256": "…"
  },
  "frames": [],
  "repro": {
    "command": "pnpm agent:check -- --staged",
    "cwd": ".",
    "envKeys": ["CI_AGENT"]
  }
}
```

## manifest.json (required)

```json
{
  "scenarioSlug": "staged-skill-edit-selects-skill-gates",
  "primaryPath": "primary.cast",
  "kind": "recording",
  "updatedAt": "2026-07-30T21:00:00.000Z",
  "overridesPrevious": true
}
```

## Bus linkage

Outcome entries MUST include:

```json
"evidence": {
  "featureId": "agent-check-staged",
  "scenarioSlug": "staged-skill-edit-selects-skill-gates",
  "path": ".optimizexp/features/agent-check-staged/evidence/staged-skill-edit-selects-skill-gates/",
  "primary": "primary.cast",
  "kind": "recording"
}
```

Metrics without an evidence path are invalid. CLI/TUI captures must expose a replayable cast and generated `REPLAY.html`; transcripts are supporting summaries, not the primary visual evidence.

## Secrets

Redact tokens, cookies, and `.env` values before writing evidence. Prefer env **names** in `repro.envKeys`. Harness applies a basic redaction pass; agents must not disable it for convenience.

## PR publishing

After a PR exists for the iteration, post evidence per `references/pr-delivery.md`. Large media: compress, downscale, split comments, or link to committed paths in the PR branch when upload APIs refuse the payload.
