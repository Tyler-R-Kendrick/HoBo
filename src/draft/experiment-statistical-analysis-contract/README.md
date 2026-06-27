# Experiment statistical analysis contract POC

Independent POC for HOBO-353 and HOBO-375. It proves the built-in
OpenExperiment statistical-analysis surface over existing `experiment.Exposed`
records and metric observations, then hardens the conclusion surface against
peeking, p-hacking, multiplicity, and underpowered wins.

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
- Locked analysis-look schedules block favorable peeking before a scheduled
  conclusion point.
- Bonferroni correction raises the decision confidence across a pre-registered
  metric family so many-metric cherry-picks cannot create a free win.
- Required sample-size power floors block tiny samples from declaring a winner
  even when all observed samples favor a variant.
- Primary metrics and eligible analysis segments must be pre-registered;
  post-hoc metric swaps and segment cherry-picks fail closed.
- Pre-registered segment families are counted in the Bonferroni family size
  rather than treated as independent uncorrected chances to win.

## Out of scope

- Assignment and exposure collection.
- Experiment provider adapters.
- ML, continuous experiments, or training-engine integration.

## Verification

```powershell
npm.cmd test
```
