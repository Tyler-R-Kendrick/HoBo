# Developer Experience: UI & CLI

This capability doc consolidates Plan 7, Plan 15 of the HoBo design suite.

## Plan 07

**Plan 7 — UI / dashboard**

> **Resource Definitions & Matching (Humanitec parity):** add a **Resource Graph** view, a **matching-decision** view (`match.Decided` — which Resource Definition won and why, [Plan 25](./platform-engineering.md#plan-25)), a **Delta diff / promote** view ([Plan 26](./platform-engineering.md#plan-26)), and a **Pipelines** view with approval gates ([Plan 28](./platform-engineering.md#plan-28)) — matching Humanitec's Portal while staying projection-only.

> **Runtime/authoring views.** Adopt Nitric's **local-dashboard** features for `hobo dev` (test APIs, browse kv/sql/buckets, trigger schedules, publish to topics, inspect websockets) and add HoBo-native views: the **collected-resource/manifest** view ([Plan 22](./authoring-resources-wiring.md#plan-22)), the **link map** (component imports → providers, [Plan 20](./wasm-runtime-wit.md#plan-20)), and **cross-WIT-call traces** + AI implement/evolve/live-fix proposals & approvals ([Plan 23](./forge-generated-stack.md#plan-23)).

### Principles
1. **Everything is a view over events.** No view has privileged state; each is a projection, so the dashboard is consistent with the audit log by construction.
2. **Replay/time-travel is a first-class UX**, not a hidden log. The deploy timeline and run inspector both scrub through history.
3. **Human + agent parity.** Every panel maps to an MCP tool ([Plan 6](./ai-native-agent-auth.md#plan-06)); the UI is "the agent's view, rendered for humans."
4. **Self-host = hosted UI.** Same app, ships with the Yard Bindle.

### Core views
| View | Source projection | What it shows |
|---|---|---|
| **Deployments timeline** | DeploymentView | event-sourced history with a replay/time-travel scrubber; per-resource provisioning states; rollback/compensation visualized on the DAG |
| **Topology graph** | TopologyView | resources → resolved providers + options; `bind` edges annotated with connectivity tier + estimated egress/cost ([Plan 13](./security-networking.md#plan-13), [Plan 16](./reliability-observability-cost.md#plan-16)) |
| **Run inspector** | RunView | workflow/step/actor/saga trace; per-step inputs/outputs/attempts/duration; **replay-diff** against current code ([Plan 14](./reliability-observability-cost.md#plan-14)) |
| **Registry browser** | Registry | providers, their Capability Manifest/signs, capabilities, cost signals, Forge-certification + provenance |
| **Agent activity & credential audit** | CredentialAudit | agent runs + every token grant/use/revoke, joined to the triggering run; approvals on policy gates |
| **Cost & FinOps** | cost projection | plan-time estimates vs actuals, budgets/caps, showback per tenant/Bindle/Camp |
| **Drift** | DriftView | resources diverged from desired; heal/propose actions |

### Key interactions
- **Plan preview before deploy** — render `hobo plan` output (provider resolution, cost, warnings, cross-cloud edges) as an approvable diff; deploy from the UI triggers the same command path as the CLI.
- **Approve a policy gate** — high-risk actions (destroy/prod/over-budget, incl. agent requests) surface as an inline approval that resolves a `createHook` ([Plan 6](./ai-native-agent-auth.md#plan-06)).
- **Promote / rollback** — move a Camp pointer with a confirmation; the timeline reflects it as events.
- **Live tail** — logs and run streams render in real time via the Camp's runtime `streams`.

### Tech & structure
- Next.js app, itself a HoBo `web` resource in the Yard Bindle; subscribes to projections via the Gateway's read API and to live data via streams.
- Component-driven; design-system and detailed flows are deferred (this plan is a scope/IA sketch — the visual design is an explicit iteration target, see [Plan 0](./vision.md#plan-00) "ui design" iteration note).

### Local-dashboard & link views (integrated)
Additional views the runtime/IfC model adds, each a projection/stream like the rest:
| View | Source | Shows |
|---|---|---|
| **Local emulation** (Nitric-style) | `runtime-local` | test APIs; browse kv/sql/buckets; trigger schedules; publish to topics; inspect websockets ([Plan 15](./developer-experience.md#plan-15)) |
| **Collected manifest** | `bindle.ManifestProduced` | the IfC resource-collection output (resources, links, annotations) before deploy ([Plan 22](./authoring-resources-wiring.md#plan-22)) |
| **Link map** | manifest links | each component's imports → resolved capability providers ([Plan 20](./wasm-runtime-wit.md#plan-20)) |
| **WIT-call traces** | `link.Called` / stub recordings | cross-port calls; the basis for AI implement/evolve/live-fix **proposals + gate approvals** ([Plan 23](./forge-generated-stack.md#plan-23)) |

### Iteration hooks
- Information architecture & navigation; the design system.
- Whether the dashboard is runtime-agnostic (read API only) or has a runtime-specific fast path.
- Depth of replay/diff tooling in UI vs CLI.
- Multi-tenant org/team/project navigation and RBAC surfacing.

## Plan 15

**Plan 15 — CLI & developer experience**

> **Platform/ops commands (Humanitec parity):** new platform/ops commands — `hobo def` (manage Resource Definitions, [Plan 25](./platform-engineering.md#plan-25)), `hobo pack` (Resource Packs, [Plan 27](./platform-engineering.md#plan-27)), `hobo env clone` + ephemeral/preview Camps ([Plan 26](./platform-engineering.md#plan-26)), `hobo delta` (promotion is `hobo up --camp prod` against the promoted revision), `hobo pipeline` + `hobo relay` ([Plan 28](./platform-engineering.md#plan-28)). Developer commands are unchanged — definitions are a platform-team surface.

> **Contracts & policy (gates):** add the verification surface — `hobo verify --target <env>` (the composite Gatekeeper: contracts + policy + evals + conformance + cost), `hobo can-deploy --target <env>` ([Plan 29](./contracts-policy-flags.md#plan-29)), `hobo explain-failure` (replay a blocked gate's events), `hobo fix --dry-run` (Forge-proposed remediation), and `hobo promote-contract` / `hobo promote-impl` ([Plan 23](./forge-generated-stack.md#plan-23)). All read-only by default; mutations go through the same gates.

> **Runtime/authoring commands.** `hobo build` compiles each service to a **wasm component** (jco/`@hobo/componentize`, OCI-container fallback) — [Plan 20](./wasm-runtime-wit.md#plan-20). `hobo up`/`plan` run a **resource-collection** phase (IfC) that emits the **manifest IR** — [Plan 21](./authoring-resources-wiring.md#plan-21)/[Plan 22](./authoring-resources-wiring.md#plan-22). New commands: `hobo collect` (print collected resources, à la `nitric spec`) and `hobo stub <resource|service>` to run with stubs ([Plan 23](./forge-generated-stack.md#plan-23)). The SDK Camp objects ([ADR-0011](./adr/01-architecture-core.md#adr-0011)) play the role of Nitric stack files — programmatic, not declared.

### DX principles
1. **`npx hobo new` to running in under a minute** — no cloud account required for `hobo dev`.
2. **The agnostic path is the default path** — you can build, run, test, and inspect locally before ever choosing a provider.
3. **Fast inner loop** — hot reload of handlers/workflows; local runtime with replay; no deploy needed to iterate.
4. **Type-safe end to end** — bindings, workflow signatures, and provider options are all typed; the editor guides you.
5. **Everything the CLI does, an agent can do** — every command has an MCP equivalent ([Plan 6](./ai-native-agent-auth.md#plan-06)).

### Command surface
The CLI collapses to two lifecycle verbs — **`hobo up`** (bring the topology up) and **`hobo down`** (tear it down) — plus a small essential set around them. Everything else is a flag or subcommand, not a new verb.
```
hobo up [--camp prod] [--strategy canary] [--to <rev>] [--rollback]
                                                         provision + deploy the object graph (ADR-0011); the only "ship it" verb
hobo down [--camp prod]                                  tear down / deprovision the topology
hobo dev                                                 run locally on runtime-local (no cloud)
hobo plan [--camp prod]                                  dry-run: DeploymentPlan + cost + warnings (what `up` would do)
hobo doctor                                              env/credential/connectivity diagnostics
hobo codegen [--check]                                   (re)generate typed clients into _generated/; --check fails on drift (CI) (ADR-0037)
hobo verify [--target <env>]                             composite Gatekeeper: contracts + policy + evals + conformance + cost
```
**`hobo up` subsumes the old lifecycle verbs.** No separate `deploy`/`destroy`/`rollback`/`promote`/`yard up`:
- **deploy** → `hobo up` (provision-then-deploy is one convergence).
- **destroy / teardown** → `hobo down`.
- **rollback** → `hobo up --to <rev>` (re-realize a prior revision) or `hobo up --rollback` (last-good).
- **promote** → `hobo up --camp prod` against the promoted revision (moving a Camp pointer is just bringing prod up to it).
- **self-hosted Yard bootstrap** → `hobo up` on the program that constructs the Yard ([Plan 4](./control-plane.md#plan-04)); `--restore <log>` restores from an event log.

Auxiliary subcommands (not lifecycle verbs):
```
hobo new <name> [--template todo|api|agent|fullstack]   scaffold an SDK program
hobo build                                               compile services to wasm components -> OCI (container fallback)
hobo collect [--camp prod]                               run resource-collection (IfC) -> print manifest IR
hobo stub <resource|service>                             run with a stub behind a WIT port (Plan 23)
hobo inspect run <id> | deploy <id> | topology           projections / time-travel
hobo logs [--follow] [<resource>]                        live stream via the Camp runtime streams
hobo drift [--heal|--propose]                            drift status + reconcile
hobo login | claim                                       obtain a dev SVID (OIDC); claim an anonymous deploy into an account
hobo registry search <capability> | add <provider>       browse/install providers (Capability Manifest)
hobo forge <provider-url>                                request an AI-generated provider
hobo import terraform|pulumi|opentofu|lakebed|faas <src> adopt an existing estate in place (ADR-0041)
```
Both `up` and `down` drive the thin-SDK + **wRPC** runtime — typed clients over generated WIT bindings, no cloud logic in the SDK ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).

### Lifecycle verbs (`up` / `down`)
`hobo up` realizes whatever object graph the program builds — provision then deploy, in one convergence — and `hobo down` reverses it. There is no separate deploy/destroy/rollback/promote vocabulary: those are revisions and targets of the same two verbs. `up` reads the topology from the SDK objects the program constructs ([ADR-0011](./adr/01-architecture-core.md#adr-0011)), not from config files, so the same verb brings up a single Camp, a multi-Camp Yard, or a cross-cloud Junction — whatever the graph contains. Provision is idempotent: running `up` again converges to the desired graph; `up --to <rev>`/`--rollback` re-realizes a prior revision. Both verbs drive the thin-SDK + **wRPC** runtime — typed clients over generated WIT bindings, no cloud logic in the SDK ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).

### Scopes are SDK objects, not config files
The topology is **constructed programmatically** — Bindle, Camp, Yard, Junction are first-class SDK objects you build and compose in code, not declarations in `*.config.ts` files ([ADR-0011](./adr/01-architecture-core.md#adr-0011)). `hobo up` realizes whatever object graph the program builds.
```ts
import { bindle, camp, yard, junction } from "hobo";
const app = bindle("my app"); app.addContainer(/* ... */);
const c1 = camp("c1"); c1.import(app);
const azureYard = yard("y-azure", azure); azureYard.setup(c1);
const awsYard = yard("y-aws", aws); awsYard.setup(camp("c2").import(app));
const j = junction("j1"); j.add(azureYard, awsYard);
```
- **Bindle** — provider-agnostic app: resources + bindings + runtime primitives. Names no provider; reviewing it is reviewing the app.
- **Camp** — maps a Bindle to **one** provider's resources (≈ a Pulumi stack); `camp.import(app)`.
- **Yard** — provider-specific, **cross-Camp**: groups Camps under one provider and holds cross-Camp policy/gateways; `yard.setup(...)`.
- **Junction** — connects **Yards across clouds**; `junction.add(...)`.

The objects *are* the topology; provider choice and cross-cloud wiring live on Camp/Yard/Junction, so swapping clouds touches those objects, not the Bindle.

### The inner loop (`hobo dev`)
1. Resources resolve to **local equivalents** (containerized Postgres, in-memory queue, local object store) via the dev provider layer.
2. Handlers/workflows hot-reload; the local runtime persists events to `.hobo/` so runs survive restarts and are replayable/inspectable offline. **Codegen runs in the watch loop** — editing a WIT interface, a Zod schema, an `.allow()`, or a `bind` regenerates the checked-in `_generated/` typed clients, so editor types stay live with no build step ([ADR-0037](./adr/05-config-matching-environments.md#adr-0037)).
3. `hobo inspect`/`logs` work against localhost with no auth (matching Lakebed's local ergonomics).
4. Determinism tests (`replay == state`) run in CI from the same local runtime ([Plan 2](./sdk-api.md#plan-02), [Plan 9](./verification.md#plan-09)).

#### Local-dev fidelity — what's real vs simulated vs Camp-only ([ADR-0042](./adr/07-portability-extensibility.md#adr-0042))
"Works locally" is a *bounded, honest* promise. Behaviors are classified by **"does a wrong local answer hide a real bug?"**: **simulate** the correctness-determining ones at high fidelity, **mock** the environmental ones behind honest seams, **defer to a Camp** the irreducibly-real ones. Each capability reports a fidelity label (`real|simulated|mocked|camp-only`) that `hobo dev` surfaces, and the conformance suite tags every check `local` or `camp` so **`hobo verify` reports coverage = local ∪ camp and refuses a prod-ready claim for mocked-only behaviors** ([Plan 9](./verification.md#plan-09)).
- **Simulate (real locally):** determinism/replay, `.allow()` capability denials (wasm deny-by-default), auth/ABAC + policy decisions, `can-deploy`/contracts, resource interfaces (local PG/queue/object-store), embed/search (local model + pgvector).
- **Mock (honest seam):** real cloud IAM, provider latency/egress/cost, secrets backends (KMS).
- **Camp-only:** cross-cloud mTLS, real quotas/spend limits, provider drift.

### Onboarding paths
- **Anonymous `npx` deploy (zero setup):** `npx hobo up` deploys from any directory with **no account and no setup** — an instant, unclaimed deployment that returns a live URL (the Lakebed-style instant feel, now for *deploys*). The deployment is owned by nobody yet; `hobo claim` later binds it to an account, preserving its state and URL. This is the first-class try-it-now path: see a real URL before you ever sign up.
- **Human:** `npx hobo new my-app -t fullstack && cd my-app && hobo dev` → edit → `hobo login` → `hobo up`.
- **Agent:** an MCP client calls `list templates → new → plan → up`, obtaining tokens via the broker; never touches a key. The agent can `inspect_run`/`tail_logs` to verify and self-correct.
- **Brownfield (existing estate):** `hobo import terraform ./infra` adopts the current resources in place (no re-provision) → `hobo plan` shows a no-op diff → bring services under IfC one at a time, binding to still-`external` resources until they're adopted too — the strangler-fig path ([ADR-0041](./adr/07-portability-extensibility.md#adr-0041)).

### Editor & ecosystem integration
- TS types ship in every `@hobo/*` package; provider options autocomplete on `.with(...)`.
- Optional VS Code extension: topology preview, run inspector, and "explain this plan."
- Framework adapters (Next/Astro/Hono/etc.) wire HoBo's build transform like Vercel's `withWorkflow`.

### Iteration hooks
- Template set + whether scaffolds wire a provider-pinned Camp object or stay fully agnostic ([ADR-0011](./adr/01-architecture-core.md#adr-0011)).
- How `hobo dev` emulates provider-specific behaviors (fidelity vs simplicity).
- Single binary vs `npx`-only distribution; self-update story.
- Depth of the VS Code extension vs CLI-first.
