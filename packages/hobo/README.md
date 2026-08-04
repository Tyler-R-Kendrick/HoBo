# @hobo/hobo

**Product composition root** for the end-user `hobo` CLI (and `hobo-mcp`).
This package is the composed product binary; **`@hobo/cli`** is the shell,
parser, registry, and command factories. Un-injected factories fall back to
intentional stubs; this package supplies the default runtimes so lifecycle verbs
run end to end in-process.

```ts
import { createComposedHoboCli } from "@hobo/hobo";

const cli = createComposedHoboCli();
await cli.run(["up", "--json"], { cwd: projectDir });
```

- `createComposedHoboCli(options?)` — the composed CLI (one shared YardRuntime
  across plan/up/down; login/new/build/codegen keep the `@hobo/cli` defaults).
- `createDefaultYardRuntime(options?)` — the default cloud runtime.
- `createDefaultDevRuntime(options?)` — the default offline dev runtime.
- `createDefaultCollectionTarget(projectDir?)` — the default collect target.

Composed binaries: `dist/bin/hobo.js` (product `hobo`) and `dist/bin/hobo-mcp.js`.
Canonical verb list: **38** verbs in `@hobo/cli` (`packages/cli/src/shell/verbs.ts`).

## HONEST SCOPE (default deploy lane)

Default `up` / `down` / `plan` drive the real `@hobo/iac-pulumi` adapter with an
**in-memory Automation-API stand-in** (offline, deterministic). That is **not**
a live cloud apply. Selection lives in `src/compose.ts` (`selectIacProvider`):

| Path | When |
|---|---|
| In-memory Pulumi stand-in | **Default** (no special env) |
| Real Pulumi Automation/CLI | `HOBO_PULUMI_LIVE=1` (engine- and credential-gated) |
| Live Cloudflare Workers | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| Live Vercel | `VERCEL_TOKEN` |

Related honesty elsewhere in this package:

- **`hobo login`** — fixture/OIDC session under `HOBO_HOME`; full production OIDC/SPIRE is not the default (`src/login-command.ts` `HONEST SCOPE`).
- **WASM build path** — when `hobo build` uses `@hobo/componentize`, artifacts are **synthetic wasm contract bytes**, not a real jco/`componentize-js` pipeline (see [`packages/componentize/README.md`](../componentize/README.md)).

**Pre-release:** `@hobo/hobo` is **not published to npm** as a stable install story yet. Prefer the monorepo workspace binary until publish hygiene and CI-proven release land. Ship targets: [`docs/design/launch-ship-targets.md`](../../docs/design/launch-ship-targets.md), [ADR-0140](../../docs/design/adr/07-portability-extensibility.md#adr-0140).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for layering and runtime assembly.
