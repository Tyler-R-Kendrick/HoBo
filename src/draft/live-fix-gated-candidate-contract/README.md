# Live-fix gated candidate contract

Proof package for HOBO-368. It models the applier side of self-healing live-fix:
captured failing trace, generated candidate, sandbox/conformance/trace replay,
policy gate, canary/rollback, and permanent regression-test retention.

## Scope

- In: low-risk live-fix canary, rollback on regression, prod/destructive/blast-radius approval gates, replayed-trace validation, event replay.
- Out: SRE classification, generation internals, bounded repair internals, real deployment runtime.

## Proof command

```powershell
npm.cmd test -- src/draft/live-fix-gated-candidate-contract/test/live-fix-gated-candidate.test.ts
```
