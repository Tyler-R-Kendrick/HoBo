# Flag Partition Consistency Contract

Executable POC for HOBO-367. It proves the partition and stale-ruleset
contract that sits above the built-in feature-flag evaluator and the ruleset
sync seam.

The package composes:

- `src/draft/flag-event-contract` for `flag.*` inputs;
- `src/draft/built-in-flag-store-contract` for deterministic `ruleset@seq`
  evaluation;
- `src/draft/flag-ruleset-sync-contract` for subscribed evaluator state,
  disconnect/reconnect, backpressure, and freshness labels.

## Proofs

- a partitioned evaluator serves its last-known `ruleset@seq` and reports
  `freshness.status = "stale"` while a healthy peer advances;
- replicas at the same `seq` evaluate identically;
- reconnect from snapshot plus tail matches full replay and loses no flip;
- kill-switch propagation reports delivery latency within the declared bound;
- a clock-skewed or forged higher-`seq` claim is rejected;
- a slow evaluator degrades to stale-labeled reads without blocking healthy
  evaluators.

## Boundary

This proof intentionally does not implement the sync transport, the evaluator
internals, cross-Camp consistency, OpenFeature adapters, or flag governance. It
uses the public seams from the completed HOBO-319 and HOBO-326 draft packages.

## Run

```text
npm.cmd --prefix src\draft\flag-partition-consistency-contract test
```
