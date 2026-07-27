# hello-bindle

A minimal HoBo example: a **private API** and a single **public web** surface.
The web app reaches the API only through a **camp-injected** mesh URL
(Aspire-style `services__*`), never through a public TCP port.

Hono is used as an **app framework** via the L2 package
[`@hobo/adapter-hono`](../../packages/adapters/adapter-hono/README.md) — not
via `@hobo/core` / `@hobo/hobo`.

## Privacy model

| Resource | Exposure | How it is reached |
|---|---|---|
| `web` | **external** (only public HTTP) | `http://127.0.0.1:<port>/` |
| `api` | **private** (mesh only) | `http://hobo.internal/api/...` via `services__api__http__0` |

Without a camp (wasm-cloud / bare-metal host) keeping `api` private, both
would have to listen on the wire. HoBo’s host is the intermediary: it opens
**one** public listener for `web` and routes private discovery in-process.

## The pieces

| File / package | What it is |
|---|---|
| `@hobo/adapter-hono` | L2 adapter: `honoEntrypoint(app)` → bindle HTTP thunk |
| `src/api.ts` | Hono app for private `GET /hello` (bindle `GREETING_PREFIX`) |
| `src/webapp.ts` | Hono app for public web (bindle `APP_TITLE` + private api) |
| `src/bindle.ts` | Wiring: `honoEntrypoint`, endpoint privacy, env, `dependsOn` |
| `src/adapters/wasm/api-guest.mjs` | Framework-free wasi:http guest for `isolated-wasm` |
| `src/config.ts` | Camp-injected bindle env (fails closed if missing) |
| `src/endpoints.ts` | Aspire/HoBo service-discovery helper |
| `test/bindle.test.ts` | Graph, privacy, adapter wiring, web→api |

```ts
import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

export default bindle("hello-bindle", (b) => {
	const api = b.api(honoEntrypoint(helloApi)).with(
		{ provider: "local", option: "endpoint", config: { external: false } },
		{ provider: "local", option: "env", config: { GREETING_PREFIX: "from-bindle-api" } },
	);
	const web = b.web(honoEntrypoint(helloWeb)).dependsOn(api).with(
		{ provider: "local", option: "endpoint", config: { external: true } },
		{ provider: "local", option: "env", config: { APP_TITLE: "from-bindle-web" } },
	);
	return { api, web };
});
```

Camp injection before entrypoints run:

```text
services__api__http__0 = http://hobo.internal/api   # private mesh (no TCP)
services__web__http__0 = http://127.0.0.1:4000      # sole public endpoint
GREETING_PREFIX        = from-bindle-api
APP_TITLE              = from-bindle-web
```

```ts
const apiBase = resolveServiceEndpoint("api"); // http://hobo.internal/api
const { message } = await (await fetch(`${apiBase}/hello`)).json();
// message === "from-bindle-api, world"  — only works inside the camp mesh
```

## Run it

```bash
# unit tests (adapter + bindle graph)
pnpm --filter @hobo/example-hello-bindle test
```

**Real local e2e (local Yard, Hono via adapter):**

```bash
# from the HoBo monorepo root
node packages/hobo/dist/bin/hobo.js yard init --host local --force
node packages/hobo/dist/bin/hobo.js dev --cwd examples/hello-bindle
# ONLY public: http://127.0.0.1:4000/ (web)
# api is private on http://hobo.internal/api
```

**Isolated-wasm e2e (private api in wasmtime sandbox):**

```bash
node packages/hobo/dist/bin/hobo.js yard init --host isolated-wasm --force
node packages/hobo/dist/bin/hobo.js yard ensure
# requires src/adapters/wasm/api-guest.mjs (framework-free guest)
node packages/hobo/dist/bin/hobo.js dev --cwd examples/hello-bindle
```

Glossary: **Yard** = control plane, **Camp** = placement target, **component host** =
Camp capability that runs components, **Bindle** = app topology.
