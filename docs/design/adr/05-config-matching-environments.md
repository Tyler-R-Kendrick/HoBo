# Config, matching, environments, codegen & DSL — consolidated decisions

> Consolidated ADR decisions for **config, matching, environments, codegen & dsl**. Each section is one architecture decision; see [`README.md`](./README.md) for the full ADR index.

## ADR-0033
**Deterministic Matching & Planner selection (+ default objective).**

- **Origin:** the gap analysis asked, of HoBo's Humanitec-parity Matching, *"which algorithm — rules, constraint solver, or LLM — and is it deterministic enough to trust in prod?"* ([Q3](../verification.md#plan-09)). Designed via brainstorming + grill-with-docs.

### Context
[Plan 25](../platform-engineering.md#plan-25) introduced **Resource Definitions** + **specificity-scored Matching** and the auditable **`match.Decided`** event; [Plan 3](../control-plane.md#plan-03) made the **Planner a pure function** with capability negotiation (`require` hard / `prefer` soft), region/colocation, and an *optional* cost-shaping step. But three things were left open and they are what make Matching trustworthy in prod: (1) the **algorithm class** — pure rules vs a constraint solver vs LLM-assisted, and whether selection is **deterministic/replayable**; (2) the **default objective** when several candidates fully satisfy (Plan 3 §122 iteration hook; the open **ADR-P4**); (3) **tie behaviour** when definitions are equally specific. Humanitec's selection is specificity-based but **opaque**; HoBo's differentiator is an auditable, replayable decision — which only holds if selection is deterministic.

### Decision
1. **Selection on the deploy path is deterministic rules — a pure function.** Selection is a pure function of `(catalog snapshot, deploy context, objective setting)` — **no clock, RNG, network, or model** — so it is unit-testable without a cloud and **identical on replay** (the property [Plan 9](../verification.md#plan-09) already asserts of the Planner). **AI and cost/constraint *solvers* are advisory only, off the deploy path:** `hobo plan` may *surface* a cheaper alternative; the **Forge** may *generate* candidate definitions ([Plan 33](../forge-generated-stack.md#plan-33)); an LLM may *suggest* definitions at authoring time. None select at deploy time, so replay + `match.Decided` stay honest.
2. **The pipeline is gather → filter → rank → record:**
   - **Filter** to candidates whose criteria match the context **and** whose provider satisfies the resource's hard **`require`** capabilities (`Capability.satisfies` = `full` → accept; `prefer` may degrade with a `PlanWarning`; `require` miss → reject). If none satisfy `require` → **`deployment.PlanRejected`** with a precise, agent-correctable reason.
   - **Rank lexicographically:** (a) **specificity score** ([Plan 25](../platform-engineering.md#plan-25)) → (b) **explicit platform priority** (a new optional `priority` field on a definition, for deliberate override) → (c) the **default objective** (soft) → (d) a **stable deterministic tiebreak** (definition id, lexicographic).
3. **The default objective is configurable, defaulting to min-cost within constraints** (resolves **ADR-P4**). The objective is a Yard/Camp setting — `cost` | `latency` | `single-provider` | `carbon` — defaulting to **lowest cost subject to satisfying `require`/`prefer`/region/colocation**. The region/colocation step ([Plan 3](../control-plane.md#plan-03) §4) already minimizes cross-provider egress, so cost is the natural remaining optimizer; the chosen objective is recorded in `match.Decided`/`deployment.Planned`.
4. **A true tie gets a stable tiebreak + a warning, never a block.** When candidates are equal on specificity, priority, and objective, break by the stable key (definition id) so the result is always deterministic + replay-stable, **and** emit a `PlanWarning` + flag the tie in `match.Decided` so a platform engineer can add an explicit `priority` to disambiguate.
5. **Enrich `match.Decided`; add no new event types.** Its payload carries the winner, the full ranking, the rejected candidates (with reasons), the objective used, and the tie flag.

### Alternatives considered
- **Constraint solver (e.g. ILP) on the deploy path.** Rejected: solver outputs can be unstable across versions, are harder to explain in `match.Decided`, and risk non-determinism on replay unless heavily pinned — overkill for the indie/agent ICP. (Cost optimization survives as the *soft objective* and as an *advisory* `hobo plan` suggestion.)
- **LLM-assisted selection on the deploy path.** Rejected: non-deterministic → breaks replay and makes `match.Decided` unauditable; unacceptable for prod infra selection. Retained only as an authoring-time *suggester*.
- **Error out on a true tie (require disambiguation).** Rejected as the default: blocks deploys/iteration on an ambiguous catalog (bad for agents + ephemeral previews); the stable-tiebreak-plus-warning keeps deploys moving while surfacing the ambiguity. (A Yard may still opt into strict mode via policy, [Plan 30](../contracts-policy-flags.md#plan-30).)
- **Most-recently-updated wins.** Rejected: not replay-stable (timestamp isn't a clean deploy input) and changes silently as the catalog is edited.
- **A fixed, non-configurable objective.** Rejected: teams legitimately want latency- or single-cloud-first; configurability with a sane default serves both.

### Consequences
- **(+)** Matching becomes **demonstrably deterministic + auditable** — "why did this resource land on this infra?" is answerable and reproducible, closing the credibility gap vs Humanitec's opaque selection.
- **(+)** Reuses the **pure Planner** ([Plan 3](../control-plane.md#plan-03)), specificity scoring + `match.Decided` ([Plan 25](../platform-engineering.md#plan-25)/[Plan 11](../event-model.md#plan-11)), and cost signals ([Plan 16](../reliability-observability-cost.md#plan-16)); little new machinery (an optional `priority` field + an enriched event payload).
- **(+)** AI keeps adding value (Forge-generated + LLM-suggested definitions) **without** compromising determinism, because it sits off the deploy path.
- **(−)** Pure rules can pick a sub-optimal option a full solver might improve on; mitigated by the soft cost objective + the advisory `hobo plan` suggestion + explicit `priority`.
- **(−)** Platform engineers must occasionally add a `priority` to silence a tie warning — a small, explicit authoring cost in exchange for predictability.

## ADR-0028
**Multi-Camp deployment model (cardinality, naming, atomicity).**

- **Origin:** design review of ADR-0026 surfaced unresolved cardinality/atomicity/naming questions ([`plans/0001-scope-refactor-review.md`](../../../plans/0001-scope-refactor-review.md)).

### Context
ADR-0026 made a **Camp** provider-specific and nested `Yard ⊃ Camp ⊃ Bindle`, but left three things ambiguous that a review flagged HIGH:
1. **Cardinality:** does one Bindle deploy to one Camp or many? The worked example ([19](../worked-example.md#plan-19)) splits one app's resources across clouds.
2. **Naming:** `hobo.config.ts` keys Camps by environment (`prod`, `staging`), yet a Camp is "provider-specific" — so is `prod` or `prod-aws` the Camp?
3. **Atomicity:** Deployment Sets/Deltas/promote ([26](../platform-engineering.md#plan-26)) are per-Camp; a multi-cloud `production` has no atomic promote/rollback unit.

### Decision
1. **A Camp is provider-specific; its canonical id is `<env>-<provider>`** (e.g. `prod-aws`, `prod-azure`, `staging-gcp`). A Camp carries an `environment type` ([25](../platform-engineering.md#plan-25)) and provides one provider's infra + one runtime backend.
2. **A Bindle deploys to one *or more* Camps.** Single-cloud = one Camp. Multi-cloud / hybrid = the **same Bindle deployed across several Camps** under one Yard. Resource→Camp placement is expressed in `hobo.config.ts` mapping (per-resource/per-tier), not in app code — preserving "no app edits to change where things run".
3. **Cross-Camp `bind` edges are Yard-wired.** When a `bind` connects resources that resolve to different Camps (e.g. `api`@`prod-aws` → `db`@`prod-azure`), the Yard provisions the cross-provider connectivity tier ([13](../security-networking.md#plan-13), mTLS by SVID) and governs it as cross-provider topology. The data plane still talks directly (the Yard is not on the request path).
4. **An "environment group" is the multi-cloud atomic unit (a Yard-level saga, not a new config layer).** A logical environment (e.g. `production` = {`prod-aws`, `prod-azure`}) groups its member Camps by `environment type`. `hobo deploy/promote/rollback --env production` runs a **choreographed saga** ([05](../reliability-observability-cost.md#plan-05)) over the member Camps' per-Camp Sets/Deltas, emitting `env.PromoteRequested → (per-Camp promote) → env.Promoted | env.PromoteRolledBack`; a member failure compensates the group (or proceeds if the member is marked `optional`). `--camp prod-aws` still targets a single Camp. The group is **orchestration over Camps, not a 4th scope noun**.

### Alternatives considered
- **One Bindle → exactly one Camp; multi-cloud handled entirely by the Planner inside a single "multi-provider Camp."** Rejected: makes a Camp not-actually-provider-specific (contradicts ADR-0026) and hides cross-provider cost/topology from the model.
- **Add a 4th config layer "Environment" (`Yard ⊃ Env ⊃ Camp ⊃ Bindle`).** Rejected: ADR-0026 deliberately kept environment a matching dimension; the group is a thin saga, not a persistent scope.
- **Name Camps by environment only (`prod`) and infer providers.** Rejected: hides the provider, breaks "provider-specific", and makes two `prod` Camps on different clouds indistinguishable.

### Consequences
- **(+)** Resolves cardinality (Bindle→1..N Camps), naming (`<env>-<provider>`), and atomicity (env-group saga reusing existing compensation). The worked example is now precise: splitting providers = deploying the Bindle to multiple Camps the Yard wires together.
- **(+)** Per-Camp Sets/Deltas/`can-deploy` are unchanged; the group composes them.
- **(−)** Requires `env.*` group-saga events + a group view in the dashboard, and a clear story for partial-success across clouds (covered by saga compensation + `optional` Camps).
- **(−)** Cross-Camp app boundaries inherit cross-provider latency/egress; the Planner still prefers colocation ([13](../security-networking.md#plan-13)/[16](../reliability-observability-cost.md#plan-16)) and `hobo doctor` warns on accidental cross-cloud edges.
- **Follow-ups:** ~~stateful-data consistency across Camps~~ — **resolved by [ADR-0040](#adr-0040)** (declared replication topology, single-writer-Camp default, event-log backbone, labeled bounded-staleness + write-goes-home); ~~app-data migration~~ — **resolved by [ADR-0032](03-data-plane.md#adr-0032)** ([Plan 34](../data-plane.md#plan-34)).

## ADR-0040
**Cross-Camp stateful consistency.**

- **Origin:** open question #16, explicitly left as a follow-up by [ADR-0028](#adr-0028), and the dependency Plan 32 / Plan 34 / [ADR-0035](07-portability-extensibility.md#adr-0035) deferred their cross-Camp cases to. Designed via brainstorming + grill-with-docs.

### Context
[ADR-0028](#adr-0028) made a Bindle deployable to **1..N Camps** (multi-cloud), with cross-Camp `bind` edges Yard-wired and the data plane talking directly — but explicitly deferred **stateful-data consistency across Camps**. The question: when a Bindle spans clouds, is cross-Camp state a HoBo *guarantee* (cross-cloud event replication) or an *app responsibility* (eventual)? It can't be silently strong — cross-provider quorum writes are high-latency and partition-prone (CAP). And it's load-bearing: Plan 32 deferred cross-Camp reactive queries, Plan 34 deferred cross-engine/CDC moves, and [ADR-0035](07-portability-extensibility.md#adr-0035) routes traffic across Camps — all waiting on this.

### Decision
1. **Cross-Camp state declares a replication topology; HoBo wires it and surfaces the guarantee — no silent strong consistency.** Per piece of cross-Camp state, the topology is one of: **single-writer-Camp** (one Camp owns the data; other Camps read — the **default**), **active-active-eventual** (CRDT / event-merge, opt-in), or **pinned-single-Camp** (data lives in one Camp; compute may still span). The topology is part of the resource's resolved config / Resource Definition ([Plan 26](../platform-engineering.md#plan-26)/[Plan 25](../platform-engineering.md#plan-25)), not app code.
2. **The event log is the cross-Camp replication backbone.** HoBo-native event-sourced state (actors, runs, projections) replicates **via the log**: the owning Camp is the single writer; other Camps consume a **replicated read-stream** into **bounded-staleness projections** (reusing event-store replication, [Plan 11](../event-model.md#plan-11), and the quorum/HA machinery, [Plan 5](../reliability-observability-cost.md#plan-05)). **Provider-backed stores** (`sql`/`kv`/`bucket`) default to **single-writer-Camp + cross-Camp read** over the connectivity tiers ([Plan 13](../security-networking.md#plan-13)); **active-active CDC / multi-primary for provider stores is deferred** — the same boundary [Plan 34](../data-plane.md#plan-34) drew for cross-engine/CDC moves.
3. **Consistency is surfaced honestly.** Reads from a non-owner Camp are **labeled bounded-staleness** (stale-by ≤ replication lag, reusing [Plan 5](../reliability-observability-cost.md#plan-05) §Control-plane-HA's labeled reads) — never silently stale. **Reads-your-writes** holds within the writer Camp (and cross-Camp after replication, observable via the stream `seq`/version). **Consistency-requiring writes "go home"** — they route to the owning Camp. **Cross-Camp reactive queries** ([Plan 32](../data-plane.md#plan-32)'s deferred case) subscribe to the owner Camp's reactor or a replicated-stream reactor that carries the staleness label.
4. **No new event types** — replication rides the existing event-store replication ([Plan 11](../event-model.md#plan-11)/[Plan 5](../reliability-observability-cost.md#plan-05)); a topology is resource config; staleness is a read-label + an observability signal ([Plan 14](../reliability-observability-cost.md#plan-14)) that can trip a policy obligation ([Plan 30](../contracts-policy-flags.md#plan-30)) when lag exceeds a bound.

### Alternatives considered
- **HoBo guarantees strong cross-cloud consistency (quorum event replication across clouds).** Rejected: high-latency + partition-prone across providers; makes a multi-cloud Bindle slow by default and over-promises against CAP. (Strong consistency *within* a Camp is unchanged — that's the runtime backend's quorum.)
- **Purely app-owned (HoBo only wires connectivity).** Rejected: abandons the multi-cloud-data promise and gives developers no patterns — the gap #16 exists to close.
- **Provider-native multi-region storage replication.** Rejected as the mechanism: provider-specific (breaks agnostic) and doesn't span *different* providers (the actual cross-Camp case). It can still realize a single-Camp's HA underneath.
- **A HoBo-managed global state store.** Rejected: puts HoBo on the data-plane request path (latency/cost/SPOF), contradicting [ADR-0028](#adr-0028) ("the Yard is never on the request path").
- **Active-active CDC for provider stores in v1.** Rejected for v1 (kept as the opt-in `active-active-eventual` direction): heavy per-engine CDC + conflict handling, mirroring [Plan 34](../data-plane.md#plan-34)'s deferral.

### Consequences
- **(+)** Resolves the keystone #16 and unblocks the deferred cross-Camp cases in [Plan 32](../data-plane.md#plan-32) (reactive), [Plan 34](../data-plane.md#plan-34) (data move), and [ADR-0035](07-portability-extensibility.md#adr-0035) (ingress) — multi-cloud now has an honest *data* story.
- **(+)** Reuses event-sourcing as the replication backbone, the Plan 5 quorum + labeled-staleness machinery, and the connectivity tiers — minimal new mechanism (a declared topology + a read label + a write-goes-home rule).
- **(+)** CAP-honest: developers see the real guarantee (bounded staleness, single-writer) and choose active-active-eventual deliberately where they can tolerate merge semantics.
- **(−)** Single-writer-Camp means the owning Camp is a write bottleneck/availability dependency for that state (mitigated by the owner Camp's own intra-Camp HA, [Plan 5](../reliability-observability-cost.md#plan-05)).
- **(−)** Active-active-eventual requires CRDT/merge modeling by the developer; HoBo provides the plumbing + event-merge, not automatic conflict resolution for arbitrary data.
- **(−)** Provider-store active-active/CDC remains deferred, so some cross-cloud data patterns stay single-writer or app-handled for now.

## ADR-0037
**SDK codegen surface & policy.**

- **Origin:** the gap analysis (G7) found HoBo *promises* "type-safe end-to-end" + WIT-generated clients but never *shows* the codegen DX, while Aspire/Convex make typed codegen a headline. Designed via brainstorming + grill-with-docs.

### Context
HoBo's typed surface is referenced throughout — `ctx.bindings.db` is "a provider-agnostic typed client" ([Plan 2](../sdk-api.md#plan-02)), "typed clients are generated from those interfaces (jco guest-types)" ([Plan 24](../wasm-runtime-wit.md#plan-24)), "type-safe end to end" ([Plan 15](../developer-experience.md#plan-15)) — but *what* is generated, *where* it lives, *when* it runs, and the developer-facing artifact were never specified. A Convex/Aspire audience expects a concrete codegen story (Convex commits `convex/_generated/`).

### Decision
1. **Sources → generated artifacts.** Codegen is a **deterministic pure function** of: the **WIT interfaces** (jco guest-types, [Plan 24](../wasm-runtime-wit.md#plan-24)) + **Zod schemas** (step/workflow/`query`/search I/O) + **`.allow()`** scopes ([Plan 21](../authoring-resources-wiring.md#plan-21)) + the **bindle graph** (`bind` edges, [Plan 22](../authoring-resources-wiring.md#plan-22)). It emits: typed `ctx.bindings.<name>` clients, typed `useQuery()`/search results ([Plan 32](../data-plane.md#plan-32)/[Plan 35](../data-plane.md#plan-35)), typed workflow/step signatures, typed provider `.with()` options, and a typed **`api` function-tree** reference.
2. **Location & commit policy: a checked-in `_generated/` directory** (`.hobo/generated/` or `src/_generated/`). Rationale: reviewable in diffs, gives editors types with **no build step**, and is **offline/air-gap-friendly** ([ADR-0036](07-portability-extensibility.md#adr-0036)). **`hobo codegen --check`** is a CI gate that regenerates and fails on drift.
3. **When it runs:** `hobo dev` regenerates on change (watch); `hobo build` regenerates + fails on drift; `hobo new` scaffolds an initial `_generated/`. Because generation is deterministic, the same sources always produce the same output (reproducible; replay/air-gap friendly).
4. **Agent parity:** an MCP `codegen` tool so agents regenerate + typecheck like the CLI ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 15](../developer-experience.md#plan-15)).
5. **Domain-schema emitters (WIT-record canonical, [ADR-0051](03-data-plane.md#adr-0051)).** When domain types are authored as WIT records ([Plan 39](../data-plane.md#plan-39)), codegen adds two deterministic outputs alongside the TS types: **protobuf** message descriptors (the event-body wire encoding, [Plan 11](../event-model.md#plan-11)) and **Zod** validators (a runtime-validation view of the record). Same `_generated/` location + `--check` drift gate; protobuf is an encoding, not an authoring source.

### Alternatives considered
- **Virtual / build-resolved types (nothing committed).** Rejected as the default: needs the toolchain running to get types, diffs don't show the generated surface, and the offline/air-gap + editor-without-build story is weaker.
- **Both (committed default + virtual mode).** Rejected for v1 to avoid two codegen modes to document/test/keep consistent; the checked-in dir covers the cases that matter. (Virtual can be revisited as a monorepo nicety.)
- **No dedicated codegen story (leave it implied).** Rejected: the gap analysis (G7) is exactly that this was unstated; a Convex/Aspire audience expects it shown.

### Consequences
- **(+)** Closes G7 with a concrete, reviewable, offline-friendly codegen DX that matches the Convex/Aspire expectation; editors get full types with no build step.
- **(+)** Reuses existing sources (WIT/jco, Zod, `.allow()`, the graph) — codegen adds an emitter + a CLI/MCP command + a CI check, not a new model; determinism fits the replay/air-gap ethos ([ADR-0036](07-portability-extensibility.md#adr-0036)).
- **(−)** A checked-in `_generated/` dir adds diff noise on schema/binding changes and a `codegen --check` CI step (the standard tradeoff for committed generated code).
- **(−)** Generated TS quality depends on the WIT→TS (jco) mapping fidelity; advanced WIT types may need hand-tuned emit — an iteration hook.

## ADR-0049
**Reserve "Hobo Code" for the configuration + code DSL.** Accepted (naming + charter); **the DSL itself is forward-looking — design TBD, not in v1 scope**

- **Origin:** terminology refactor — the phrase "Hobo Code" was being used for the auth+capability standard, but is wanted for a future AI-native authoring DSL.

### Context
"Hobo Code" had been the name of HoBo's machine-readable **auth + capability standard** (the `auth.md` analog: `signs.md`/`capabilities.json`/`auth.json`). Separately, HoBo is **AI-native** — agents and the Forge generate, repair, and optimize HoBo artifacts ([Plan 6](../ai-native-agent-auth.md#plan-06)/[Plan 33](../forge-generated-stack.md#plan-33)/[Plan 23](../forge-generated-stack.md#plan-23)) — and the TypeScript+IfC surface ([Plan 2](../sdk-api.md#plan-02)/[Plan 21](../authoring-resources-wiring.md#plan-21)), while ideal for humans, is a noisy generation/training target (large grammar, host imports, collection-time side-effects, hard-to-score ASTs). We want a purpose-built DSL that is **optimal for AI generation, training, and optimization** and that configures **Yards/Camps/Bindles** *and* code in one human-readable surface. The name "Hobo Code" fits that DSL far better than it fit a manifest format.

### Decision
1. **Rename the auth+capability standard** from "Hobo Code" to **Capability Manifest** ([Plan 6](../ai-native-agent-auth.md#plan-06)) — published files unchanged in spirit (`index/signs/capabilities/auth/cost.json`), now served at `/.well-known/capability-manifest/`, WIT `hobo:capability-manifest`. (Done as part of this refactor.)
2. **Reserve "Hobo Code"** to mean the planned **configuration + code DSL** ([Plan 38](../authoring-resources-wiring.md#plan-38)): a human-readable surface to declare scope/topology (`Yard`/`Camp`/`Bindle` + resources + `.allow()` + wiring) and behavior (`workflow`/`step`/`actor`/`saga`/`agent`, trainable methods), designed to be **small, regular, declarative-first, deterministic, and AI-optimal** (stable canonical AST, low ambiguity, token-efficient).
3. **Charter, not spec.** Hobo Code is a **sibling authoring front-end** to the TypeScript SDK — both lower to the same **Manifest IR** ([Plan 22](../authoring-resources-wiring.md#plan-22)) and runtime constructs, adding nothing semantically new; the scope model is unchanged ([ADR-0026](01-architecture-core.md#adr-0026)). The grammar/toolchain (parser, canonical formatter, LSP, TS↔Hobo Code transpiler) is **deferred**; v1 does not depend on it.

### Alternatives considered
- **Keep "Hobo Code" for the manifest; pick another DSL name.** Rejected: the manifest is a *capability/auth advertisement*, not "code"; "Capability Manifest" describes it accurately, and "Hobo Code" is the natural name for an authoring language.
- **No DSL — TypeScript+IfC is the only surface.** Rejected as the *long-term* stance: a general-purpose language is a poor AI generation/training/optimization target. (TS remains the v1 surface; the DSL is additive and future.)
- **Build the DSL now (v1).** Rejected: premature — the Manifest IR + codegen + Forge loop must stabilize first; this ADR reserves the name and intent without committing v1 effort.
- **A new runtime/semantics for the DSL.** Rejected: it must be a pure front-end over the existing IR to avoid forking the model and to stay round-trippable with TypeScript.

### Consequences
- **(+)** Frees an apt name for the AI-native authoring DSL while giving the auth+capability standard an accurate one; removes the naming overload.
- **(+)** Keeps the suite coherent: one IR, two front-ends; the Forge/training-engine get a compact, scoreable target without new runtime semantics.
- **(+)** Forward-compatible: nothing in v1 depends on Hobo Code; it can be prototyped (config half first) over the stable IR.
- **(−)** Introduces a forward-looking term into the glossary that does not yet have an implementation — must stay clearly marked *reserved/future* to avoid implying it ships in v1.
- **(−)** Eventually two authoring surfaces to keep semantically aligned (TS ↔ Hobo Code), which the shared IR + a transpiler must enforce.
