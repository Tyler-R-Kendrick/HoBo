---
type: Implementation Plan
title: "Radius seam hardening — critique and revised one-shot instruction"
description: "Fact-checked critique of the draft Radius/KubeFleet-inspired agent instruction plus the corrected, standards-aligned revision: typed realization output contract, HoBo-native placement vocabulary, match.Decided convergence, app-graph projection, staged progressive rollouts."
tags: [hobo, plans, radius, matching, progressive, drivers]
---

# Radius Seam Hardening — critique and revised one-shot instruction

A critical review of the draft "Radius Seam Hardening + Fleet Progressive/Placement
Patterns" agent instruction, followed by the corrected, standards-aligned revision.
Every correction below was verified against the repo at the cited path.

## §A Critique of the draft

### A1. Factual errors

| # | Draft claim | Repo reality |
|---|---|---|
| 1 | "Relevant ADRs under `docs/design/adr/`" implying per-ADR files | ADRs are `## ADR-00xx` sections inside four theme files (`01-architecture-core.md`, `02-identity-security.md`, `03-data-plane.md`, `07-portability-extensibility.md`) plus the standalone unnumbered `yard-first-placement.md`. Cite as `adr/01-architecture-core.md#adr-0033`. The numbers ADR-0033 (Matching), ADR-0071 (Dispatcher), ADR-0088 (specificity vectors) are correct. |
| 2 | `RealizationResult {values, secrets, resources}` as "harden existing" | That triple is Radius Recipe vocabulary (`docs/competitors/radius.md:25`); it exists nowhere in HoBo. HoBo's *designed* Driver output is `{outputs, manifests?, state?}` (`docs/design/platform-engineering.md` §Drivers). Implemented reality: `CloudProvider.realize(plan) → {iac, build?}` (`packages/providers/provider-*/src/types.ts`), and IaC adapters returning `{resources, stackOutputs, bindings}` with `${resources.X.outputs.Y}` placeholders (`packages/iac/iac-terraform/src/terraform-adapter.ts:371`). The `hobo:iac/provider` port is typed `(program: unknown) => Promise<unknown>` — the true gap is *typing the port*, not renaming Radius's shape. |
| 3 | Driver `provision` as an existing port | No `Driver` port exists in `packages/core/src/ports/`; Plan 25's Driver is design-only. One concrete emit-side instance: `DriverProgram` (`packages/providers/provider-lakebed/src/driver-program.ts`, `hobo.driver-program/v1`). |
| 4 | "Keep the existing `match.Decided` (full ranking, rejected candidates, tie flag, catalog content-hash)" | Two divergent live payloads share the `match.Decided` literal. The **dispatcher** (`packages/dispatcher/src/dispatcher.ts`) matches the canonical proto (`src/draft/technical-proofs/control-plane-event-schema-contract/proto/control_plane_events.proto:28`) with `ranking`, `rejectedCandidates {definitionId, reason}`, `tie`, `catalogContentHash`. The **cloud planner** (`packages/cloud/src/plan-types.ts:51`, `planner/matching.ts:146`) still emits flat `rejected: string[]`, no `tie`, and `catalogHash`. `yard.MatchDecided` (broker) and an identity-migration audit reusing the literal add to the confusion. The draft misses this convergence bug entirely. |
| 5 | "Extend Trails … OpenDelivery-shaped ports" | The Harness — `OpenDeliveryEngine`, `RolloutStage {percent, duration?, analysis?}`, `RolloutPolicy`, `RolloutState`, `ROLLOUT_EVENTS` — lives in **`@hobo/identity`** (`packages/identity/src/harness-delivery.ts`; confirmed by `docs/design/package-namespaces.md:68`), not trails. Trails has ordered steps + `rampSteps [10,50,100]` + `progressive-flags.ts` only. |
| 6 | "CLI modeled on `rad recipe register`… `rad app graph`" as new verbs | The canonical verb list (`packages/cli/src/shell/verbs.ts`, 41 verbs) has no `register`, `graph`, `dry-run`, or `list`. Existing surfaces: `add` (install provider/listing), `registry`, `plan` (*"Dry-run the up decision"*), `inspect`. MCP tools are **derived** from `CANONICAL_VERBS` (`packages/mcp/src/tool-surface.ts` `deriveToolSurface`), so "CLI + MCP parity" means extending a canonical verb — parity is then automatic and enforced by `assertToolSurfaceParity`. |
| 7 | Topology projection as greenfield | Correct that no app-graph read-model exists — but the draft ignores the artifacts to build on: `deploymentViewProjection` (`packages/cloud/src/projections/deployment-view.ts`, the saga-graph fold), the `hobo.topology-objects/v1` contract (`packages/bindles/src/topology/scope-bindle.ts`, `packages/camps/src/types.ts`, `packages/yards/src/yard.ts`, `attachCampToYard`), `topology.JunctionComposed` (`packages/junctions/src/types.ts:10`), and the designed `TopologyView`/`ResourceLinkView` (`docs/design/deployment-dashboard-topology-explorer.md:87`). `RoutingTopology` (`@hobo/stations`) is traffic-only — don't conflate. |

### A2. ADR conflict in deliverable 2

KubeFleet vocabulary (`affinity`, `topologySpreadConstraints`, `PickN`,
`clusterSelector`) has zero code presence, and two ADR commitments stand in the
way: `adr/07-portability-extensibility.md:594` **forbids Kubernetes/Gateway-API
types in `@hobo/core`**, and `adr/01-architecture-core.md:419` **delegates
spread/anti-affinity to wadm** (spreadscaler host labels), with
`docs/design/platform-engineering.md:88` recording "a full Nomad-class constraint
language is not yet committed" (tracked in `GAPS.md`). Importing K8s-shaped
selectors as-is would violate an accepted ADR. The fix is a HoBo-native
placement-constraint vocabulary (proto+CUE) that *cites* the KubeFleet semantics,
plus an explicit statement of what remains delegated to wadm.

### A3. Missed reuse

- **Progressive**: `RolloutStageRecord/RolloutPolicyRecord/RolloutStateRecord`
  already exist in `packages/identity/data-models/identity.proto:331+` — extend
  them with groups/concurrency/maxFailures/approval/resume rather than a parallel
  schema. Approval gates should compose the existing policy `require-approval`
  effect (`packages/policy/data-models/policy_ir.cue:33`) and A2H
  (`SafetyEnvelope`, `A2HHandoffPackage` — `packages/cloud/src/cd/incident-a2h.ts`),
  not invent an approval system. Dry-run evidence should follow the
  `evaluateUpgradeDryRun` report pattern (`packages/trails/src/upgrade-preflight.ts`).
- **Secrets**: the draft's `secrets: Record<string, unknown>` invites raw secret
  values into results. HoBo's committed modes are `secretRef` / `fromBinding` /
  `provider-federation` (`packages/bindles/src/secret-surface.ts:7`), and
  `SecretRef` is deliberately *not* a resource handle
  (`packages/bindles/test/catalog-types.test-d.ts:37`). Output-contract secrets
  must be `SecretRef`s only.
- **Matching criteria**: today's context is `envType·app·env·resourceClass·resourceId (+tenant)`
  with a precomputed `specificity` scalar (`packages/cloud/src/registry/catalog.ts`);
  no criteria proto/CUE exists — that is the seam to fill. Ranking must stay the
  lexicographic `specificity → priority → objective → id`
  (`packages/cloud/src/planner/matching.ts`), goldens at
  `src/draft/technical-proofs/matching-specificity-vectors`.
- **Conformance**: follow the suite-per-port pattern
  (`packages/conformance/src/suites/*` + per-adapter pacts).

### A4. Standards alignment (the ask the draft under-delivers)

The repo's stated posture (`docs/standards/index.md`) is to *speak existing
standards at the boundary*. The draft never names one. The revision splits:

- **Mandated reuse (already repo commitments)**: `EventEnvelope` + CloudEvents 1.0
  boundary projection (`packages/core/src/envelope.ts`); Protobuf+CUE with
  generated `_pb.ts` as the only record types + PACT per boundary
  (`docs/design/technical-standards.md`); OpenFeature/OFREP for anything
  flag-shaped (`packages/identity/src/openfeature-provider.ts`, ADR-0044/0083);
  WIT port ids; OCI digest addressing; CycloneDX (TR-112) where supply-chain
  applies; W3C `traceparent` in `meta`.
- **Offered, bounded**: CDEvents-aligned event naming for stage/group transitions
  and Score-file import as registration interop — both already named in repo docs
  (`docs/design/finops-budget-routing-control-plane.md:130-142`,
  `docs/design/sdk-api.md:23`).
- **Forbidden as new scope**: CEL (named once, unimplemented), GraphQL (draft POC
  only), Bicep (zero code), OAM-as-model (render target only), K8s types in core.

### A5. Process and gate gaps

Missing from the draft's gate list: `pnpm run agent:check -- --base=origin/main`
(the impact-selected gate that actually runs in this repo), `codegen:check`,
`generated:guard`, `promotions:check`, `konsistent`, and the behavior lane
(`test:behavior`). Missing norms: conventional scoped commits; the draft-proof
cascade with promotions-ledger freezing (`scripts/promotions.json`,
`scripts/check-promoted-proof-drift.mts`) when proofs are promoted; the
`// public-contract:` / `// domain-view:` annotations `standards:check` and
`architecture:guard` enforce. The subagent section names owners but not the
contested files, which is where parallel agents actually collide. Acceptance
criteria like "feel Radius-familiar" are untestable.

---

## §B Revised one-shot instruction

# HoBo: One-Shot Agent Instruction — Radius Seam Hardening + Fleet Progressive/Placement Patterns (rev. 2)

## Mission

You are an expert TypeScript platform-engineering agent operating exclusively in
the HoBo monorepo. Implement the leverage recommendations distilled from Radius
(developer/platform seam: Recipes, Connections, Application Graph, recipe output
contract), AKS Fleet/KubeFleet (property-aware placement, staged UpdateRuns),
Rancher Fleet (targeting, progressive groups), and Radix (reconciliation/facade
DX) — **by extending the exact HoBo artifacts named below**, never by inventing
parallel systems. Deliver one coherent, tested, documented change set that passes
every repository gate. Do not introduce phases or timelines.

HoBo differentiators to preserve untouched: WIT/WASM membrane; event-sourced
control+data plane; continuous Trails; agent-as-principal (SVIDs, MCP, Crew);
code-first IfC; self-hostable Yards; scored auditable Matching + FinOps
Pareto/Dispatcher.

## Non-negotiable invariants

1. Event sourcing is the source of truth. Every new event rides the canonical
   `EventEnvelope` (`packages/core/data-models/event_envelope.proto`,
   `packages/core/src/envelope.ts`) — this gives the CloudEvents 1.0 boundary
   projection for free; never invent a second envelope. Event type names match
   `^[a-z][a-z0-9]*\.[A-Z][A-Za-z0-9]*$` and are catalogued in
   `docs/design/event-families.md`.
2. Ports live in `@hobo/core`; adapters implement ports and never import each
   other; every new/changed adapter passes the relevant `@hobo/conformance` suite
   (pattern: `packages/conformance/src/suites/*` + a per-adapter
   `contracts/pacts/*.pact.json`).
3. Matching stays a pure deterministic function of
   `(catalog snapshot, deploy context, objective)` — no clock/RNG/network/LLM on
   the decision path; credit/budget state pinned as input; ranking stays
   lexicographic `specificity → priority → objective → definition id` (ADR-0033,
   ADR-0088; `packages/cloud/src/planner/matching.ts`).
4. Camps remain provider-neutral until Yard attachment; Yards own provider
   selection; Trails are the only cross-Yard re-home mechanism.
5. `docs/design/technical-standards.md` is mandatory: TypeScript only;
   Protobuf+CUE in package-local `data-models/` with generated
   `src/_generated/**_pb.ts` as the only record types (`// domain-view:` /
   `// parallel-type-allowed:` for deliberate exceptions); parse-don't-validate;
   PACT on boundaries; exported string-literal constants carry
   `// public-contract: <why>`; CQRS/actors/projections.
6. Kubernetes/Gateway-API types are forbidden in `@hobo/core`
   (`adr/07-portability-extensibility.md#adr-0107` region). Placement vocabulary
   must be HoBo-native (see deliverable 2); spread/anti-affinity execution stays
   delegated to wadm (`adr/01-architecture-core.md:419`) — record what the new
   vocabulary *plans* versus what wadm *executes*.
7. Keep status comments honest: in-memory Pulumi stand-in and synthetic paths
   remain gated/honest; no claims of live multi-cloud apply.

## Required context (read before code)

`README.md`; `docs/design/{vision,architecture,platform-engineering,glossary,technical-standards}.md`
(Plan 25 anchors: §A Resource Definition, §Matching, §The selection algorithm,
§Environments, §Deployment Sets + Deltas, §Drivers);
`docs/competitors/radius.md` (§"HoBo mapping" table is the baseline contract; the
Application Graph row is honestly ◐);
ADRs — cite as `docs/design/adr/<theme>.md#adr-00xx`: ADR-0033/0071/0088
(01-architecture-core), ADR-0015 Gatekeeper, ADR-0044/0083 Harness, ADR-0094
safety rails, ADR-0104 SLO rollback, ADR-0134 Trails (02-identity-security),
plus the standalone `adr/yard-first-placement.md`;
`docs/standards/index.md` (boundary-standards posture); `AGENTS.md`; `GAPS.md`
(append-only register — reference GAP ids, never renumber);
proofs: `src/draft/technical-proofs/{matching-specificity-vectors,control-plane-event-schema-contract,topology-objects-contract,driver-dispatch-routing-contract}`.

## Deliverable 1 — Typed, versioned realization output contract

**Gap being closed:** `hobo:iac/provider` (`packages/iac/*/src/port.ts`) is typed
`(program: unknown) => Promise<unknown>`; Plan 25's Driver is design-only; the
three IaC adapters already converge on `{resources, stackOutputs, bindings}` with
`${resources.<name>.outputs.<key>}` placeholders
(`packages/iac/iac-terraform/src/terraform-adapter.ts:371`, mirrored in
`iac-crossplane`). Radius's `{values, secrets, resources}` is the semantic
reference, not the literal shape.

- Define `RealizationResult` (schema id `hobo.realization-result/v1`) as a new
  port module `packages/core/src/ports/driver.ts` implementing Plan 25's Driver
  surface, with proto+CUE in `packages/core/data-models/` and codegen:
  - `values: Record<string, unknown>` — non-sensitive outputs for dependents
    (superset home for today's `stackOutputs` + flattened `bindings`).
  - `secrets: Record<string, SecretRefRecord>` — **references only**, aligned
    with `SecretRef` (`packages/bindles/src/secret-ref.ts`) and the three
    committed binding modes (`secretRef | fromBinding | provider-federation`,
    `packages/bindles/src/secret-surface.ts:7`). A conformance check rejects any
    result whose `secrets` values are not refs.
  - `resources: RealizedResourceRecord[]` — stable ids of created/adopted backing
    resources; ids that are artifacts use OCI digest form; adopted resources
    reuse the `adopt-in-place-contract` external-id shapes
    (`terraform://…`, provider URN).
  - optional `manifests?`, `state?`, `diagnostics?`, `drift?` — reconciling the
    Plan 25 `{outputs, manifests?, state?}` design so the doc and code converge.
- Retrofit: type the `hobo:iac/provider` methods against the new records; map the
  terraform/crossplane/pulumi adapters via a shared helper
  (`fromIacOutputs({resources, stackOutputs, bindings}) → RealizationResult`);
  add `fromRecipeOutputs({values, secrets, resources})` as the clean-room
  Radius/Terraform-output ingestion helper (no Radius dependency). Placeholder
  resolution (`${resources.X.outputs.Y}`) reads `values` through one resolver.
- `CloudProvider.realize` keeps returning `{iac, build?}`; the realization
  *result* (post-apply) is where the contract binds — wire it through
  `resource.Provisioned` so dependents and the graph consume one shape
  (`driver-dispatch-routing-contract` documents this path).
- Conformance: add `packages/conformance/src/suites/driver-output.ts` (valid
  shape, ref-only secrets, stable resource ids, placeholder round-trip) and run
  it from each IaC adapter's tests; PACT fixture per adapter.

## Deliverable 2 — Matching criteria/scoring extensions + registration UX

- Introduce the missing **criteria contract**: proto+CUE records in
  `packages/cloud/data-models/` for a HoBo-native constraint vocabulary —
  property selectors (cost, capacity, region, latency, custom keys),
  affinity/anti-affinity between resource classes, spread across
  regions/yards/junctions, and cardinality (`pickN`) — semantics cited from
  KubeFleet, shapes HoBo-native (invariant 6). `ResourceDefinition.satisfies`
  and the specificity scorer consume them; the grouped 0..3 specificity vector
  (ADR-0088) gains documented groups for the new dimensions.
- **Converge `match.Decided` to the canonical proto**
  (`control_plane_events.proto:28`): upgrade the cloud-planner emitter
  (`packages/cloud/src/plan-types.ts:51`, `planner/matching.ts:146`,
  `events.ts:172`) to carry `ranking`, `rejectedCandidates {definitionId, reason}`,
  `tie`, `catalogContentHash`, plus the new property/topology decision vector;
  keep the dispatcher emitter in lockstep; migrate `deployment-view.ts` folds.
  This closes a real divergence bug — treat it as in-scope, not incidental.
- Registration/list/dry-run UX: extend the **existing** canonical verbs — `add`
  (definition/provider registration sugar over the catalog), `registry`
  (listing), `plan` (dry-run: show the would-be `match.Decided` with full
  ranking and rejection reasons), `inspect`. Adding/extending canonical verbs in
  `packages/cli/src/shell/verbs.ts` gives MCP parity automatically via
  `deriveToolSurface` (`packages/mcp/src/tool-surface.ts`) — do not hand-write
  MCP tools. Optional interop: accept a Score file as a workload-spec input on
  the registration path (already committed as import-only interop,
  `docs/design/sdk-api.md:23`). Registration remains sugar over the scored
  catalog — never a static one-recipe-per-environment table.
- Goldens: extend `matching-specificity-vectors` with vectors for each new
  dimension, ties broken deterministically, and objective interplay
  (min-cost/maximize-credits unchanged). Existing vectors stay green byte-for-byte.

## Deliverable 3 — Application-graph projection (event-sourced)

- New read-model in `packages/cloud/src/projections/` (beside
  `deployment-view.ts`, reusing its fold/projection pattern) materializing:
  Bindle resources + `.allow()`/Connection edges (topology-objects contract,
  `packages/bindles/src/topology/scope-bindle.ts`), Camp↔Yard attachments
  (`attachCampToYard`), Junctions (`topology.JunctionComposed`), realized
  resources (from `RealizationResult` on `resource.Provisioned`), and placement
  decisions (`match.Decided` ranking summary). Shape it as the designed
  `TopologyView`/`ResourceLinkView`
  (`docs/design/deployment-dashboard-topology-explorer.md:87`) so the future
  dashboard consumes it unchanged; edges carry `connectivityTier` and
  `estimatedCostUsd` where derivable.
- Pure fold over the event log; deterministic golden test (fixed event fixture →
  byte-stable JSON). Do not touch `RoutingTopology` (`@hobo/stations`) — that is
  traffic routing, not the app graph.
- Surface: extend the `inspect` canonical verb (e.g. `hobo inspect graph
  [--app] [--format json|text]`); MCP parity is automatic. GraphQL is out of
  scope (draft POC only); structured JSON + text is the contract.

## Deliverable 4 — Staged progressive strategies (Harness-first, Trails-composed)

- Extend the **existing** rollout records in
  `packages/identity/data-models/identity.proto:331+` and
  `packages/identity/src/harness-delivery.ts` (`OpenDeliveryEngine`) — not a new
  engine: ordered `stages[]`, each containing `groups[]` (parallel within a
  stage) with per-stage/group `concurrency`, `maxFailures` (fail-fast vs
  continue), `approval` gates, `maintenanceWindow`, and resume-from-failure
  (`resumeFrom {stageIndex, groupIndex}` on `RolloutState`). Percent-ramps become
  the degenerate single-group case, keeping today's records valid.
- Approval gates compose existing machinery: the policy `require-approval`
  effect (`packages/policy/data-models/policy_ir.cue:33`) evaluated through
  Gatekeeper (`packages/contracts/src/gatekeeper.ts`), with human handoff via
  A2H/`SafetyEnvelope` (`packages/cloud/src/cd/incident-a2h.ts`, ADR-0094).
  Never bypass Gatekeeper or SafetyEnvelope; never invent a second approval
  plane.
- Every stage/group transition is an `EventEnvelope` event extending
  `ROLLOUT_EVENTS` (`rollout.StageStarted`, `rollout.GroupCompleted`,
  `rollout.ApprovalRequested/Granted`, `rollout.Resumed`, …), catalogued in
  `event-families.md`; name transitions CDEvents-adjacent where natural (the
  finops standards baseline already targets CDEvents) so the CloudEvents
  projection is pipeline-consumable. Whole runs replay from the journal.
- Trails compose the same strategies through their existing seams
  (`rampSteps` option, `progressive-flags.ts`, `TRAIL_EVENTS`), and stage-gate
  (`packages/stage-gate`) consumes stage outcomes; dry-run evidence follows the
  `evaluateUpgradeDryRun` report pattern
  (`packages/trails/src/upgrade-preflight.ts`). One machinery serves ordinary
  progressive deploys and cross-Yard Trails.

## Deliverable 5 — Docs, ADRs, proofs, traceability

- Update `docs/design/platform-engineering.md` (Drivers section gains the
  realization contract; Matching gains the criteria vocabulary),
  `deployment-dashboard-topology-explorer.md` (projection now real), Harness/
  Trails surfaces, and `docs/design/event-families.md` (new `rollout.*` names,
  `match.Decided` convergence note).
- ADR deltas only for true decisions: amend ADR-0088 (new scoring groups),
  ADR-0083 (staged/grouped rollout schema), and add one focused ADR for
  `RealizationResult`; update the placement-language paragraph in
  `platform-engineering.md:88` and the corresponding `GAPS.md` entry by GAP id
  (append a remediation — never renumber).
- Proofs: follow the draft-proof cascade — extend/add proofs under `src/draft/`
  (matching criteria vectors, realization round-trip, progressive sequencing +
  resume, graph projection determinism); when a proof is promoted to a package,
  freeze it in `scripts/promotions.json` (verified by `promotions:check`).
- `docs/competitors/radius.md`: flip the Application Graph row from ◐ only when
  the projection + CLI land; note the output-contract borrow as implemented.
  Reclassify the relevant `GAPS.md` entries.

## Subagents

Lead defines shared contracts FIRST, in this order, before any subagent starts:
(1) `RealizationResult` + criteria records + rollout-record extensions
(proto+CUE+codegen), (2) new event names in `event-families.md`, (3) canonical
verb changes in `packages/cli/src/shell/verbs.ts`. **Contested files with a
single owner (lead arbitrates):** `packages/cloud/src/{events.ts,plan-types.ts}`,
`packages/identity/src/harness-delivery.ts` + `identity.proto`,
`packages/core/src/index.ts` + `ports/`, `packages/cli/src/shell/verbs.ts`,
`packages/mcp/src/tool-surface.ts`, `docs/design/event-families.md`.

1. **Explorer** — verify (not rediscover) the inventory above against HEAD;
   report drift only.
2. **Matching & Registration** — deliverable 2 (owns `packages/cloud` matching/
   registry/plan-types + goldens + `plan`/`add`/`registry` verb behavior).
3. **Realization Contract** — deliverable 1 (owns `packages/core/ports/driver.ts`,
   `packages/iac/*`, conformance suite, mapping helpers).
4. **App Graph** — deliverable 3 (owns the new projection + `inspect` extension).
5. **Progressive** — deliverable 4 (owns identity harness + trails composition +
   stage-gate integration).
6. **Docs/Proofs/Validation** — deliverable 5 + final gate passage.

Each subagent returns files touched, tests added, residual risks. Prefer
extending existing packages; no new top-level packages; no circular deps.

## Acceptance criteria (each objectively checkable)

- [ ] `hobo:iac/provider` methods are typed against `hobo.realization-result/v1`;
      `fromIacOutputs` and `fromRecipeOutputs` helpers exist with round-trip
      tests; the conformance suite rejects raw secret values in `secrets`; all
      three IaC adapters pass it.
- [ ] Both `match.Decided` emitters produce the canonical proto shape (ranking,
      rejectedCandidates with reasons, tie, catalogContentHash) + the new
      property/topology vector; existing golden vectors byte-identical; new
      vectors cover each added dimension.
- [ ] `hobo plan` prints full ranking + machine-readable rejection reasons;
      `hobo add`/`hobo registry` cover definition registration/listing;
      `assertToolSurfaceParity` passes (MCP parity automatic).
- [ ] The graph projection is a pure fold with a byte-stable golden; `hobo
      inspect graph --format json` returns `TopologyView`-shaped output.
- [ ] Rollout records support stages/groups/concurrency/maxFailures/approval/
      resume; a replay test reconstructs a full staged run (including a resumed
      failure) from the journal alone; approval path goes through
      Gatekeeper + A2H; percent-only policies still validate.
- [ ] Docs/ADR/proof/GAPS/competitor updates land; promotions ledger updated for
      any promoted proof.
- [ ] Gates green: `pnpm run agent:check -- --base=origin/main`,
      `architecture:guard`, `standards:check`, `codegen:check`,
      `generated:guard`, `promotions:check`, `konsistent`, package tests,
      `test:behavior`, docs freshness/design-lint, package boundaries.
- [ ] No new `.js/.mjs/.cjs`; no hand-edited generated files; no K8s types in
      `@hobo/core`; honest status comments preserved.

## Forbidden

- Replacing event-sourcing or the `EventEnvelope`; second event envelopes.
- Kubernetes/Bicep as primary paths; K8s/Gateway-API types in core; raw
  KubeFleet CRD shapes.
- Non-determinism on the Matching hot path; Camps selecting providers.
- Bypassing Gatekeeper, SafetyEnvelope, or Identity token brokerage; raw secret
  values in any result or event.
- CEL, GraphQL, OAM-as-model — unimplemented or excluded; do not add them.
- Parallel systems where `identity.proto` rollout records, Plan 25, Trails, or
  existing ports can be extended.
- Scope creep into live multi-cloud executor hardening or production WASM
  componentize.

## Execution style

Read the required context; run the Explorer verification; lead lands shared
contracts; subagents execute; integrate; run gates continuously; conventional
scoped commits. Final output: (1) design-decision summary mapped to
Radius/KubeFleet/Fleet lessons, (2) files/packages changed and why, (3) how to
exercise new surfaces (CLI + test commands), (4) residual hooks left open,
(5) explicit confirmation every acceptance criterion and gate passes.

**End of instruction.**
