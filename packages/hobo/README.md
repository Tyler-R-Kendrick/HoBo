# @hobo/hobo

The composition-root app that makes the `hobo` CLI run end to end. It wires
HoBo's default LOCAL/MOCKED runtimes into the `@hobo/cli` command factories so
the composed binary runs the real in-process flow for `collect`, `plan`, `up`,
`down`, and `dev` — instead of the shell stubs `@hobo/cli` returns when
un-injected.

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

The composed `hobo` binary lives at `dist/bin/hobo.js`.

LOCAL/MOCKED lane only: in-memory event store, in-process executor, a mock IaC
backend, and a provider registry from `@hobo/provider-cloudflare`. No real cloud
calls. See [ARCHITECTURE.md](./ARCHITECTURE.md).
