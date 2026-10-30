Executable PACT consumer evidence for `@hobo/dispatcher` service boundaries.

| Pact | Boundary |
|---|---|
| [`pacts/dispatch_decision.pact.json`](./pacts/dispatch_decision.pact.json) | Broker/stations dispatch-decision boundary |

The consumer contract includes the all-ineligible hard-budget result: registered
candidates do not imply authority to run, and refusal carries no
`dispatch.Decided` fact. These are hand-authored expectations; they do not prove
provider billing behavior. Reservation finance, running-hold retention and
snapshot retry invariants are exercised by `test/budget-safety.test.ts`.

Run consumer tests:

```sh
pnpm --filter @hobo/dispatcher test:contract:consumer
```
