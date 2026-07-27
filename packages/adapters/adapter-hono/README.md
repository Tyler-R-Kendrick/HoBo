# `@hobo/adapter-hono`

Shared **L2** package: bridge [Hono](https://hono.dev) apps into HoBo bindle HTTP
entrypoints. Use this from **any** HoBo project that chooses Hono — not only
examples.

| Layer | Package | Role |
|-------|---------|------|
| L0 | `@hobo/core` | Framework-free ports/types |
| L2 | **`@hobo/adapter-hono`** | `honoEntrypoint` / `toFetchHandler` |
| L3 | app / example | Hono routes + bindle topology |

## Install

```bash
pnpm add @hobo/adapter-hono hono
```

## Usage

```ts
import { Hono } from "hono";
import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

const api = new Hono().get("/hello", (c) => c.json({ ok: true }));
const web = new Hono().get("/", (c) => c.text("ok"));

export default bindle("my-app", (b) => {
  const a = b.api(honoEntrypoint(api));
  const w = b.web(honoEntrypoint(web)).dependsOn(a);
  return { api: a, web: w };
});
```

`honoEntrypoint(app)` returns the bindle thunk
`() => (Request) => Response` that local component hosts invoke.

## Isolated-wasm

For `componentHost=isolated-wasm`, HoBo bundles the same app module
(`src/api.ts` exporting `{ app }` with `.fetch`) into a wasi:http component.
No separate guest file is required — Hono routes compile through esbuild + jco.

## Boundary

- Depends on `@hobo/core` + `hono` only
- Must not be imported by `@hobo/core`
- Lives under `packages/adapters/` — not under `examples/`
