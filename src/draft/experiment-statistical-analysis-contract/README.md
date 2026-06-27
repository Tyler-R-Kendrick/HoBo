# Experiment statistical analysis contract POC

Independent POC for HOBO-353. It proves the built-in OpenExperiment
statistical-analysis surface over existing `experiment.Exposed` records and
metric observations.

## Scope

- Pure replayable analysis over `(exposures, metrics)@seq`.
- Per-variant primary metric aggregation.
- Confidence intervals for primary effect and guardrail regression tests.
- Minimum sample/power floor before declaring a winner.
- `experiment.Concluded` event data compatible with the existing
  `hobo:experiment` port contract.
- Guardrail regression override: a statistically regressed guardrail turns a
  would-be winner into `do-not-ship`.
- Sampled exposure counts produce scaled population estimates instead of being
  treated as full traffic.
- Bounded metric values are clamped for robust aggregation so one extreme
  subject cannot flip the verdict.

## Out of scope

- Assignment and exposure collection.
- Peeking, p-hacking, and multiple-comparison guardrails.
- Experiment provider adapters.
- ML, continuous experiments, or training-engine integration.

## Verification

```powershell
npm.cmd test
```
