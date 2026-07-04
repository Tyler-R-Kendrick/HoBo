---
type: Reference
title: "Control-Plane UX Explorations — 10 Design Loops"
description: "Design-thinking foundation and registry for ten distinct next-generation control-plane experience candidates."
tags: [hobo, design, ux, explorations]
---

# Control-Plane UX Explorations — 10 Design Loops

**Charter.** Design the next-generation *community successor to cloud control planes* for HoBo —
the AI-native meta-cloud. Ten independent design loops, each running the full arc
**philosophy → design system → look & feel → creative ideation → hardened mockup**, each
deliberately distinct from every other loop on metaphor, palette, typography, density, and
primary interaction. Mockups are self-contained static HTML captured as screenshots
(design evidence); each loop folder carries its own loop record (`README.md`).

## 1 · Empathize — who we design for

Grounded in [workspace-onboarding-ux.md](../../workspace-onboarding-ux.md#primary-personas),
[persona-operating-profile.md](../../persona-operating-profile.md), and
[vision.md](../../vision.md). The named persona set (Marcus, Sarah, Priya, Elena, Morgan) maps
onto these operating roles:

| Persona | Role | What they fear in today's control planes |
|---|---|---|
| **Marcus** — first-time app developer | Ships a bindle from zero | 10,000-service sprawl, YAML walls, "wrong region/account" dread, cloud bill roulette |
| **Sarah** — team admin | Sets up org, members, environments | Irreversible decisions made blind; who-can-do-what opacity |
| **Priya** — platform engineer / agency operator | Defines provider defaults, catalogs, policy gates; reports to clients | Drift she can't see, policy that can't be proven, no narrative to hand a client |
| **Elena** — support operator | Diagnoses stalled onboarding & incidents | State without evidence; timelines she must reconstruct by hand |
| **Morgan** — security & compliance reviewer | Approves capability/risk decisions | Un-replayable history, static secrets, ambient permissions |
| **The Crew** — operator agents (SRE, Endpoint Monitor, GitOps, Platform Engineer) | *Non-human first-class users* | Interfaces that are pictures of state instead of state itself |

The sixth persona is HoBo's differentiator: **agents are users, not afterthoughts** — every
surface must be legible to a human *and* honest about what an agent did, is doing, and may do.

## 2 · Define — design goals (the problem statement)

Incumbent control planes optimize for *inventory* (every resource, every knob). HoBo's
principles ([vision.md](../../vision.md)) demand the opposite center of gravity:

1. **Legibility of state over inventory of resources.** One glance answers "is my world okay?"
2. **Narrative, not snapshots.** Everything is replayable — the UI should read like a
   timeline/story you can scrub, not a dashboard you must interrogate.
3. **Calibrated trust in agents.** The Crew acts autonomously; the UX must make agent action
   *visible, attributable, reviewable, and interruptible* — never spooky.
4. **Progressive disclosure.** Agnostic by default, optimizable on demand — `.with(...)` is a
   drill-down, never a prerequisite.
5. **Calm by default, loud only when it matters.** Alarm fatigue is a design failure.
6. **Evidence-first.** Plans, gates, proofs, and audit events are the primary objects, not
   afterthought logs (Priya's client report, Morgan's review, Elena's diagnosis).
7. **Scopes are the map.** Junction ⊃ Yard ⊃ Camp ⊃ Bindle must be spatially obvious.

Anti-goals: no general-PaaS-for-non-developers UI; no billing/commerce surfaces
([ADR-0064](../../adr/07-portability-extensibility.md#adr-0064)); no dashboard-wallpaper.

## 3 · Ideate — the ten loops

Each loop is a *thesis about what a control plane fundamentally is*. Distinctiveness is
enforced across six axes: metaphor, background value/temperature, typography class, layout
system, information density, and primary interaction.

| # | Loop | Thesis ("a control plane is…") | Screen designed | Type class | Ground |
|---|---|---|---|---|---|
| 01 | [Terrain](01-terrain/README.md) | …territory: a living map | Junction topology overview | Cartographic small-caps + serif | Warm paper, contour ink |
| 02 | [Broadsheet](02-broadsheet/README.md) | …journalism: the day's edition of your infrastructure | Morning operations digest / audit narrative | Didone/serif editorial | Newsprint white, ink black, one red |
| 03 | [Mission Control](03-mission-control/README.md) | …a launch: go/no-go, telemetry, flight rules | Deploy-in-progress console | Mono + condensed sans | Near-black, phosphor green/amber |
| 04 | [Quiet Garden](04-quiet-garden/README.md) | …silence: absence of signal is the signal | Ambient home + single attention item | Light humanist sans, lowercase | Bone white, sage, apricot |
| 05 | [Conversation](05-conversation/README.md) | …a dialogue with your Crew | Intent stream with plan-diff approval | Rounded UI sans | Warm cream, four agent hues |
| 06 | [Brutalist Terminal](06-brutalist-terminal/README.md) | …a text file: total disclosure, zero decoration | Camp inventory + command palette | Pure monospace | Stark white, black, link blue |
| 07 | [Organism](07-organism/README.md) | …alive: health is vitality, not status codes | Bindle vitals (the app as organism) | Soft geometric sans | Deep plum, bioluminescent teal/magenta |
| 08 | [Metropolis](08-metropolis/README.md) | …a city: zoning, districts, construction | Isometric Yard/Camp city + policy zoning | Condensed DIN/stencil | Blueprint paper, navy ink, construction yellow |
| 09 | [Timetable](09-timetable/README.md) | …a railway: departures, platforms, delays | Release-channel departures board | Swiss grotesque, giant numerals | Pure white, black, SBB red |
| 10 | [Patchbay](10-patchbay/README.md) | …hardware you can touch: patch it by hand | Resource wiring editor (ports & cables) | Engraved instrument caps | Charcoal panel, cream labels, cable colors |

## 4 · Loop protocol (each folder's `README.md` records it)

1. **Philosophy** — the thesis, 3–5 principles, which HoBo north stars it serves.
2. **Design system** — named tokens: palette, type scale, spacing, radii, elevation, core components.
3. **Look & feel** — mood, motion intent, texture rules.
4. **Ideation log** — alternatives considered and rejected, with reasons.
5. **Hardened mockup** — `mockup.html` (self-contained, 1600×1000, no external assets),
   `mockup.png` (captured evidence), plus hardening notes from at least two critique passes.
6. **Distinctiveness check** — explicit contrast against all prior loops (axes table).

A repo-local design linter ([`design-lint.js`](design-lint.js)) enforces the mechanical part of
each design system: tokens declared as CSS custom properties, colors drawn from the token set,
self-containment (no external requests), and per-loop font-class discipline.

## 5 · Status

All ten loops produced; screenshots delivered as design evidence for selection. Next step is
stakeholder selection, then deepening the chosen direction(s) into multi-screen systems.
