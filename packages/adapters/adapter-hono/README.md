# `@hobo/adapter-hono`

**L2 framework adapter** — bridges [Hono](https://hono.dev) apps into HoBo bindle HTTP entrypoints.

| Package | Role |
|---------|------|
| `@hobo/core` / `@hobo/hobo` | Framework-free: `(Request) => Response`, mesh, sandboxes |
| **`@hobo/adapter-hono`** | Optional: Hono → HoBo fetch entrypoint |
| App bindle | Depends on this adapter if it uses Hono |

## Install

```bash
pnpm add @hobo/adapter-hono hono
```

## Local component host

```ts
import { Hono } from "hono";
import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

const api = new Hono().get("/hello", (c) => c.json({ ok: true }));

export default bindle("my-app", (b) => ({
  api: b.api(honoEntrypoint(api)),
  // same as: b.api(() => api.fetch)
}));
```

## Isolated-wasm

HoBo core does **not** componentize Hono itself. For `componentHost=isolated-wasm`,
supply a framework-free wasi:http guest at:

```text
src/adapters/wasm/<resource>-guest.mjs
```

That guest can mirror the same routes as your Hono app; it is not required to use
Hono (StarlingMonkey + jco componentize). Keep Hono on the local-host path via this package.

## Boundary

- **May** depend on `@hobo/core` + `hono`
- **Must not** be imported by `@hobo/core`
- **Must not** live inside `@hobo/hobo` composition root as a hard dependency
