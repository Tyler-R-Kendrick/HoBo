# Plan 8 — Roadmap / phasing

> Part of the [HoBo Design Plan Suite](./README.md).

- **P0 — Foundations:** monorepo; `@hobo/core` types + all port interfaces; Hobo Code schema; `@hobo/conformance` skeleton; `@hobo/world-local` built-in engine.
- **P1 — SDK on local World:** `bindle()` + resources + `workflow`/`step`/`actor`/`saga`; `hobo dev`; one example app runs end-to-end locally with replay.
- **P2 — First real deploy:** one provider (Cloudflare or Fly — simplest) via `@hobo/iac-pulumi`; `hobo deploy`; Yard MVP (single-node, `@hobo/world-postgres`); event-sourced deployment lifecycle.
- **P3 — AI-native core:** Identity + Registry + Hobo Code; agent token brokering via OIDC federation; `agent()` primitive; `@hobo/mcp` surface.
- **P4 — Multi-provider:** AWS + Azure providers; mapping rules (whole-app / per-tier / per-boundary) + provider-specific options proven across providers with one bindle.
- **P5 — Forge:** AI-generated providers gated by conformance.
- **P6 — HA & UX:** reliability/HA algorithms ([Plan 5](./05-reliability-ha.md)), deployment strategies, dashboard ([Plan 7](./07-ui-dashboard.md)), multi-region.
