---
type: Implementation Plan
title: "Standards alignment + thin Convex provider — critique, revised instruction, delivery"
description: "Fact-checked critique of the draft Crossplane/OAM/CNAB standards-alignment + Convex-provider agent instruction, the corrected revision, and the delivered implementation map (ADR-0144, provider-convex, impedance docs, wasp capture, golden coverage)."
tags: [hobo, plans, standards, convex, crossplane, providers]
---

# Standards alignment + thin Convex provider — critique and delivery

Adversarial review of the draft "Standards Alignment, Thin Provider Adapters,
and Future-Proofing" instruction, followed by what was actually implemented.
Every correction was verified against the repo.

## §A Critique of the draft instruction

### A1. Factual corrections (each would have derailed a one-shot run)

| # | Draft assumption | Repo reality |
|---|---|---|
| 1 | Ports `database`, `vector`, `blobstore`, `function`, scheduling exist | None exist as core ports. `packages/core/src/ports/` has no such files; `vector` and `function` appear nowhere in code. Real vocabulary: bindle kinds (`data`, `bucket`, `queue`, `schedule`, `api`, …, `packages/bindles/src/types.ts` `CATALOG_ROWS`) and provider equivalence ports (`compute`, `kv`, `objectStore`, `database`, `database/reactive`, `web/service` — `packages/providers/*/src/equivalence.ts`). `docs/competitors/convex.md:490`'s `database`/`vector`/`blobstore` port list is aspirational doc text. Scheduling lives in `packages/core/src/ports/clock.ts` (`CronSchedule`, `VirtualClock`) and the `schedule` bindle kind (`hobo:scheduler`, not yet implemented as a port). |
| 2 | "`.with(convex.*)` escape hatches marked non-portable" on Bindles | `assertNoBindleProviderSelection` (`packages/bindles/src/requirements.ts`) **throws** on any non-`hobo` annotation in a Bindle — provider option blocks are only legal at Camp/Yard scope. Non-portability marking already exists: the ADR-0024 **PortabilityReport** (`deployment.PortabilityReported`) scores provider `.with()` blocks, `.raw()` leaks, and paradigm mismatches. The instruction re-invents an existing, stronger mechanism. |
| 3 | "Add or flesh out a thin `@hobo/provider-convex`" | No Convex code exists anywhere — every hit is prose. Greenfield package following `provider-lakebed`/`provider-cloudflare` anatomy (`data-models/` proto+CUE, `contracts/*.pact.json`, `manifest.ts` publishing `hobo.capability-manifest/v1`, per-provider structural `CloudProvider` — it is NOT in `@hobo/core`). |
| 4 | Provisioning "targets Convex Management API / deploy keys" as a given | The repo's honesty gate (`docs/design/live-provider-matrix.md`) requires: cred-gated live paths fail closed without env, presence-only env checks, injected `fetch` (patterns: `packages/providers/runner-github`, `packages/hobo/src/cloudflare-client.ts`). Deploy keys are static secrets — they must ride the token broker / `secretRef` path, never Bindle config. |
| 5 | "Create or update an impedance mismatches section" | No `impedance` convention exists in `docs/` (zero hits). `convex.md` already has `### Where HoBo deliberately differs` and the mandated layout (`overview → feature surface → differentiators → ## HoBo mapping`); the impedance material belongs as a subsection under `## HoBo mapping`, tied to the PortabilityReport machinery. |
| 6 | Wasp competitor note "if useful" | `docs/competitors/wasp.md` does not exist and the index's future-competitor backlog is recorded as cleared — adding it is a deliberate reopening, done via the mandated layout + index row. |
| 7 | "Versioning guidance … inspired by XRD versioning" as an update | Real gap confirmed: `ResourceDefinition` (`packages/cloud/src/registry/catalog.ts`) has **no version field**; only Packs are versioned and `catalogHash` pins snapshots. This is the net-new decision an ADR must carry. |
| 8 | New ADR "under docs/design/adr/" | ADRs are `## ADR-NNNN` sections in four theme files + a gate-enforced index row (`docs/design/adr/index.md`); next free number **ADR-0144**; correct home `07-portability-extensibility.md` (hosts ADR-0024 portability, ADR-0064's "would Convex/Nitric/Lakebed ship this?" scope test, ADR-0075 external-spec tracking). |
| 9 | Crossplane mapping to be "recorded" | Already recorded in `docs/competitors/crossplane.md` `## HoBo mapping` (XRD+Composition ↔ Resource Definitions + Matching, ✅/➕). What's missing is the *design-suite* decision (competitor docs are link-only scanned and non-normative). OAM posture also already on record (wadm render target, explicitly not HoBo's model — ADR-0108); CNAB has zero repo presence, including the Bindle↔CNAB-"bindle" naming collision worth a note. |
| 10 | Golden examples: "pure portable Bindle + Convex realization" | Closest existing golden is `examples/multi-cloud-shop` (`b.kv().allow(...)`, `b.queue().allow(...)`). `BindleBuilder` exposes only 12 of 24 kinds (no `b.schedule()`), and portable/Convex port vocabularies must line up through equivalence classes — golden coverage is delivered as executable provider tests instead of a new example package. |
| 11 | "match.Decided" as the only selection record | Correct, but the dispatcher/planner payload divergence (documented in `docs/plans/0015-radius-seam-hardening-instruction.md` §A) still stands; this pass does not touch it. |

### A2. What the improved instruction changed

- **Reuse over invention**: impedance = PortabilityReport + paradigm vocabulary
  (`relational|document|kv|graph|vector|lake|olap` already in Plan 25);
  non-portable marking = ADR-0024; definition lifecycle events = existing
  `resourcedef.*` family; provider defaults = `definitionsFor(provider)`
  derivation from the published capability manifest.
- **Honesty gates made explicit**: fail-closed no-credential tests, presence-only
  env checks, `live-provider-matrix.md` registration, no "vector port" claims
  while none exists (vector search is a `search.vector` capability feature on the
  reactive-database capability until a port lands).
- **Scope trims**: no dual authoring (already out of scope), no new example
  package (guard-exempt but convention-heavy; golden coverage rides provider
  tests), Wasp as a compact capture not a runtime target.
- **ADR-0144 scoped precisely**: external-spec posture (Crossplane/OAM/CNAB
  "map at the boundary, never depend"), the concept-mapping table, and the
  net-new Resource Definition versioning rules — one decision, one section.

## §B Delivered implementation

1. **ADR-0144** — `docs/design/adr/07-portability-extensibility.md` + index row:
   external-standards posture (XRD↔Resource Definition schema, Composition↔
   provider realization/`definitionsFor`, Claim↔bindle kind consumption, OAM
   Application/Component/Trait↔Bindle/resource/`.allow()`+policy+Trails, CNAB→
   packaging/signing lessons only + naming-collision note), Resource Definition
   versioning rules (stable shape per definition id; breaking change ⇒ new id or
   recorded conversion; `catalogHash` in `match.Decided` pins snapshots;
   `resourcedef.*` events), core-IR independence statement.
2. **platform-engineering.md** — new "Definition versioning & standards posture"
   subsection citing ADR-0144; AI-generation sandbox text untouched (already
   normative).
3. **crossplane.md / convex.md** — mapping sections cross-link ADR-0144;
   convex.md gains `### Impedance boundaries for the provider path` (document
   model, reactive-vs-replay, 1 s/1 MiB/10 min limits, OCC-vs-leases, TS/JS-vs-
   WIT, control-plane time-travel boundary) and the provider section now points
   at the real package.
4. **`docs/competitors/wasp.md`** — new capture per mandated layout + index row
   (App-Kit inspiration + packaging path; not a runtime target).
5. **`packages/providers/provider-convex`** — thin, honest provider: structural
   `CloudProvider` with `web/service` + `objectStore` + `database/reactive`
   capabilities (vector search + scheduled functions as capability features),
   `realize()` → `DriverProgram` (lakebed shape), capability manifest with
   broker-held deploy-key auth (`staticSecrets: false`), credential-gated
   Management API client (injected fetch, presence-only gating, fail-closed
   test), impedance constants exported for PortabilityReport consumers,
   proto+CUE, pact, README/ADR; registered in `live-provider-matrix.md`.
6. **Golden coverage** — provider tests: portable Bindle (passes
   `assertNoBindleProviderSelection`) whose port requests are satisfied by
   derived Convex definitions (`definitionsFor`), `.allow()` verbs surfaced,
   impedance limits asserted; manifest parse round-trip.
7. **AGENTS.md** — Bindle+ports path-of-least-resistance guidance + impedance
   pointer under "HoBo implementation architecture rules".

Gates: architecture guard, staged `agent:check`, docs lint/freshness, package
tests — all green (see PR).
