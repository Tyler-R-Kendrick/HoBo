# @hobo/training-pipeline

The champion/challenger promotion gate (ADR-0025 / ADR-0125, IMPL-003).
`aggregateEvalResults` folds graded samples into an `EvalResult`, and
`evaluatePromotionGate` decides promote-or-refuse through the three-lens gate:
conformance green, eval thresholds met over enough samples, and policy allows
the change. `promotionEventNames` maps the decision to the platform's
past-tense event names. See [`ADR.md`](./ADR.md).

## Honest scope

Implemented: the pure gate function, eval aggregation, threshold/eval-result
parsers, and the decision-to-event-name mapping. The fourth lens (Trace) rides
the event log, not the decision record. Deliberately not here: no training run,
no eval execution, no event store — the gate is a pure function over recorded
eval results; the event-sourced promotion loop around it (the Yard's promotion
actor) lives in the runtime, not in this package.

## Commands

```bash
pnpm --filter @hobo/training-pipeline run build
pnpm --filter @hobo/training-pipeline run typecheck
pnpm --filter @hobo/training-pipeline run lint
pnpm --filter @hobo/training-pipeline run test
```

## Parse, don't validate

Untrusted eval inputs cross one parser boundary: `parseEvalResult` and
`parsePromotionThresholds` return deep-frozen derived types over the generated
proto messages (`EvalResult`, `PromotionThresholds`, `LensFlags`,
`ChampionChallenger`), enforcing the CUE-mirrored invariants (scores in
`[0, 1]`, non-empty refs); failures throw `PromotionGateParseError`.
`evaluatePromotionGate` consumes only those parsed values and returns a frozen
`PromotionDecision` — parse, don't validate. Wire forms live in
`data-models/promotion_decision.proto` with CUE constraints alongside.

## Position in the event architecture

The gate itself hosts no actor and holds no state. In the platform loop,
`RequestPromotion` is the command; a promote emits `training.Promoted` and
`impl.Promoted`, a refusal emits `eval.GateFailed` (via `promotionEventNames`);
the Yard's promotion actor calls this gate; eval results are read from and
decisions appended to the platform event store; a promotion projection folds
those events into current-champion state, and the promoted training artifact is
the snapshot applied at instantiation.
