# hello-bindle

A minimal HoBo example: a hello-world **API**, a **web app** that **calls** it
through a **bindle-resolved** named endpoint (Aspire-style `services__*`), and
the **bindle** that wires them together.

## The pieces

| File | What it is |
|---|---|
| `src/api.ts` | API `GET /hello` — greeting uses bindle-injected `GREETING_PREFIX`. |
| `src/config.ts` | Reads camp-injected bindle env (fails closed if missing). |
| `src/endpoints.ts` | Aspire/HoBo service-discovery helper: `services__<name>__http__0`. |
| `src/webapp.ts` | Web app — bindle `APP_TITLE` + API greeting via resolved endpoint. |
| `src/bindle.ts` | Wiring + env config: `.with({ option: "env", config })` and `dependsOn`. |
| `test/bindle.test.ts` | Proves graph, bindle env, endpoint resolution, and web→api. |

```ts
export default bindle("hello-bindle", (b) => {
	const api = b.api(() => helloApi.fetch).with({
		provider: "local",
		option: "env",
		config: { GREETING_PREFIX: "from-bindle-api" },
	});
	const web = b.web(() => helloWeb.fetch).dependsOn(api).with({
		provider: "local",
		option: "env",
		config: { APP_TITLE: "from-bindle-web" },
	});
	return { api, web };
});
```

The bare-metal camp is the **intermediary**: it injects both service discovery
and bindle env before entrypoints run:

```text
services__api__http__0 = http://127.0.0.1:<api-port>
GREETING_PREFIX        = from-bindle-api   # from bindle api annotation
APP_TITLE              = from-bindle-web   # from bindle web annotation
```

Neither app hardcodes those strings or hosts:

```ts
const prefix = resolveBindleConfig("GREETING_PREFIX"); // camp-injected
const apiBase = resolveServiceEndpoint("api");         // services__api__http__0
const { message } = await (await fetch(`${apiBase}/hello`)).json();
// message === "from-bindle-api, world"
```

The API handler rides along as an app-host entrypoint, reachable via
`definition.entrypoint("api")`; it never leaks into the provider-agnostic
manifest graph.

## Run it

Unit / contract tests:

```bash
pnpm --filter @hobo/example-hello-bindle test
```

**Real local e2e (bare-metal Yard):** install the default yard, then serve this
bindle through the composed CLI (not a side-script):

```bash
# from the HoBo monorepo root
node --import tsx packages/hobo/dist/bin/hobo.js yard init
node --import tsx packages/hobo/dist/bin/hobo.js dev --cwd examples/hello-bindle
# web → http://127.0.0.1:4000/   (calls api via services__api__http__0)
# api → http://127.0.0.1:4001/hello
```

`hobo dev` loads `src/bindle.ts`, composes a real Camp on the bare-metal Yard
(`dev-local`), injects Aspire-compatible `services__*` endpoints, and serves
each api/web entrypoint. Use `--once` for probe-and-exit (CI).

## How this maps to HoBo's architecture

The API is protobuf-first: its request/response shapes live in `data-models/greeting.proto`
with matching CUE constraints in `data-models/greeting.cue`, and `src/api.ts` imports the
**generated** `GreetingRequest`/`GreetingResponse` types from `src/_generated/greeting_pb.ts`
(run `buf generate data-models --template ../../buf.gen.yaml -o src/_generated` to regenerate).
Following **parse, don't validate**, `src/api.ts` runs untrusted query input through a single
parse boundary (`parseGreetingRequest`) that returns that **derived domain type**
(`GreetingRequest`) instead of re-checking raw fields downstream.

Wiring follows the Aspire model ([authoring-resources-wiring.md](../../docs/design/authoring-resources-wiring.md)):
`dependsOn` / `WithReference` records the edge and injects connection info under
`services__<name>__<endpoint>__<i>` (and `ConnectionStrings__*` for data ports).
The web→API boundary is also pinned by the executable PACT in
`contracts/pacts/web-to-api.pact.json`.

In HoBo's event-driven model a greeting is a **command**; the API **actor** emits a
`GreetingServed` **event** to the **event-store**; a **projection** (materialized view) folds
those events into a **snapshot** kept in the **read store**.
