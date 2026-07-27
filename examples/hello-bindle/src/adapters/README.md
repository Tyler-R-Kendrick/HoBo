# hello-bindle adapters

| Layer | Package / path | Role |
|-------|----------------|------|
| L2 monorepo adapter | `@hobo/adapter-hono` | Hono → bindle entrypoint (`honoEntrypoint`) |
| App Hono API | `../api.ts` | Hono routes for private `api` |
| App Hono web | `../webapp.ts` | Hono routes for external `web` |
| App wasm guest | `wasm/api-guest.mjs` | wasi:http guest for isolated-wasm (framework-free) |

HoBo core (`@hobo/hobo`, `@hobo/core`) only understands:

- bindle entrypoints as `(Request) => Response` (local host)
- project-supplied wasi:http guest sources / `.wasm` (isolated-wasm host)
- mesh injection of bindle env (`x-hobo-env-*`)

Hono never enters core — only this example + `@hobo/adapter-hono`.
