# ADR — Evals + Training Promotion Gates POC

## Context

HOBO-653 requires production-shaped `@hobo/evals` and `@hobo/training` packages.
This draft POC proves the seam before packages land under `packages/`.

## Decision

- Compose existing contract modules (`eval-promotion-gate`, `training-engine-port`,
  `built-in-opto`, `openinference-trajectory-capture`, `champion-challenger-promotion`)
  behind two deep modules: `evals` and `training`.
- Promotion requires all three pass flags (conformance, eval, policy) before
  `training.Promoted` / `impl.Promoted` events emit.
- `"use training"` lint is source-text based for the POC; production will use AST.

## Consequences

- Production packages can lift this orchestration with minimal reshaping.
- OTLP export uses an in-memory tenant backend in tests; real HTTP is out of scope.
