# V1 Vibe Example Gap Closure Architecture

## Boundary Map

| Boundary | Purpose | Mock strategy |
|---|---|---|
| VibeChildBacklogBoundary | Reads the child issue matrix for HOBO-539 | Checked-in fixture derived from Linear issue titles, phases, projects, paths, and coverage rules |
| VibeScopeGuardBoundary | Rejects production/provider/customer-data/credential/claim creep | Deterministic forbidden-pattern guard |
| VibeUnblockLedgerBoundary | Records the parent blocker outcome for downstream work | In-memory evaluation summary; Linear state remains authoritative |

## Parse Boundary

The child backlog is represented as `VibeChildIssue` objects. Evaluation functions consume that
derived shape only after path, scenario, proof-mode, source-doc, phase, and scope-out fields are
explicit. The simulation never parses raw Linear markdown during tests.

## Event And Projection Model

Command: `EvaluateVibeGapClosure`.

Event: `vibeGapClosure.AcceptanceRecorded`, emitted when all child issue rows satisfy parent
acceptance.

Projection: `VibeGapClosureReadModel`, containing child count, phase distribution, project
distribution, missing contract list, and downstream unblock message.

Read store: tests and the simulation read only the projection summary. Future child automation reads
Linear after HOBO-539 is Done.

## Guardrail Evidence

Parse, don't validate: incoming command payloads, Pact fixtures, and protobuf/CUE-backed child
backlog records cross a parser boundary before the epic simulation uses them. The parsed domain
types are the `VibeChildIssue`, `VibeGapClosureBacklog`, and `VibeGapClosureEvaluation` records;
mocked providers receive only those derived types, not raw Linear markdown or unconstrained DTOs.

Event architecture: command handlers in the epic actors emit events into an in-memory event-store.
Materialized views and projections are rebuilt from that event stream, snapshots represent the
current read model, and historical snapshots are retained in a read store so automation, reviewer,
and simulation reads never infer state from mutable provider internals.
