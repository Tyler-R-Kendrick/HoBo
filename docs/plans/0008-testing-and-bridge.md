---
type: Implementation Plan
title: "Testing story + The Bridge — session-scoped local/remote dev for any provider"
description: "Design and phased plan for two coupled capabilities: (1) the documented testing story across code, contracts, deployments, and runtime availability; (2) The Bridge — Bridge-to-Kubernetes-style local/remote dev generalized past Kubernetes, built on PACT-emulated boundaries, ADR-0076 boundary modes, dev-session routing, and preview environments, so a developer's tagged traffic forks to their laptop on any cloud provider."
tags: [hobo, plans]
---

# Testing story + The Bridge

> Baseline at commit `5641107b` (2026-07-26). Companions:
> [`0007-declarative-resource-codegen.md`](./0007-declarative-resource-codegen.md) (stubs +
> trainables), [ADR-0076](../design/adr/02-identity-security.md#adr-0076) (boundary modes),
> `docs/design/generated-stack.md` (stubs, specification-by-example, replay), and the PACT
> harness in `packages/contract-harness`.

## 1. Why one plan for both

HoBo already holds the pieces of a complete testing story AND a Bridge-to-Kubernetes
successor, because they are the same machinery viewed from two sides. Every service
boundary is a WIT port whose peers are PACT-emulable; ADR-0076 defines the per-boundary
modes (`live · mock · record/replay · fork · shadow · fault`); the event log makes every
deploy and call replayable. Testing = pointing a boundary at a mock/replay/fault route.
Bridge = pointing a boundary's *fork* route at the developer's laptop — for exactly the
requests carrying that developer's session tag. Because the routing happens at the
boundary (not in an orchestrator), the pattern is **provider-agnostic by construction**:
what Bridge-to-Kubernetes did with pod traffic interception, HoBo does at the membrane,
identically on any cloud, a mix, or bare metal.

## 2. The Bridge — design

**One sentence:** *tag your traffic, fork your boundary, keep everyone else live.*

1. **Session tags.** A dev session is a string — a branch (`tyler/feature-refunds`), a
   user, or a preview-env id. Tags propagate with the request (baggage/headers on wire
   transports; an explicit `{ session }` in-process). Untagged traffic never sees a fork.
2. **Bridged fork.** `boundary.bridge(localImpl, { session, contract })` installs a fork
   route for that session only. A sessionless bridge forks the whole boundary (the classic
   "route the service to me" mode).
3. **Contract-gated activation.** Before a bridge carries a single request, the local
   implementation is verified against the boundary's contract — PACT interactions from the
   broker, or recorded live traces — with PACT subset matching. A failing local impl never
   activates; the session's traffic stays live. This is the piece Bridge-to-Kubernetes
   never had: the fork is *proven compatible* before it exists.
4. **Recording is always on.** Every bridged call lands in the same
   specification-by-example capture as stubs (plan 0007), so a dev session's traffic
   becomes contract candidates and regression inputs.
5. **Preview environments are the same primitive.** A dev branch's preview env is a camp
   whose boundaries default to `live` against shared services, with the branch's session
   tag pre-applied — so "my preview env" and "my bridged laptop" compose: preview env for
   everything, bridge for the one service being edited.
6. **Chaos with no blast radius.** `fault({ session })` injects failure for one session
   only — availability testing against production topology without touching production
   traffic.

**Landed with this plan (Phase 0):** `createBoundaryRouter()` in `@hobo/runtime`
(`src/bridge/`) — the in-process seam implementing all of the above: per-boundary
`live/mock/bridge/replay/shadow/fault`, session-scoped bridging and faults, PACT-subset
contract gating (`BridgeContractError`), always-on recording, shadow diff reports, and
router-wide status. 9 executable-example tests in `test/bridge.test.ts`.

## 3. The testing story (documented at `/guide/testing/`)

| Layer | What you test | With |
|---|---|---|
| Code | services, actors, workflows, trainables | vitest; boundaries auto-mocked from PACT examples (`.mock()`), contract-derived stubs for unimplemented deps |
| Contracts | every service boundary | executable PACTs (`contracts/pacts/`), `@hobo/contract-harness` verify + broker; trainable contract examples double as eval suites |
| Deployments | plan → gate → converge | `hobo plan` (blocked gate = no-op), the local in-memory lane for full `hobo up` rehearsal, replay mode for dependency-free re-runs (replay-equals-live) |
| Runtime availability | live camps | Crew endpoint-monitor synthetics, SLO projections, session-scoped `fault()` chaos, shadow lanes for candidate implementations |

## 4. Gaps and phases

| # | Gap |
|---|---|
| T1 | No public testing documentation — the machinery exists but only design docs describe it. **Closed by this plan** (site `/guide/testing/`). |
| T2 | No Bridge design or implementation. **Phase 0 closed by this plan** (router + docs); wire transports remain. |
| T3 | Session tags don't yet propagate across wire transports (only in-process `{ session }`). |
| T4 | No CLI verbs for bridging (`hobo bridge <boundary>`, `hobo bridge --status`, `--down`). |
| T5 | Contract-harness PACT documents aren't yet auto-converted to `BridgeContract` examples (hand-shaped today). |
| T6 | Preview environments don't yet pre-apply branch session tags. |

- **Phase 0 — router + docs (landed).** ✅ `createBoundaryRouter` in `@hobo/runtime`;
  site pages `/guide/testing/` + `/guide/bridge/`; nav + `llms.txt`.
- **Phase 1 — PACT integration (T5).** `bridgeContractFromPact(document)` in
  `@hobo/contract-harness` mapping interactions → `BridgeContract` examples; broker fetch
  in the dev loop.
- **Phase 2 — wire propagation (T3).** Session baggage on HTTP/queue transports in the
  camp host; the router keys off it; OTel baggage for trace continuity.
- **Phase 3 — CLI + tunnel (T4).** `hobo bridge api.payments --session $(git branch --show-current)`
  opens the local listener + secure tunnel, registers the fork with the camp's router,
  streams contract verification, `--down` tears down; `hobo bridge --status` = router status.
- **Phase 4 — preview envs (T6).** Branch-scoped camps pre-tagged with the branch session;
  `hobo up --preview` composes with an active bridge.
- **Phase 5 — example package.** `examples/bridge-local-dev/`: full production-grade
  example (proto/CUE `data-models/`, executable PACTs, guard-clean) walking storefront ↔
  payments with a bridged laptop impl. (Deferred here because example packages carry the
  full data-model/PACT harness; the runtime tests are the executable example meanwhile.)

## 5. Non-goals

- No Kubernetes dependency, ever — the router works wherever the membrane runs.
- No unverified forks: a bridge without a passing contract (when one is supplied) does not
  activate. Bridging with no contract is allowed but recorded as such.
- Shadow output is never returned to callers; fault injection never widens past its session.
