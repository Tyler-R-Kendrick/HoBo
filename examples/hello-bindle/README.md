# hello-bindle

A minimal HoBo example: a hello-world **API**, a **web app** bound to it, and the
**bindle** that wires them together.

## The four pieces

| File | What it is |
|---|---|
| `src/api.ts` | The hello-world API — a [Hono](https://hono.dev) app exposing `GET /hello`. |
| `src/webapp.ts` | The web app (Hono) that is bound to the API. |
| `src/bindle.ts` | The bindle config that does the wiring. |
| `test/bindle.test.ts` | Proves the graph (`api` + `web` + edge) and that the bound API answers `hello, world`. |

```ts
export default bindle("hello-bindle", (b) => {
	const api = b.api(() => helloApi.fetch);           // API handler is accepted + bound here
	const web = b.web(() => helloWeb.fetch).dependsOn(api); // web app bound to the API
	return { api, web };
});
```

The API handler rides along as an app-host entrypoint, reachable via
`definition.entrypoint("api")`; it never leaks into the provider-agnostic manifest graph.

## Run it

```bash
pnpm --filter @hobo/example-hello-bindle test
```

## How this maps to HoBo's architecture

The API is protobuf-first: its request/response shapes live in `data-models/greeting.proto`
with matching CUE constraints in `data-models/greeting.cue`, and `src/api.ts` imports the
**generated** `GreetingRequest`/`GreetingResponse` types from `src/_generated/greeting_pb.ts`
(run `buf generate data-models --template ../../buf.gen.yaml -o src/_generated` to regenerate).
Following **parse, don't validate**, `src/api.ts` runs untrusted query input through a single
parse boundary (`parseGreetingRequest`) that returns that **derived domain type**
(`GreetingRequest`) instead of re-checking raw fields downstream.

In HoBo's event-driven model a greeting is a **command**; the API **actor** emits a
`GreetingServed` **event** to the **event-store**; a **projection** (materialized view) folds
those events into a **snapshot** kept in the **read store**. The web→API boundary is pinned by
the executable PACT in `contracts/pacts/web-to-api.pact.json`.
