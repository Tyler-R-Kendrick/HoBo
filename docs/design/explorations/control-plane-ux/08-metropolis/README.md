# Loop 08 — Metropolis

> **Thesis:** Your stack is a CITY — zoning is policy, deploys are construction.

## Philosophy

A control plane fails when infrastructure feels abstract. Cities are the most legible complex
systems humans have ever built: everyone understands districts, buildings, roads, permits, and
construction sites without training. Metropolis renders the Junction as an architect's isometric
master plan on blueprint paper: Camps are districts, services are buildings whose height is
capacity, request flow is road width, and — the load-bearing idea — **policy is zoning**. A
data-residency rule is not a YAML stanza; it is a red dashed line on the ground that EU data may
not cross. Approvals are **permits** filed on a public board, so Morgan's pending security review
reads exactly like a zoning variance awaiting the city inspector. Deploys are construction:
crane, scaffold hatch, hazard ribbon reading "ROLLING 25%".

Serves HoBo north stars: *scopes are the map* (Junction ⊃ Camp districts), *evidence-first*
(permit board + city-hall notice strip is the event log), *calibrated trust in agents* (permits
are filed by named Crew agents and auto-approvals cite their zoning envelope).

## Design principles

1. **Zoning is policy.** Every governance rule must have a spatial expression a child could point at.
2. **Construction is honest.** Change-in-progress always looks like a construction site — never a spinner.
3. **Drafting precision, toy warmth.** Consistent 2:1 isometric projection and surveyor annotations; playfulness comes from the metaphor, never from sloppiness.
4. **The notice board is the ledger.** Permits and city-hall notices are append-only event-log entries wearing civic clothes (each carries its seq #).

## Design system

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#EAF1F7` | blueprint ground |
| `--grid` | `#C9D8E6` | drafting grid |
| `--ink` | `#1B3A5B` | navy line work + text |
| `--construction` | `#F2B705` | crane, hazard ribbon, in-progress |
| `--brick` | `#C4553B` | stateful stores (postgres vault) + residency line |
| `--park` | `#5B8C5A` | reserved capacity (headroom greens) |
| `--white` | `#FFFFFF` | building top faces, plates |

Type: condensed sans (Arial Narrow stack); stencil-caps letter-spaced headers; small-caps
leader-line annotations. Isometric spec: 2:1 projection, top face lightest, right face mid,
left face darkest; 1 storey = 1 replica. Components: district plate, building (service),
crane + scaffold (rolling deploy), zoning line (policy boundary), permit card (approval),
surveyor's key (legend), city-hall notice strip (event log), title block (sheet metadata).

## Look & feel

An architect's working drawing pinned to a site office wall: blueprint calm, navy ink, one
loud construction yellow. Motion intent: crane swing and road-dot drift only — the city
otherwise holds still. Texture: drafting grid, stamp ("JUNCTION HOBO-PROD"), title block with
DRAWN/CHECKED rows credited to GitOps Crew and Sarah.

## Ideation log

- **SimCity-saturated palette** (full-color toy city) — rejected: charm collapsed into game
  aesthetics; Priya cannot show a client a game.
- **Top-down street map** instead of isometric — rejected: loses the height = capacity channel,
  and reads as loop 01 Terrain's sibling.
- **Permits as modal dialogs** — rejected: approvals belong in public space (a board anyone can
  read), not interrupts; the board also carries state after the fact.
- **One district per provider region (many camps)** — rejected for the mockup: two districts
  show the pattern; six shrink buildings below annotation legibility.

## Hardening notes

- Pass 1: unified the isometric projection (early buildings mixed 30°/45° axes), re-shaded
  faces to the top/right/left light rule, and pulled annotations onto leader lines so the city
  itself stays uncluttered.
- Pass 2: replaced placeholder permit copy with full plan → gates → deploy provenance (filed-by,
  plan diff, gate states), added the surveyor's key so every visual encoding is declared, and
  filled dead paper with the title block and junction stamp.
- Pass 3 (coordinator verification after the authoring agent was interrupted): re-captured the
  screenshot from the final HTML, confirmed design-lint PASS (22 tokens, 1 font stack), checked
  contrast of ink-on-paper annotations, and accepted the sheet.

## Distinctiveness check

- **01 Terrain** — organic hand-surveyed geography vs Metropolis's drafted right-angle city; contours vs buildings.
- **02 Broadsheet** — typography-only journalism; Metropolis is drawing-first with civic metaphor.
- **03 Mission Control** — dark phosphor launch console; Metropolis is daylight blueprint paper.
- **04 Quiet Garden** — near-empty calm field; Metropolis is a dense annotated drawing.
- **05 Conversation** — dialogue stream; Metropolis has no chat surface at all.
- **06 Brutalist Terminal** — text-file table honesty; Metropolis is pictorial and skeuomorphic about space.
- **07 Organism** — curved bioluminescent life; Metropolis is rectilinear civil engineering.
- **09 Timetable** — pure typographic schedule; Metropolis is spatial, with time only in notices.
- **10 Patchbay** — tactile hardware panel; Metropolis is paper — a plan of the machine, not the machine.
