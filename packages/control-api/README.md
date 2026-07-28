# `@hobo/control-api`

Local-first control-plane HTTP + SSE adapter for the HoBo Yard game UI.

```ts
import { createControlApiServer } from "@hobo/control-api";

const server = await createControlApiServer({
  hoboHome: process.env.HOBO_HOME ?? `${process.env.HOME}/.hobo`,
  port: 8790,
});
// GET http://127.0.0.1:8790/v1/yard/snapshot
// GET http://127.0.0.1:8790/v1/yard/stream  (SSE)
```

CLI: `hobo serve control` (when wired) or programmatic start above.

PACT: `contracts/pacts/control-api.pact.json`
