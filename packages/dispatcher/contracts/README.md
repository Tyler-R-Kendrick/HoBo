Executable PACT consumer evidence for `@hobo/dispatcher` service boundaries.

| Pact | Boundary |
|---|---|
| [`pacts/dispatch_decision.pact.json`](./pacts/dispatch_decision.pact.json) | Broker/stations dispatch-decision boundary |

Run consumer tests:

```sh
pnpm --filter @hobo/dispatcher test:contract:consumer
```
