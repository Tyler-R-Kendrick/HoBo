---
type: Review Findings
title: "In-repo projects audit — packages, examples, draft proofs"
description: "Wide audit of projects inside the HoBo monorepo only (not other GitHub repos). Maturity tiers, family map, ranked gaps, and follow-ups. Audited at main tip concurrent with stations/yards README hygiene."
tags: [hobo, plans, audit, packages]
---

# In-repo projects audit

> **Scope:** this monorepo only — `packages/`, `examples/`, `src/draft/`, `site/`, `docs/`.  
> **Audited against:** production package inventory (~62 packages, ~133k `src/` LOC).  
> **Related:** ship residuals [`0013-post-merge-ship-gap-review.md`](./0013-post-merge-ship-gap-review.md); human blockers [`../design/instances/residual-human-blockers-2026-07-30.md`](../design/instances/residual-human-blockers-2026-07-30.md).

## 1. Executive map

| Surface | Count | Role |
|---|---:|---|
| Production packages | ~62 | Product + adapters |
| · public-ish (no `private`) | ~27 | Candidate publish set (still unpublished to npm) |
| · private | ~35 | Providers, IaC, SWE connectors, tooling |
| Substantial (≥3k src LOC) | 13 | Product spine |
| Medium (0.8–3k) | ~30 | Platforms / adapters |
| Thin / skeleton | ~19 | Topology, stubs, templates |
| Draft proof packages | ~650+ | Design evidence; **619 grandfathered** |
| Examples | 6 | Dogfood / golden paths |
| Site pages | ~138 | Pre-release docs |
| Design docs | ~623 | Canonical design |

## 2. Substantial spine (ship product)

`@hobo/hobo`, `identity`, `connectivity`, `broker` (private), `code`, `cli`, `cloud` (private), `core`, `runtime-local`, `conformance`, `runtime`, `bindles`, `replay`.

All have tests. Product bins: **`hobo` / `hobo-mcp` / `hobo-code`** on `@hobo/hobo` (+ `@hobo/code`).

## 3. Families

| Family | Packages | Notes |
|---|---:|---|
| Core top-level | ~34 | Spine + support planes |
| Providers | 11 | Cloud + CI runners; mostly private |
| Connectors | 7 | ACP + 6 SWE agents (near-clone shape) |
| Runtimes | 6 | local/wasm/oci/dapr/browser/cloud-native |
| IaC | 3 | pulumi/terraform/crossplane — **private**, default in-memory for Pulumi compose |
| Adapters | 1 | hono (skeleton) |

## 4. Examples

| Example | Maturity |
|---|---|
| `hello-bindle` | Offline golden path |
| `self-host-yard` | Full TS composition + tests |
| `self-host-station` | **CLI docs only** — no `src/` yet (labeled in README) |
| `durable-agent` / `multi-cloud-shop` | Thin but real |
| `ci-runner-balancing` | Large CI dogfood |

## 5. Draft proofs

- technical ~460 · exp ~161 · epic 26 · projects 7  
- **619 grandfathered** — artifact gate advisory for most (H-T1)  
- 28 `.feature` files — behavior lane present  

Do not treat draft package count as production maturity.

## 6. Ranked gaps (repo-internal)

### Do next (agent-cheap) — this PR / follow-ups

1. **Package READMEs** for medium+ packages missing them — **stations** (done here), **yards** (done here).  
2. **Label thin examples** — self-host-station honesty (done here).  
3. Keep **ship:gap-closure** green when touching launch instances.

### Do next (human / multi-day)

4. **H-V1** Actions runners — without this, no package is CI-proven on GitHub.  
5. **H-E1b** first npm alpha from allowlist.  
6. **H-T1** proof-hardening waves.  
7. Provider live-apply depth (H-E5) before multi-cloud claims.  
8. Optional: factor shared core for six SWE connectors.

### By design / not bugs

- Default in-memory IaC (HONEST SCOPE).  
- Private providers / IaC until cutline.  
- Thin topology packages vs heavy `@hobo/cloud` / broker.

## 7. Hygiene landed with this audit wave

- `packages/stations/README.md`  
- `packages/yards/README.md` (explicit thin-topology honesty)  
- `examples/self-host-station/README.md` maturity banner  
- This plan file + index row  

## 8. How to use this audit

- **Shipping product** → substantial public packages + hello-bindle.  
- **Adapter work** → private providers/iac/connectors.  
- **Design evidence** → `src/draft/` + grandfathered debt.  
- **Hosted GA** → residual ledger Target C, not package count.
