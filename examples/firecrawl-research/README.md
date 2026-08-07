# Firecrawl research

A minimal HoBo app that wires an external developer service into a Bindle without requiring a user-provided credential.

The API exposes `GET /research?q=...` and forwards the query to Firecrawl's v2 Search API. Firecrawl's keyless tier allows Search, Scrape, and Interact calls without an `Authorization` header, so the example is runnable without a `.env` file or Firecrawl account.

## What this proves

- `b.external(...)` declares Firecrawl as an external SaaS dependency using the current public `@hobo/bindles` SDK.
- `.dependsOn(firecrawl)` records the application wiring edge.
- HoBo's endpoint-discovery convention injects the dependency as `services__firecrawl__http__0` at runtime.
- The application does not contain, request, or persist a Firecrawl API key.
- Firecrawl remains an external application rather than being modeled as a portable HoBo resource.

```ts
import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

import { app } from "./api.js";

export default bindle("firecrawl-research", (b) => {
  const firecrawl = b.external({
    endpoints: { http: "https://api.firecrawl.dev" },
  });

  const api = b.api(honoEntrypoint(app)).dependsOn(firecrawl);
  return { firecrawl, api };
});
```

The request itself uses Firecrawl's documented keyless REST surface:

```http
POST https://api.firecrawl.dev/v2/search
Content-Type: application/json

{"query":"HoBo SDK","limit":5,"sources":["web"]}
```

No authorization header is sent.

## Run tests

From the repository root:

```bash
pnpm --filter @hobo/example-firecrawl-research test
pnpm --filter @hobo/example-firecrawl-research typecheck
```

## Connector migration

This example deliberately does **not** invent a `connector()` call that does not yet exist in the shipped `@hobo/bindles` package.

The canonical SDK contract already reserves `connector(name, options?)` for this exact external-application use case (HOBO-43), including typed operations, usage-inferred scopes, and connection-scoped credential brokering. The implementation currently remains in the connector authoring/runtime proof packages.

When HOBO-43 is promoted, this example should become the first reference migration from the lower-level `b.external()` declaration to the public connector surface. Firecrawl is also a useful Auth.md/XAA target: Firecrawl directs agent platforms capable of minting a WorkOS ID-JAG to `https://www.firecrawl.dev/auth.md`; the keyless API remains a no-credential fallback for this demo.

## Firecrawl references

- Keyless launch: `https://www.firecrawl.dev/blog/firecrawl-keyless-launch`
- Search API: `https://docs.firecrawl.dev/api-reference/endpoint/search`
- Agent/Auth.md guidance: `https://www.firecrawl.dev/auth.md`
