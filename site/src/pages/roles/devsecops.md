---
layout: ../../layouts/Docs.astro
title: HoBo for DevSecOps
description: "Security professionals write policy — camp approval rules, credential policy for humans and agents, and above all the policy packs that govern junction borders."
---

# HoBo for DevSecOps

**You write policy.** Not PDFs — the machine-enforced rules that every deploy, every inferred camp, every migration, and every credential grant must pass. In HoBo, policy isn't advisory review after the fact; it runs *inside* the convergence loop, and a failed check stops the mutation before it happens.

## Where your rules bite

| Surface | What your policy decides |
|---|---|
| **The gate** | Every `hobo up` re-runs the applicable gate before mutation — a stale preflight can never authorize a deploy. Your checks are part of that gate. |
| **Camp approval** | Inferred camps are approved by policy, not automatically. You define what an acceptable home looks like (provider, region, runtime, data class). |
| **Migration gates** | Continuous migration only moves an app when the destination passes the same checks — cost never outranks compliance. |
| **`.allow()` review** | Developers' least-privilege grants live in the bindle diff. Deny-by-default linking means an undeclared edge doesn't exist at runtime. |
| **Credential brokering** | Humans *and* AI agents get short-lived, task-scoped tokens under a machine-readable capability standard — no static keys to leak. Issuance itself is an event. |
| **Junction borders** | Your highest-leverage surface — see below. |

## Junctions are where your policy matters most

A [junction](/HoBo/primitives/junctions/) is where clouds meet, so it's where sovereignty, residency, and egress live. Junction policy travels as **signed policy packs** — versioned artifacts federated to the member yards, because a junction shares no mutable state:

- **Residency & sovereignty:** which data classes may live in which yards, and what may never cross a border — the Dispatcher can't propose a cross-cloud move your pack forbids.
- **Egress & connectivity:** what the inferred cross-cloud connectivity plane is allowed to connect.
- **Placement lockdown:** the junction broker admin can turn camp inference off entirely, requiring explicit, approved camps — placement as a deliberate act.
- **Trust federation:** signed registry bundles and trust roots decide which providers and adapters are even installable (`hobo add` enforces signature, provenance, and conformance checks).

## Evidence, not assertions

Everything above lands in the same append-only event log as the deploys it governs:

- **Every decision is a fact.** Policy passes, refusals, camp approvals, token grants — attributable, replayable, exportable.
- **`hobo attest`** produces signed audit-evidence exports for your assessors.
- **`hobo erase`** performs crypto-shred erasure with projection rebuild when data must genuinely disappear.
- **Time travel is an audit tool:** "where did this workload live in March, under which policy version, and who approved the move?" is a query, not an investigation.

## Working with the other roles

- [Developers](/HoBo/roles/developers/) hand you a reviewable `.allow()` surface in every PR — push grant hygiene there, and the rest of the pipeline stays quiet.
- [Platform engineers](/HoBo/roles/platform-engineers/) own the map your policy constrains; the approved-provider set and your packs compose — the Dispatcher obeys both.
- [Agents](/HoBo/agents/) are principals under exactly your credential policy — no special lane, and every action they take is in your log.
