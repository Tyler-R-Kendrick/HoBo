---
type: Reference
title: "Known Limitations Register"
description: "Source issue: HOBO-485."
tags: [hobo, design]
---

# Known Limitations Register

This register is the customer-facing source for v1 limitations, scope-out
claims, beta caveats, simulated/reference proof, unsupported states, and
post-GA follow-up routing.

It feeds the release notes, support scripts, docs portal, and launch messaging
claim register. A limitation is publishable only when the customer-visible
wording, owner, workaround, state, handoff routes, and review checkpoint are
present.

## Register Fields

| Field | Required meaning |
|---|---|
| Limitation | Stable id and customer-safe summary of the limitation or scope-out item |
| Affected persona | Buyer, admin, operator, developer, support, or release owner impacted by the limitation |
| User-visible impact | What a customer may see or not be able to do |
| Workaround | Supported action, supported path, or explicit "no workaround yet" statement |
| Owner | Accountable HoBo project or subsystem owner |
| Follow-up issue | Required when the limitation needs product, docs, support, or launch work after M0 |
| Release-note section | Where final release notes must surface the limitation |
| Support-script route | How support explains or escalates the limitation |
| Docs route | Docs location that must carry the customer-facing note |
| Launch-messaging disposition | Whether launch copy may say implemented, beta-only, simulated/reference, unsupported, or deferred |

## Initial V1 Entries

| Limitation | State | Affected persona | User-visible impact | Workaround | Owner | Follow-up | Handoffs |
|---|---|---|---|---|---|---|---|
| Supported paths are evidence-backed only | `real` | Customer admin choosing a launch path | Release notes can name supported SaaS, self-host, or local paths only when evidence exists | Choose an evidence-backed launch path or treat the request as a limitation | V1 Release Program & Cutline | None | Release notes, docs portal, launch messaging |
| Reference proof is not live hosted behavior | `simulated-reference` | Buyer evaluating launch claims | Customer-facing copy must label reference proof separately from production hosted evidence | Use proof-mode labels and link the accepted contract or demo fixture before publication | V1 Launch Site, Messaging & Demo Assets | HOBO-458 | Release notes, docs portal, launch messaging |
| Dogfood/private-beta operations evidence is not GA operational proof | `beta-only` | Private-beta customer admin | Beta users may see operational caveats and support routing before GA evidence exists | Publish beta-only wording with support route, accepted risk, and review gate | V1 Dogfood Yard & Hosted Operations | HOBO-455 | Release notes, support scripts, launch messaging |
| Unsupported install environments stay outside supported v1 bootstrap claims | `unsupported` | Self-host operator | Operators outside the smoke matrix receive limitation text instead of support promises | Use supported SaaS, self-host, or local paths with accepted smoke evidence | Bootstrap Installer | HOBO-501 | Release notes, docs portal, support scripts |
| Rollback drills are not production recovery guarantees | `post-ga` | Release owner and support operator | Rollback guidance distinguishes drill evidence from unsupported production recovery promises | Link drill evidence and state unsupported rollback paths explicitly | Backup & Restore | HOBO-498 | Release notes, support scripts |
| Full migration automation is deferred | `deferred` | Workspace administrator planning a migration | Migration notes can describe supported manual guidance and compatibility evidence, not complete automation | Use documented migration guidance and compatibility notes until automation evidence lands | Upgrade & Migration | HOBO-430 | Release notes, docs portal, support scripts |
| Live support automation is out of scope for M0 docs | `unsupported` | Support lead | Support copy can describe channels and escalation coverage, not live support automation | Use support SLA/channel records and manual support scripts until tooling evidence lands | Support Workflow | HOBO-448 | Release notes, docs portal, support scripts, launch messaging |

## Handoff Targets

| Target | Consumes | Required evidence |
|---|---|---|
| Release notes | State, impact, workaround, owner, release-note section | Customer-visible wording, owner, review checkpoint |
| Support scripts | Support route, workaround, owner, follow-up issue | Support route, unsupported request class, escalation owner |
| Docs portal | Docs route, state, release-note section | Docs route, freshness owner, known-limitation metadata |
| Launch messaging | Disposition, state, owner, follow-up issue | Claim state, proof mode, approved limitation wording |

## Scope-Out Marketing Guard

A scope-out, unsupported, deferred, beta-only, or simulated/reference item may
appear only as a known limitation, beta caveat, simulated/reference note,
unsupported item, deferred item, or follow-up. It cannot be marketed as a
supported v1 capability.

Launch claims that mention live hosted dashboards, all-provider support,
automated support desks, production recovery guarantees, or unsupported
environments must route through this register before publication.

## Review Checkpoints

| Gate | Owner | Blocks publication when stale |
|---|---|---|
| Beta | V1 Release Program & Cutline | Yes. Every limitation needs owner, customer-visible text, state, support route, and follow-up issue when needed. |
| GA | V1 Release Program & Cutline | Yes. Every limitation needs owner, customer-visible text, state, reviewed-at evidence, and GA disposition. |

## Proof

Executable proof lives in
[`../../src/draft/exp-proofs/known-limitations-register-contract`](../../src/draft/exp-proofs/known-limitations-register-contract/README.md).
The proof includes protobuf data shapes, CUE constraints, a PACT boundary, and
tests for required fields, handoff mapping, scope-out claim rejection, beta/GA
review checkpoints, and customer-safe release-note projection.
