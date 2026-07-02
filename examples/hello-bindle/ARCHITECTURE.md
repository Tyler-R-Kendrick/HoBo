# hello-bindle fixture — Architecture Evidence

Simulate-mode E2E stub (HOBO-586). Not production deployment proof.

## Parse, Don't Validate

`fixture.json` is parsed once at the fixture-runner boundary into derived domain
types before deploy/teardown simulation runs.

## Event Architecture

- **Command** — deploy/teardown phases invoked by `@hobo/ci-guard` fixture runner
- **Event** — `e2e.*` lifecycle events appended by the runner (not this package)
- **Actor** — sandbox simulate adapter (fixture runner)
- **Event store** — `test-results/e2e-events.jsonl`
- **Materialized view / projection** — CI job summary over event log
- **Snapshot** — latest fixture state per run id
- **Read store** — workflow artifacts
