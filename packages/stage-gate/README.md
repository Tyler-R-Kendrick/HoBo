# @hobo/stage-gate

Reusable stage-gate runner (S0-12, and the release gate of ADR-0172). `defineStageGateS0()` declares the ordered S0
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
pnpm --filter @hobo/stage-gate run typecheck   # src, then src + test/ + contracts/ (tsconfig.test.json)
pnpm --filter @hobo/stage-gate run lint
pnpm --filter @hobo/stage-gate run test
pnpm --filter @hobo/stage-gate run test:contract:consumer
pnpm --filter @hobo/stage-gate run test:real   # selected by HOBO_AI_BDD_CMD
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
scenario, exit 0 for a run with no scenario or with none passed or healed (ai-bdd
exits 0 for an empty selection, so that pass replayed nothing), and a run id that
is not one directory name.

HoBo imports no ai-bdd code. The contract on this side is the schema and two
real reports copied byte for byte into `test/fixtures/ai-bdd/` (sha256 and origin
in its README); `src/acceptance-fields.ts` says, for every field the schema
requires, whether the parser reads it or ignores it and why, and
`test/acceptance-fields.test.ts` holds the parser to that table. Every object the
parser walks is closed to its schema key set (`src/report-keys.ts`, compared with
the copied schema by the same test): an unknown key is refused, a required key
that is absent is refused even where the gate ignores its value, a key repeated
in one object is refused, and a scenario's or step's `usage` must be zero like
the run's. The values of ignored fields (`recording`, `mode`, `coverage`,
`warnings`, ...) are not validated.

## The release gate (ADR-0172)

`defineReleaseGate()` (`hobo-stage-gate run release [--out <file>]`) runs ai-bdd's
three replay-only commands against the project in `HOBO_AI_BDD_PROJECT`, with
`HOBO_AI_BDD_CMD` as the command (a JSON argv, default `["ai-bdd"]`; for the
project's own devDependency use its package manager's exec, for example
`["opm","exec","ai-bdd","--"]`, or a path). Each check is
`scripts/check-acceptance.mts <step>`:

| Check | ai-bdd command | Passes on |
|---|---|---|
| `acceptance-plans-fresh` | `compile --check` | exit 0 (4: a plan is stale) |
| `acceptance-replay` | `run --frozen --no-agent --reporter json,junit` | exit 0 and a report that parses as replay-only evidence with that exit code |
| `acceptance-evidence-intact` | `verify-run .ai-bdd/runs/<runId>` | the run directory holds the same report, and exit 0 |

Each check `requires` the one before it; if that did not pass it is recorded
`skipped` (exit code -1) and never started. The exit code is read before the
report: after `run` exits 2 or 4 no report was written and an earlier one may
still be on disk, after 3 the run said nothing about the product, so in all
three cases `report.json` is not opened. Exit 3 and a command that cannot be
started are `not_run` (check and record), never `failed` or `passed`, and the
runner then exits 3. A passed release record holds exactly the three checks and
the replay's `report_digest`; it carries no signature or artifact, which stay
S0's.

Zero model calls is required, and `--no-agent` stops the agent but not the judge:
a subjective step is judged from the verdict cache (`.ai-bdd/cache/`, not
committed) or by a model call. A clean CI checkout therefore replays with zero
model calls only when that cache is restored first (or the suite has no
subjective step); otherwise the replay check fails and names the cache.

The real lane (`test/acceptance-real.test.ts`, `test:real`) runs the gate
against a real ai-bdd and is selected by setting `HOBO_AI_BDD_CMD`; it then also
needs `HOBO_AI_BDD_PROJECT` (a project whose plans, recordings and verdict cache
replay with no agent) and `HOBO_AI_BDD_STALE_DOC` (one of its docs, which the
negative control edits for one run and restores). Once selected it fails, never
skips, when either is missing or the command cannot run (the gate then records
`not_run`, which the lane does not accept). ai-bdd's offline test project (fake
driver and fake models, built by its `tests/acceptance/helpers/project.ts`) is a
project of that kind; its CLI is
`["node","--conditions=source","<ai-bdd>/packages/cli/src/bin.ts","-c","<the project's test config>"]`
and needs ai-bdd's own dependencies installed.

The gate's tests run real processes against a stand-in ai-bdd
(`test/helpers/fake-ai-bdd.mts`) that plays back
`contracts/pacts/stage-gate-ai-bdd-report.pact.json`, one interaction per exit
code, writing the copied real reports.

## Position in the event architecture

This package is build/CI-time tooling: it hosts no actor and runs no durable
event engine. The gate run is the command, each check completion appends a
`CheckResult` to the run record (append-only evidence, never mutated), the
emitted `stage-gate-s0.record.json` is the current-run snapshot, and acceptance
docs/CI artifacts are the read store that projects the latest passed record.
