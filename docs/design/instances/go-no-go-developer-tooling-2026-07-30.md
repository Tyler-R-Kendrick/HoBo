---
type: Reference
title: "Go/no-go — developer-tooling (Target B) — 2026-07-30"
description: "No-go / conditional instance for ADR-0140 Target B (local-first npm). Blocked until publish prep and honesty pass."
tags: [hobo, design, ship, instances, go-no-go]
---

# Go/no-go decision — `developer-tooling` — 2026-07-30

> **Contract:** [`go-no-go-decision-record.md`](../go-no-go-decision-record.md)  
> **Ship target:** **B — local-first developer tooling** ([ADR-0140](../adr/07-portability-extensibility.md#adr-0140), [`launch-ship-targets.md`](../launch-ship-targets.md))  
> **Depends on:** Target A posture ([`go-no-go-repo-public-2026-07-30.md`](./go-no-go-repo-public-2026-07-30.md))  
> **Audit:** [`0011-ship-readiness-gap-review.md`](../../plans/0011-ship-readiness-gap-review.md)

## Decision record

| Field | Value |
|---|---|
| **Gate** | `developer-tooling` |
| **Decision** | **conditional-go** for **prep only** (docs + allowlist + dry-run workflow). **no-go** for live registry publish until H-E1b + preferred green CI |
| **Approver role** | Release owner (single maintainer: **Tyler Kendrick**) |
| **Evidence links** | WP-B honesty; WP-D allowlist + private flags + publish.yml dry-run; [`npm-publish-allowlist.md`](../npm-publish-allowlist.md); residual [`residual-human-blockers-2026-07-30.md`](./residual-human-blockers-2026-07-30.md); **no** live `npm publish` claimed |
| **Blocker deltas** | **Resolved by agents:** dual-bin (cli `bin` removed); allowlist + immature `private: true`; honesty on in-memory default + synthetic componentize. **Still open:** live publish (H-E1b), Actions runners (H-V1), Target A secret scan. |
| **Accepted risks** | Same register [`accepted-risks-2026-07-30.md`](./accepted-risks-2026-07-30.md). For B, synthetic wasm and in-memory default are **must-label** limitations, not silent defaults. |
| **Expiry / revisit** | **2026-09-15** or first live allowlisted publish attempt, whichever first |

## Why live publish is still no-go

| Must-list item (Target B) | Status after WP-B/D |
|---|---|
| Target A must-list complete | Conditional — history **secret scan** still open |
| Publish allowlist + prerelease policy | **Met** (docs); version tags not bumped yet |
| Single install story (`@hobo/hobo` vs `@hobo/cli`) | **Met** — product bins on `@hobo/hobo` only |
| Offline golden path + HONEST SCOPE in package docs | **Met** for honesty labeling (WP-B) |
| Support boundary for CLI-only | **Documented** as pre-release; not staffed SLA |
| Known limitations projected | **Met** in known-limitations register |
| npm registry publish | **Not done** (human H-E1b; dry-run workflow only) |
| CI green preferred | **Open** H-V1 |

## Path to conditional-go

When all of the following are true, file a new dated instance (do not edit this one silently):

1. Target A at least conditional-go conditions closed or explicitly re-accepted.  
2. Publish allowlist + `private: true` on immature packages.  
3. One product `hobo` bin story.  
4. README + package READMEs state offline/in-memory default and synthetic componentize if still true.  
5. Prerelease version/tag policy documented.  
6. First publish remains a **human** step (token + deliberate workflow); agents do not claim publish success without registry evidence.

## What this decision is not

- Not authorization to `npm publish` today.
- Not hosted multi-cloud readiness.
- Not a claim that jco/componentize-js is production-real.

## Outcome summary

**No-go for Target B** as of 2026-07-30. Engineering may continue publish **prep** (WP-B/D). External install claims (`npx`, public `@hobo/*` on npm) remain invalid until a later go/conditional-go instance.
