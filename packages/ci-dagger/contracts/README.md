# Dagger SDK readiness contract

`readiness.pact.json` is a hand-authored Pact v4 synchronous-message expectation
for the in-process `getReadiness()` SDK query. `readiness.consumer.test.ts`
invokes the shipped getter, compares protobuf JSON with the expected response,
and exercises `parseReadiness()` against approved and invalid values. This is
local consumer evidence; no vendor verification or HTTP service is implied.

The contract permits only planned readiness with execution unavailable.
`test/status.test.ts` additionally verifies frozen views and no execution API.

No Dagger execution API is called today. Before execution, add external PACTs
for runtime creation, authenticated execution, checkpoint replay, cancellation,
artifact identities, errors, and measured usage. Default tests must use fixtures
without credentials; real execution needs a separate explicitly configured lane.
