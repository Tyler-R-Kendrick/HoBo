# __TITLE__

__One-paragraph statement of what this epic proof proves and for whom.__

## Architecture

```mermaid
flowchart LR
  A[replace] --> B[with the real] --> C[architecture]
```

## Rollup

- `poc-rollup-ledger.md` — one row per reused technical/exp proof (source path, disposition)
- `services/` — reference architecture importing lower proofs (reuse, never copy)
- `simulation/` — offline simulation + fixtures
- `features/` — EXECUTABLE cucumber suite (`pnpm run test:behavior`)
- `contracts/` — Pact inventory + consumer tests


## Validation

- `pnpm --prefix <this package> test`
- `pnpm run draft:artifacts -- --base=HEAD~1` (artifact gate)
- `pnpm agent:check -- --staged` before committing
