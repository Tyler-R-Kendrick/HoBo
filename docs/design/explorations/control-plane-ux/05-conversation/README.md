# 05 · Conversation — The Intent Stream

**Thesis:** the control plane is a *dialogue* with your Crew — chat **plus** shared ground truth, never chat **instead of** state.

## Philosophy

Chat-ops failed the first time because the chat was a fire hose pointed at a black box: you typed commands, a bot typed logs, and the actual state of the world lived somewhere else. This loop keeps the conversational grain — Marcus states an *intent* in plain language ("take harbor-crm to production in europe, keep cost under $40/day") — but every consequential reply from the Crew is a **structured object rendered inline**, not prose. The Platform Engineer answers with a plan card that is literally a plan diff; GitOps answers with an execution checklist; SRE answers with a canary verdict backed by a chart. And the right rail holds the **ground truth**: the live, event-log-derived state of harbor-crm that the conversation is *about*. A drawn thread connects a plan-card line to its ground-truth row to make the core promise visible: the thing in the chat and the thing in the state panel are **the same object**. Talk all you want — state never lives in the transcript.

## Design principles

1. **Answers are objects, not paragraphs.** Plan diffs, checklists, gate chips, and verdicts are first-class card components with their own anatomy (header / diff body / summary strip / action footer). Prose is reserved for humans.
2. **Ground truth is beside the conversation, never inside it.** The rail is derived from the append-only event log (`#4821–#4823` shown); the transcript can scroll away, the rail cannot lie.
3. **One object, two views — show the seam.** The dashed thread from `+ camp hetzner-fsn1` in the plan card to the `hetzner-fsn1` camp row proves chat and state reference the same entity.
4. **Crew members are instantly tellable.** Each operator agent owns a hue and a geometric sigil (Platform Engineer ◆ blue, GitOps ■ green, SRE ● violet, Endpoint Monitor ▲ orange), repeated in avatar, bubble spine, and the rail's crew-on-duty legend.
5. **Approvals are ambient, not modal.** Morgan's public-exposure approval and the auto-passed data-residency gate appear as compact centered chips — consequential, auditable, but visually quieter than Crew work product.

## Design system

### Palette

| Token | Hex | Role |
|---|---|---|
| `--cream` | `#FBF9F6` | canvas background |
| `--ink` | `#26221E` | text, user bubble, avatar |
| `--bubble` | `#FFFFFF` | Crew bubbles, cards, top bar |
| `--rail` | `#F1EDE6` | ground-truth rail background |
| `--pe` / `--pe-deep` | `#1C7ED6` / `#155FA3` | Platform Engineer hue / text-safe |
| `--gitops` / `--gitops-deep` | `#0E9F6E` / `#0B7A55` | GitOps hue / text-safe |
| `--sre` / `--sre-deep` | `#7C5CFF` / `#5F41D9` | SRE hue / text-safe |
| `--endpoint` / `--endpoint-deep` | `#E8590C` / `#C24608` | Endpoint Monitor hue / text-safe |
| `--diff-green-bg` / `--diff-green-tx` | `#E6F4EA` / `#137333` | plan-diff additions |
| `--diff-red-bg` / `--diff-red-tx` | `#FCE8E6` / `#A50E0E` | plan-diff removals |
| `--amber` / `--amber-bg` | `#B7791F` / `#FCF3E3` | pending gates, rolling status |
| `--muted` / `--faint` | `#6E655B` / `#8A8075` | secondary / tertiary text |
| `--line` / `--line-soft` | `#E5DFD5` / `#EFEAE1` | borders / card dividers |

### Type scale (one stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`)

| Token | Size | Use |
|---|---|---|
| `--fs-xl` | 19px | rail app name, cost figure |
| `--fs-lg` | 15px | wordmark, plan title |
| `--fs-md` | 13.5px | body, diff lines, checklist |
| `--fs-sm` | 12px | metadata, stats, buttons |
| `--fs-xs` | 11px | timestamps, tags, section caps |

Numbers use `font-variant-numeric: tabular-nums` (versions, costs, event ids) — no second font family.

### Spacing & radius

| Token | Value | Use |
|---|---|---|
| `--s1…--s5` | 4/8/12/16/24px | 4px-grid spacing ramp |
| `--r` | 14px | bubbles, cards, composer |
| `--r-sm` | 9px | buttons, rail sections |

### Components

- **Plan card** — header (title · id · scope) / diff body (`+` green, `−` red, `~` neutral with struck-red → green inline change) / summary strip (cost, budget headroom, gate chips) / action footer (Approve & run · Edit plan · Explain).
- **Gate chip** (amber outline, shield glyph) → becomes a **system chip** (pill, centered) once passed/approved.
- **Execution checklist** — done ✓ (filled), running (spinner ring + 64% bar), queued (dashed circle).
- **Canary verdict** — inline SVG sparkline vs. dashed baseline + tabular stats + green "promoting" pill.
- **Ground-truth sections** — camps (version per camp), policy gates, cost bar vs. budget, last-3 event log, crew-on-duty legend.
- **Thread** — 1.5px dashed bezier in PE blue with dot terminals, labelled "same object · camp/hetzner-fsn1".

## Look & feel

Warm cream canvas, white 14px-radius bubbles with 3px agent-hued spines, generous 24px gutters, one rounded system sans throughout. The left 62% feels like a modern messenger; the right 38% feels like a calm ledger on darker parchment. Color is rationed: agent hues and diff green/red carry all semantic weight, so the two policy-gate ambers and the single blue thread pop exactly where the story turns. No dark surfaces except Marcus's ink bubble — the one human voice is the darkest thing on screen.

## Ideation log — alternatives considered & rejected

1. **Full-screen chat with slash-command state queries** (`/status harbor-crm` replies in-stream). Rejected: state answers scroll away and go stale — exactly the "chat instead of state" failure the thesis forbids. Ground truth must be persistent and positional.
2. **Three-pane layout (crew roster | chat | state).** A Slack-like left sidebar listing Crew members and channels per Camp. Rejected: the roster stole ~200px from the conversation, demoted the plan card to a cramped column, and Crew identity is already carried by avatars + spines; a legend card in the rail does the roster's job at 1/6 the cost.
3. **Threaded replies per plan** (gate approvals and execution progress nested under the plan card as a collapsed thread). Rejected: hiding Morgan's approval and GitOps progress behind a disclosure breaks the at-a-glance audit story; a flat stream with compact system chips keeps the whole causal chain visible in one screen.
4. **Terminal-flavored transcript** (monospace intents, `$` prompts). Rejected outright: forbidden by the distinctiveness constraints and collides with loop 06; also re-frames intents as commands, which is the wrong mental model for dialogue.

## Hardening notes

- **Pass 1 → 2:** the stream overflowed the 1000px frame — the SRE verdict was clipped by the composer and the Endpoint Monitor message was buried entirely. Compressed the vertical rhythm (stream gap 12→9px, bubble padding 10/14→8/13, diff-line and card-section padding trimmed, sparkline 52→46px, composer padding tightened). Also: the plan summary row wrapped onto three ugly lines ("est. $31.20/day" broke mid-figure, gate chips wrapped internally) — made the strip single-line with `white-space: nowrap` chips.
- **Pass 2 → 3:** the `public-exposure` gate chip clipped at the card's right edge — widened the plan card 660→704px and shortened "2 gates required:" to "2 gates:". The thread's left terminal floated in whitespace ~30px off the card — re-anchored it to the exact right edge of the `+ camp hetzner-fsn1` diff line (774, 206) and landed the right terminal precisely on the camp row's anchor dot (1029, 228). Sparkline caption "p95 214 ms canary" clipped at the SVG edge — re-set with `text-anchor="end"`.
- **Pass 3:** verified: no overflow, no clipped text, plan card reads as an object at thumbnail size, four crew hues distinguishable, lint PASS (35 tokens, 1 font stack).

## Distinctiveness check

- **01 Terrain (cartographic map):** no geography, no contours — state is a ledger beside a dialogue, not a landscape.
- **02 Broadsheet (newspaper edition):** no serif columns or editioned front page — this is a live two-party stream, not published print.
- **03 Mission Control (launch console):** no wall-of-gauges density — one conversation carries the narrative; telemetry appears only when SRE cites it.
- **04 Quiet Garden (calm ambient):** this screen is transactional and causal (intent → plan → gates → deploy), not ambient reassurance.
- **06 Brutalist Terminal (text-file honesty):** rounded bubbles, proportional sans, structured cards — the exact opposite of raw monospace honesty.
- **07 Organism (living cells):** geometry here is rigid and semantic (sigils, diff rows), nothing grows, breathes, or metabolizes.
- **08 Metropolis (isometric city):** strictly flat, zero isometric projection or spatial metaphor.
- **09 Timetable (Swiss departures board):** no grid-of-rows-as-hero; rows exist only as one modest rail section, subordinate to dialogue.
- **10 Patchbay (hardware rack):** no jacks, cables-as-signal-path, or skeuomorphic hardware; the single drawn thread is an annotation, not a patch cable.
