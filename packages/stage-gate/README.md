# @hobo/stage-gate

Reusable stage-gate runner (S0-12). `defineStageGateS0()` declares the ordered S0
toolchain checks (boundary lint, architecture guard, schema drift, PACT
consumer/provider, conformance self-test, sign/verify, hello-bindle determinism
and health, tamper-refuse), `runStageGate` executes them and captures evidence,
and the `hobo-stage-gate` CLI emits an append-only `StageGateRecord` JSON file.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full evidence trail.

## Honest scope

Implemented: the check runner (spawning repo `pnpm` scripts, capturing exit codes
and failure output tails), the S0 gate definition, record parse/serialize, and
the fixture scripts under `scripts/` (sign/verify, determinism, health,
tamper-refuse against `@hobo/componentize` output). Not here: no durable event
engine — records are files/CI artifacts, not appends to a running event store —
and the gate does not decide promotion; it only produces the evidence record
other surfaces consume.

## Commands

```bash
pnpm --filter @hobo/stage-gate run build
pnpm --filter @hobo/stage-gate run typecheck
pnpm --filter @hobo/stage-gate run lint
pnpm --filter @hobo/stage-gate run test
pnpm --filter @hobo/stage-gate run test:contract:consumer
```

## Parse, don't validate

Untrusted JSON crosses one parser boundary: `parseStageGateRecord` applies the
protobuf shape plus CUE constraints and returns deep-frozen derived types —
`StageGateRecord`, `CheckResult`, `ComponentArtifact`, `SignatureEvidence` —
and malformed or tampered input throws `StageGateParseError`. Downstream code
consumes only parsed records — parse, don't validate. Wire forms live in
`data-models/stage_gate_record.proto` with CUE constraints alongside.

## ai-bdd run reports (ADR-0172)

`parseAiBddRunReport(bytes)` reads the bytes of an ai-bdd `report.json`
(`RunReport`, `schemaVersion` 1) and returns a frozen `AcceptanceEvidence`
(`data-models/acceptance_evidence.proto` + `.cue`): run id, the sha256 of the
exact bytes read (`report_digest`, equal to `sha256sum report.json`), scenarios
per status, fuzzy steps, model calls, the frozen/no-agent flags and the exit
code. It refuses a report that is not replay-only evidence: `schemaVersion` other
than 1, `options.frozen` or `options.noAgent` false, `options.updateRecordings`
true, any model call (a judge call means the verdict cache `.ai-bdd/cache/` was
cold), a status outside the seven, an exit code outside 0..4, totals that
disagree with the scenarios, exit 0 beside a failed/inconclusive/blocked/error
scenario, and a run id that is not one directory name.

HoBo imports no ai-bdd code. The contract on this side is the schema and two
real reports copied byte for byte into `test/fixtures/ai-bdd/` (sha256 and origin
in its README); `src/acceptance-fields.ts` says, for every field the schema
requires, whether the parser reads it or ignores it and why, and
`test/acceptance-fields.test.ts` holds the parser to that table.

## Position in the event architecture

This package is build/CI-time tooling: it hosts no actor and runs no durable
event engine. The gate run is the command, each check completion appends a
`CheckResult` to the run record (append-only evidence, never mutated), the
emitted `stage-gate-s0.record.json` is the current-run snapshot, and acceptance
docs/CI artifacts are the read store that projects the latest passed record.
