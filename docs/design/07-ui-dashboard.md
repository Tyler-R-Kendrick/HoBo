# Plan 7 — UI / dashboard

> Part of the [HoBo Design Plan Suite](./README.md). The Yard ships a dashboard built on the SDK; it reads only [projections](./11-event-model.md) and [streams](./14-observability.md), never live providers.

> **v3 (Humanitec):** add a **Resource Graph** view, a **matching-decision** view (`match.Decided` — which Resource Definition won and why, [Plan 25](./25-resource-definitions-matching.md)), a **Delta diff / promote** view ([Plan 26](./26-environments-deltas.md)), and a **Pipelines** view with approval gates ([Plan 28](./28-agent-gitops-pipelines.md)) — matching Humanitec's Portal while staying projection-only.

> **v2 update.** Adopt Nitric's **local-dashboard** features for `hobo dev` (test APIs, browse kv/sql/buckets, trigger schedules, publish to topics, inspect websockets) and add HoBo-native views: the **collected-resource/manifest** view ([Plan 22](./22-wiring-manifest.md)), the **link map** (component imports → providers, [Plan 20](./20-wasm-wasi-runtime.md)), and **cross-WIT-call traces** + AI implement/evolve/live-fix proposals & approvals ([Plan 23](./23-stubbable-ai-implementations.md)).

## Principles
1. **Everything is a view over events.** No view has privileged state; each is a projection, so the dashboard is consistent with the audit log by construction.
2. **Replay/time-travel is a first-class UX**, not a hidden log. The deploy timeline and run inspector both scrub through history.
3. **Human + agent parity.** Every panel maps to an MCP tool ([Plan 6](./06-ai-native-agent-auth.md)); the UI is "the agent's view, rendered for humans."
4. **Self-host = hosted UI.** Same app, ships with the Yard Bindle.

## Core views
| View | Source projection | What it shows |
|---|---|---|
| **Deployments timeline** | DeploymentView | event-sourced history with a replay/time-travel scrubber; per-resource provisioning states; rollback/compensation visualized on the DAG |
| **Topology graph** | TopologyView | resources → resolved providers + options; `bind` edges annotated with connectivity tier + estimated egress/cost ([Plan 13](./13-networking-connectivity.md), [Plan 16](./16-cost-finops.md)) |
| **Run inspector** | RunView | workflow/step/actor/saga trace; per-step inputs/outputs/attempts/duration; **replay-diff** against current code ([Plan 14](./14-observability.md)) |
| **Registry browser** | Registry | providers, their Capability Manifest/signs, capabilities, cost signals, Forge-certification + provenance |
| **Agent activity & credential audit** | CredentialAudit | agent runs + every token grant/use/revoke, joined to the triggering run; approvals on policy gates |
| **Cost & FinOps** | cost projection | plan-time estimates vs actuals, budgets/caps, showback per tenant/Bindle/Camp |
| **Drift** | DriftView | resources diverged from desired; heal/propose actions |

## Key interactions
- **Plan preview before deploy** — render `hobo plan` output (provider resolution, cost, warnings, cross-cloud edges) as an approvable diff; deploy from the UI triggers the same command path as the CLI.
- **Approve a policy gate** — high-risk actions (destroy/prod/over-budget, incl. agent requests) surface as an inline approval that resolves a `createHook` ([Plan 6](./06-ai-native-agent-auth.md)).
- **Promote / rollback** — move a Camp pointer with a confirmation; the timeline reflects it as events.
- **Live tail** — logs and run streams render in real time via the Camp's runtime `streams`.

## Tech & structure
- Next.js app, itself a HoBo `web` resource in the Yard Bindle; subscribes to projections via the Gateway's read API and to live data via streams.
- Component-driven; design-system and detailed flows are deferred (this plan is a scope/IA sketch — the visual design is an explicit iteration target, see [Plan 0](./00-vision.md) "ui design" iteration note).

## v2 views (integrated)
Additional views the v2 model adds, each a projection/stream like the rest:
| View | Source | Shows |
|---|---|---|
| **Local emulation** (Nitric-style) | `runtime-local` | test APIs; browse kv/sql/buckets; trigger schedules; publish to topics; inspect websockets ([Plan 15](./15-cli-dx.md)) |
| **Collected manifest** | `bindle.ManifestProduced` | the IfC resource-collection output (resources, links, annotations) before deploy ([Plan 22](./22-wiring-manifest.md)) |
| **Link map** | manifest links | each component's imports → resolved capability providers ([Plan 20](./20-wasm-wasi-runtime.md)) |
| **WIT-call traces** | `link.Called` / stub recordings | cross-port calls; the basis for AI implement/evolve/live-fix **proposals + gate approvals** ([Plan 23](./23-stubbable-ai-implementations.md)) |

## Iteration hooks
- Information architecture & navigation; the design system.
- Whether the dashboard is runtime-agnostic (read API only) or has a runtime-specific fast path.
- Depth of replay/diff tooling in UI vs CLI.
- Multi-tenant org/team/project navigation and RBAC surfacing.
