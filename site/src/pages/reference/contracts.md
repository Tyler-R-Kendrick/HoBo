---
layout: ../../layouts/Docs.astro
title: Contracts & Gatekeeper
description: "BoundaryContract IR, checkCompatibility, can-deploy, and Gatekeeper composition with machine-readable reasons."
---

# Contracts & Gatekeeper

## BoundaryContract (Contract IR)

Versioned producer/consumer boundary:

- `id`, `version` (semver), `mode` (`declared` \| `inferred` \| `observed` \| `promoted`)
- `edge` — kind, producer, consumer, channel, operation
- `requiredShape` — format + required/provided fields
- `contractHash` — content address (`sha256:…`)
- optional **`effects`** — [EffectSpec](/HoBo/reference/effects/)
- optional **`resilience`** — [ResilienceProfile](/HoBo/reference/effects/)

Constructors: `parseBoundaryContract` / `createBoundaryContract` (parse-don’t-validate).

## Compatibility

`checkCompatibility(prev, next)`:

| Change | Result |
|---|---|
| Added provided fields | Compatible |
| Removed required/provided field consumers need | Breaking (`required-field-removed`) |
| Channel change / version regress | Breaking |
| Effect widening when effects declared | Breaking (`effect-widened`) |

## can-deploy

Given deployed contract state + candidate deployment plan → compatibility matrix + `compat.GatePassed` / `compat.GateFailed` with agent-actionable reasons.

## Gatekeeper

Composes into one decision (`allow` \| `allow-degraded` \| `deny` \| `require-approval`):

1. can-deploy (contracts)
2. policy pack (`@hobo/policy`) — **always** emits `policy.Decided`
3. obligations
4. cost/quota
5. optional secretless-config / can-migrate dimensions

Also surfaces **effectSummaries** and optional reasons with `gate: "effects" | "resilience"`.

## Describe / export

- `formatContractDescribe(contract)` — human CLI-style text
- `toEffectManifest(…)` — JSON export for MCP/SRE/policy

## Package

`@hobo/contracts` · harness in `@hobo/contract-harness`

## Related

[Testing: contracts](/HoBo/testing/contracts/) · [Testing: deployment](/HoBo/testing/deployment/)
