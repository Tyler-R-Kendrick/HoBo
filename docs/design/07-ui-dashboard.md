# Plan 7 — UI / dashboard (sketch, iterate later)

> Part of the [HoBo Design Plan Suite](./README.md).

The Yard ships a Next.js dashboard built on the SDK. Core views:

- **Deployments timeline** — event-sourced history with **replay / time-travel** scrubber.
- **Topology graph** — bindle resources → resolved providers + options (where each port landed).
- **Run inspector** — workflow/step/actor/saga traces (Vercel-observability style), per-step inputs/outputs/retries.
- **Registry browser** — providers, their Hobo Code/signs, capabilities, cost signals.
- **Agent activity & credential audit** — agent runs + the replayable token-issuance log.
- **Cost & region view** — Planner's decisions and estimates.

## Iteration hooks
- Information architecture.
- Design system.
- Whether the dashboard is agnostic of World.
- Real-time via `streams`.
