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

> **Platform/ops commands (Humanitec parity):** new platform/ops commands — `hobo def` (manage Resource Definitions, [Plan 25](./platform-engineering.md#plan-25)), `hobo pack` (Resource Packs, [Plan 27](./platform-engineering.md#plan-27)), `hobo env clone` + ephemeral/preview Camps ([Plan 26](./platform-engineering.md#plan-26)), `hobo delta`/`hobo promote`, `hobo pipeline` + `hobo relay` ([Plan 28](./platform-engineering.md#plan-28)). Developer commands are unchanged — definitions are a platform-team surface.

> **Contracts & policy (gates):** add the verification surface — `hobo verify --target <env>` (the composite Gatekeeper: contracts + policy + evals + conformance + cost), `hobo can-deploy --target <env>` ([Plan 29](./contracts-policy-flags.md#plan-29)), `hobo explain-failure` (replay a blocked gate's events), `hobo fix --dry-run` (Forge-proposed remediation), and `hobo promote-contract` / `hobo promote-impl` ([Plan 23](./forge-generated-stack.md#plan-23)). All read-only by default; mutations go through the same gates.

> **Runtime/authoring commands.** `hobo build` compiles each service to a **wasm component** (jco/`@hobo/componentize`, OCI-container fallback) — [Plan 20](./wasm-runtime-wit.md#plan-20). `hobo deploy`/`plan` run a **resource-collection** phase (IfC) that emits the **manifest IR** — [Plan 21](./authoring-resources-wiring.md#plan-21)/[Plan 22](./authoring-resources-wiring.md#plan-22). New commands: `hobo collect` (print collected resources, à la `nitric spec`) and `hobo stub <resource|service>` to run with stubs ([Plan 23](./forge-generated-stack.md#plan-23)). `hobo.config.ts` + Camps play the role of Nitric stack files.

### DX principles
1. **`npx hobo new` to running in under a minute** — no cloud account required for `hobo dev`.
2. **The agnostic path is the default path** — you can build, run, test, and inspect locally before ever choosing a provider.
3. **Fast inner loop** — hot reload of handlers/workflows; local runtime with replay; no deploy needed to iterate.
4. **Type-safe end to end** — bindings, workflow signatures, and provider options are all typed; the editor guides you.
5. **Everything the CLI does, an agent can do** — every command has an MCP equivalent ([Plan 6](./ai-native-agent-auth.md#plan-06)).

### Command surface
```
hobo new <name> [--template todo|api|agent|fullstack]   scaffold a Bindle
hobo dev                                                 run locally on runtime-local (no cloud)
hobo build                                               compile services to wasm components -> OCI (container fallback)
hobo codegen [--check]                                   (re)generate typed clients into _generated/; --check fails on drift (CI) (ADR-0037)
hobo collect [--camp prod]                               run resource-collection (IfC) -> print manifest IR
hobo stub <resource|service>                             run with a stub behind a WIT port (Plan 23)
hobo plan [--camp prod]                                  dry-run: DeploymentPlan + cost + warnings
hobo up [--camp prod] [--strategy canary]                bring up the runtime/Camp + deploy the Bindle (everyday "make it run")
hobo down [--camp prod]                                  tear it down (deprovision/stop)
hobo deploy [--camp prod] [--strategy canary]            provision/converge to real infra
hobo promote <version> --camp prod                       move a Camp pointer
hobo rollback --camp prod                                revert to previous good version
hobo destroy --camp <camp>                               tear down (guardrail-gated)
hobo inspect run <id> | deploy <id> | topology           projections / time-travel
hobo logs [--follow] [<resource>]                        live stream via the Camp runtime streams
hobo drift [--heal|--propose]                            drift status + reconcile
hobo login                                               obtain a dev SVID (OIDC)
hobo registry search <capability> | add <provider>       browse/install providers (Capability Manifest)
hobo forge <provider-url>                                request an AI-generated provider
hobo import terraform|pulumi|opentofu|lakebed|faas <src> adopt an existing estate in place (ADR-0041)
hobo yard up [--restore <log>] | status                  run/restore a self-hosted Yard
hobo doctor                                              env/credential/connectivity diagnostics
```

### Lifecycle verbs (`up` / `down`)
`hobo up` is the everyday "make it run" verb: it brings up the runtime/Camp and deploys the Bindle in one step (a `plan`→`deploy` convergence to the resolved Camp). `hobo down` is its inverse — deprovision/stop the Bindle and tear the Camp back down. They wrap the existing deploy/destroy story (`hobo deploy`/`hobo destroy` remain the explicit, finer-grained verbs); `hobo yard up` stays the control-plane bootstrap variant that runs/restores a self-hosted **Yard** ([Plan 4](./control-plane.md#plan-04)), whereas `hobo up` targets a **Camp** under an existing Yard. All three drive the thin-SDK + **wRPC** runtime — typed clients over generated WIT bindings, no cloud logic in the SDK ([ADR-0069](./adr/01-architecture-core.md#adr-0069)).

### The two config files
- **`bindle.ts`** — *what* the app is (resources + bindings + runtime primitives). Provider-agnostic.
- **`hobo.config.ts`** — *where/how* it maps (runtime backend + provider mapping rules + Camps). The only file that names providers.

This separation is deliberate: code review of `bindle.ts` is about the app; `hobo.config.ts` is about hosting. Swapping clouds touches only the latter.

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
- **Human:** `npx hobo new my-app -t fullstack && cd my-app && hobo dev` → edit → `hobo login` → `hobo deploy`.
- **Agent:** an MCP client calls `list templates → new → plan → deploy`, obtaining tokens via the broker; never touches a key. The agent can `inspect_run`/`tail_logs` to verify and self-correct.
- **Brownfield (existing estate):** `hobo import terraform ./infra` adopts the current resources in place (no re-provision) → `hobo plan` shows a no-op diff → bring services under IfC one at a time, binding to still-`external` resources until they're adopted too — the strangler-fig path ([ADR-0041](./adr/07-portability-extensibility.md#adr-0041)).

### Editor & ecosystem integration
- TS types ship in every `@hobo/*` package; provider options autocomplete on `.with(...)`.
- Optional VS Code extension: topology preview, run inspector, and "explain this plan."
- Framework adapters (Next/Astro/Hono/etc.) wire HoBo's build transform like Vercel's `withWorkflow`.

### Iteration hooks
- Template set + whether scaffolds include `hobo.config.ts` pre-pinned or fully agnostic.
- How `hobo dev` emulates provider-specific behaviors (fidelity vs simplicity).
- Single binary vs `npx`-only distribution; self-update story.
- Depth of the VS Code extension vs CLI-first.
