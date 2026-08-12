# hello-bindle

Barebones HoBo hello-world: private `api` + public `web`.

```ts
// src/bindle.ts — one line to set, two .with() to inject
const campEnv = env({ GREETING_PREFIX: "howdy", APP_TITLE: "howdy" });

export default bindle("hello-bindle", (b) => {
  const a = b.api(honoEntrypoint(api)).with(campEnv);
  const w = b.web(honoEntrypoint(web)).with(campEnv).dependsOn(a);
  return { api: a, web: w };
});
```

`api` reads `GREETING_PREFIX`; `web` reads `APP_TITLE`. When you `hobo up` / `hobo dev`,
outputs say **howdy** (not the process defaults) — proof the camp is running the apps.

| File | Role |
|------|------|
| `src/api.ts` | Hono `GET /hello` (also compiled to wasm for isolated-wasm) |
| `src/webapp.ts` | Hono `GET /` → calls api via `services__api__http__0` |
| `src/bindle.ts` | Topology + `env()` injection (api private, web public) |
| `test/` | Golden definition + collected `hobo.manifest/v1`, plus handler smoke |
| `@hobo/adapter-hono` | Shared package: Hono → bindle entrypoint |

Barebones on purpose: no `contracts/`, `data-models/`, `deploy/`, or fixture trees in this example.
Generated wasm/sandbox outputs live under `$HOBO_HOME` (default `~/.hobo`) or a project-local `.hobo/` (gitignored) — never committed.

No separate wasm guest file — `hobo` bundles `src/api.ts` into a wasi:http component when `componentHost=isolated-wasm`.
Cloud/Vercel deploy defaults ship as package fixtures under `packages/hobo/fixtures/deploy/`.

## Run

This example **does** `hobo up` / `hobo dev` on the local lane. Build the adapter and composition root first — a half-built tree used to look like “no Bindle”.

```bash
pnpm exec turbo run build --filter @hobo/adapter-hono --filter @hobo/hobo
pnpm --filter @hobo/example-hello-bindle test
pnpm --filter @hobo/hobo exec hobo yard init
pnpm --filter @hobo/hobo exec hobo up --cwd examples/hello-bindle
pnpm --filter @hobo/hobo exec hobo dev --cwd examples/hello-bindle
```
