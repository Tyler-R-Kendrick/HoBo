# hello-bindle

Barebones HoBo hello-world: private `api` + public `web`.

```ts
// src/bindle.ts
export default bindle("hello-bindle", (b) => {
  const a = b.api(honoEntrypoint(api));
  const w = b.web(honoEntrypoint(web)).dependsOn(a);
  return { api: a, web: w };
});
```

| File | Role |
|------|------|
| `src/api.ts` | Hono `GET /hello` |
| `src/webapp.ts` | Hono `GET /` → calls api via `services__api__http__0` |
| `src/bindle.ts` | Topology (defaults: api private, web public) |
| `src/wasm/api-guest.mjs` | wasi:http guest for isolated-wasm |
| `@hobo/adapter-hono` | Shared package: Hono → bindle entrypoint |

## Run

```bash
pnpm --filter @hobo/example-hello-bindle test
node packages/hobo/dist/bin/hobo.js yard init
node packages/hobo/dist/bin/hobo.js up --cwd examples/hello-bindle
node packages/hobo/dist/bin/hobo.js dev --cwd examples/hello-bindle
```
