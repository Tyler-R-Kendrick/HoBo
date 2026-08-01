---
type: Agent Skill Reference
title: "OptimizeXP interface standards and patterns"
description: "Formal, harness-neutral quality standards for APIs, TUIs, and web, mobile, and desktop GUIs."
tags: [hobo, optimizexp, api, tui, gui, accessibility, design-patterns]
timestamp: 2026-07-31T00:00:00Z
---

# Interface standards and patterns

OptimizeXP reviews the interface people actually use. It must not invent a
score from a screenshot, a route that never loaded, or a command that was not
run. Select the applicable standards below when planning a feature and cite
them in the scenario's `EXPERIENCE.md`.

## API standards

Use resource-oriented HTTP or a clearly documented command/event contract.

- **Contract first:** schemas, examples, compatibility rules, and consumer
  contract tests are executable; never infer fields from a happy-path trace.
- **Predictable semantics:** safe reads are idempotent; writes document
  idempotency keys, retries, concurrency, and ordering. Use consistent status
  codes and one error envelope (problem details or the repository equivalent)
  with a stable machine code, human message, remediation, and correlation id.
- **Evolution:** additive changes are the default; version only for a breaking
  semantic change. Define pagination, filtering, sorting, empty results, rate
  limits, timeouts, cancellation, and partial failure behavior.
- **Trust boundaries:** authenticate and authorize every mutation, minimize
  returned data, redact secrets, validate at the boundary, and make unsafe
  defaults impossible. Emit structured audit/trace fields without credentials.
- **Developer experience:** examples are copy/pasteable, errors name the next
  action, discovery works from the root endpoint/help, and generated SDKs keep
  names and nullability consistent with the contract.
- **Proof:** capture a successful request, a representative validation failure,
  and a retry/idempotency or pagination case. Review the response body, status,
  headers, and remediation—not merely process exit 0. API proof is a structured
  exchange, not a GUI recording: prefer a replayable Playwright/API script,
  sanitized HAR, or equivalent request/response trace with timing, headers,
  status, payload schema, and correlation id. A screenshot of JSON is never
  sufficient; secrets and authorization headers must be removed.

## TUI standards

Treat the terminal as a constrained, stateful interface rather than colored
stdout.

- **Entry and orientation:** bare start, help, and the primary task are all
  covered. The first screen names the product, current context, and one clear
  next action; never rely on stock third-party branding.
- **State and control:** show progress, success, failure, and cancellation;
  preserve user input where safe; support keyboard-only navigation, visible
  focus, predictable shortcuts, resize/wrap behavior, and a usable 80×24
  minimum (or document the real floor).
- **Output discipline:** stdout is machine-readable where promised, stderr is
  diagnostics, colors have a non-color meaning, and non-interactive mode never
  hangs. Exit codes and signals are stable and documented.
- **Recovery:** errors identify the failed step, likely cause, and exact next
  command/key. Destructive actions require confirmation and have an escape.
- **Proof:** record the whole session from entry through outcome with terminal
  dimensions. A transcript or hand-written `primary.txt` is supporting data,
  not a replay. Review that the recording shows each Gherkin claim.

## GUI standards (web, mobile, desktop)

Apply platform conventions first; custom styling must preserve the same mental
model and accessibility guarantees.

### Shared GUI contract

- Every journey has a visible entry, loading, success, empty, error, offline,
  and recovery state. Preserve user work across retries and navigation.
- Use a stable hierarchy, one primary action per view, recognition over recall,
  undo for reversible mutations, and confirmation for destructive ones.
- Keyboard, screen reader, zoom, contrast, reduced motion, touch targets, and
  focus order are part of the feature—not a post-hoc audit. Target WCAG 2.2 AA
  for web and equivalent platform accessibility APIs elsewhere.
- Responsive layouts must not hide critical actions or change their meaning.
  Instrument meaningful latency and errors without collecting sensitive input.

### Web

Use semantic HTML, URL-addressable state, browser back/forward behavior,
responsive breakpoints, progressive enhancement, and resilient loading/error
boundaries. Test keyboard and a narrow viewport as well as the primary desktop
viewport. GUI proof **must be graphical**: prefer a browser video recording;
otherwise stitch ordered screenshots into a video/GIF. Capture the complete
navigation and mutation journey, not only the final screenshot or DOM dump.

### Mobile

Respect platform navigation, safe areas, back gestures, keyboard/inset changes,
permission prompts, intermittent connectivity, and lifecycle interruption.
Use touch targets appropriate to the platform, concise progressive disclosure,
and deep links that restore context. GUI proof **must be graphical**: record
the device screen (or an ordered visual recording), including overlays and
keyboard/inset changes. Record cold launch through completion,
including permission or offline branches when they are in scope.

### Desktop

Support window resize, high-DPI scaling, system menus/shortcuts, focus and
multi-window behavior, clipboard/file dialogs, and a clean close/reopen path.
Do not hide essential state in hover-only affordances. GUI proof **must be
graphical**: record the window, dialogs, menus, focus, and resize transitions;
an event log alone is not proof. Capture the complete window journey at the
target size and a recovery path for a failed operation.

## Evidence review protocol

Evidence is proof only when all four questions have a positive answer:

1. **Identity:** does the artifact belong to this feature, scenario, persona,
   driver, and run, with a reproducible entry?
2. **Completeness:** does one continuous recording (or an explicitly ordered
   stitched recording) cover every Given/When/Then claim from entry to outcome?
3. **Relevance:** does the visible/API result prove the claim, including error,
   loading, accessibility, and recovery assertions where specified?
4. **Integrity:** does the review hash match the captured primary artifact, and
   does the recording come from the harness rather than a handwritten file?

Capture creates `review.json` in a pending state. A human or independent agent
must accept it after playback with `capture-evidence --mode review`. Strict
validation and `assert-complete` reject pending, partial, irrelevant,
degraded, hash-mismatched, or claim-incomplete evidence. “Evidence exists” is
never equivalent to “evidence proves the scenario.”
