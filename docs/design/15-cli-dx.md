# Plan 15 — CLI & developer experience

> Part of the [HoBo Design Plan Suite](./README.md). Lakebed's biggest strength is ruthless onboarding (`npx lakebed new` → running in seconds). HoBo must match that for the agnostic path while exposing depth on demand.

> **v3 (Humanitec):** new platform/ops commands — `hobo def` (manage Resource Definitions, [Plan 25](./25-resource-definitions-matching.md)), `hobo pack` (Resource Packs, [Plan 27](./27-drivers-packs-profiles.md)), `hobo env clone` + ephemeral/preview Camps ([Plan 26](./26-environments-deltas.md)), `hobo delta`/`hobo promote`, `hobo pipeline` + `hobo agent` ([Plan 28](./28-agent-gitops-pipelines.md)). Developer commands are unchanged — definitions are a platform-team surface.

> **v4 (gates):** add the verification surface — `hobo verify --target <env>` (the composite Gatekeeper: contracts + policy + evals + conformance + cost), `hobo can-deploy --target <env>` ([Plan 29](./29-contracts-compatibility.md)), `hobo explain-failure` (replay a blocked gate's events), `hobo fix --dry-run` (Forge-proposed remediation), and `hobo promote-contract` / `hobo promote-impl` ([Plan 23](./23-stubbable-ai-implementations.md)). All read-only by default; mutations go through the same gates.

> **v2 update.** `hobo build` compiles each service to a **wasm component** (jco/`@hobo/componentize`, OCI-container fallback) — [Plan 20](./20-wasm-wasi-runtime.md). `hobo deploy`/`plan` run a **resource-collection** phase (IfC) that emits the **manifest IR** — [Plan 21](./21-resources-catalog.md)/[Plan 22](./22-wiring-manifest.md). New commands: `hobo collect` (print collected resources, à la `nitric spec`) and `hobo stub <resource|service>` to run with stubs ([Plan 23](./23-stubbable-ai-implementations.md)). `hobo.config.ts` + Camps play the role of Nitric stack files.

## DX principles
1. **`npx hobo new` to running in under a minute** — no cloud account required for `hobo dev`.
2. **The agnostic path is the default path** — you can build, run, test, and inspect locally before ever choosing a provider.
3. **Fast inner loop** — hot reload of handlers/workflows; local runtime with replay; no deploy needed to iterate.
4. **Type-safe end to end** — bindings, workflow signatures, and provider options are all typed; the editor guides you.
5. **Everything the CLI does, an agent can do** — every command has an MCP equivalent ([Plan 6](./06-ai-native-agent-auth.md)).

## Command surface
```
hobo new <name> [--template todo|api|agent|fullstack]   scaffold a Bindle
hobo dev                                                 run locally on runtime-local (no cloud)
hobo build                                               compile services to wasm components -> OCI (container fallback)
hobo codegen [--check]                                   (re)generate typed clients into _generated/; --check fails on drift (CI) (ADR-0037)
hobo collect [--camp prod]                               run resource-collection (IfC) -> print manifest IR
hobo stub <resource|service>                             run with a stub behind a WIT port (Plan 23)
hobo plan [--camp prod]                                  dry-run: DeploymentPlan + cost + warnings
hobo deploy [--camp prod] [--strategy canary]            provision/converge to real infra
hobo promote <version> --camp prod                       move a Camp pointer
hobo rollback --camp prod                                revert to previous good version
hobo destroy --camp <camp>                               tear down (guardrail-gated)
hobo inspect run <id> | deploy <id> | topology           projections / time-travel
hobo logs [--follow] [<resource>]                        live stream via the Camp runtime streams
hobo drift [--heal|--propose]                            drift status + reconcile
hobo login                                               obtain a dev SVID (OIDC)
hobo registry search <capability> | add <provider>       browse/install providers (Hobo Code)
hobo forge <provider-url>                                request an AI-generated provider
hobo yard up [--restore <log>] | status                  run/restore a self-hosted Yard
hobo doctor                                              env/credential/connectivity diagnostics
```

## The two config files
- **`bindle.ts`** — *what* the app is (resources + bindings + runtime primitives). Provider-agnostic.
- **`hobo.config.ts`** — *where/how* it maps (runtime backend + provider mapping rules + Camps). The only file that names providers.

This separation is deliberate: code review of `bindle.ts` is about the app; `hobo.config.ts` is about hosting. Swapping clouds touches only the latter.

## The inner loop (`hobo dev`)
1. Resources resolve to **local equivalents** (containerized Postgres, in-memory queue, local object store) via the dev provider layer.
2. Handlers/workflows hot-reload; the local runtime persists events to `.hobo/` so runs survive restarts and are replayable/inspectable offline. **Codegen runs in the watch loop** — editing a WIT world, a Zod schema, an `.allow()`, or a `bind` regenerates the checked-in `_generated/` typed clients, so editor types stay live with no build step ([ADR-0037](./adr/ADR-0037-sdk-codegen-surface.md)).
3. `hobo inspect`/`logs` work against localhost with no auth (matching Lakebed's local ergonomics).
4. Determinism tests (`replay == state`) run in CI from the same local runtime ([Plan 2](./02-sdk-api.md), [Plan 9](./09-verification-open-questions.md)).

## Onboarding paths
- **Human:** `npx hobo new my-app -t fullstack && cd my-app && hobo dev` → edit → `hobo login` → `hobo deploy`.
- **Agent:** an MCP client calls `list templates → new → plan → deploy`, obtaining tokens via the broker; never touches a key. The agent can `inspect_run`/`tail_logs` to verify and self-correct.

## Editor & ecosystem integration
- TS types ship in every `@hobo/*` package; provider options autocomplete on `.with(...)`.
- Optional VS Code extension: topology preview, run inspector, and "explain this plan."
- Framework adapters (Next/Astro/Hono/etc.) wire HoBo's build transform like Vercel's `withWorkflow`.

## Iteration hooks
- Template set + whether scaffolds include `hobo.config.ts` pre-pinned or fully agnostic.
- How `hobo dev` emulates provider-specific behaviors (fidelity vs simplicity).
- Single binary vs `npx`-only distribution; self-update story.
- Depth of the VS Code extension vs CLI-first.
