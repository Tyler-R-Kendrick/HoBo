# @hobo/dispatcher — Architecture Evidence

Production Dispatcher (ADR-0071): credit/budget-aware deterministic selection
across registered providers for placement, dispatch, and traffic. Promotes
`src/draft/technical-proofs/dispatcher-maximize-credits-contract/` (decision
ranking, hysteresis, reservation CAS) and folds in the invariants of
`src/draft/technical-proofs/dispatcher-reservation-hardening-contract/`
(reserve/confirm/release/expire, headroom restore-on-release).

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models).
- CUE constraints bound every protobuf type in those schemas.
- PACT consumer evidence for the dispatch-decision boundary lives under
  [`contracts/`](./contracts).

## Parse, don't validate

`createDispatcherRegistry` and `parseCreditLedgerView` are the single
parse-don't-validate boundaries: untrusted provider declarations and
CreditLedgerView snapshots become derived parsed domain types before any
ranking, hysteresis, or reservation logic runs. Downstream consumers (broker
placement, the stations routing control loop) receive parsed decisions and
ranked candidates instead of re-checking raw DTO fields.

## Event architecture

- **Command** — a dispatch/placement request over a pinned `CreditLedgerView@seq`.
- **Event** — `dispatch.Decided`, `match.Decided`,
  `dispatch.ReservationReserved`, `dispatch.ReservationConfirmed`,
  `dispatch.ReservationReleased`, `dispatch.ReservationExpired`.
- **Actor** — the reservation ledger aggregate applies reservation events in
  seq order (CAS on `expectedSeq`; stale views re-rank instead of double-spend).
- **Event store** — accepted facts append to the platform event store as the
  durable source of truth.
- **Materialized view / projection** — the `CreditLedgerView` snapshot is the
  projection decisions are ranked against; every decision pins its
  `ledgerSeq` + `balanceHash` for audit.
- **Snapshot** — `reservationLedger.snapshot()` is the snapshot of that
  projection after applied reservation events.
- **Read store** — decision consumers query the ranked decision (with
  per-candidate rationale) rather than the raw event log.

Determinism: decisions are pure functions of (registry, ledger view, request).
`replayDispatchDecision(replayInput)` reproduces a byte-identical
`dispatch.Decided` fact — asserted by the replay test.
