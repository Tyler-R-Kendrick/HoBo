# __TITLE__

__One-paragraph statement of what this technical proof proves and for whom.__

## Architecture

```mermaid
flowchart LR
  A[replace] --> B[with the real] --> C[architecture]
```

## Evidence

- `architecture/` — protobuf + CUE + Pact fixtures (guardrail evidence)
- `examples/` — executed usage example (gate-enforced)
- `bench/` — vitest bench with committed baseline.json (numbers advisory; benches must execute)
- `notebook.ipynb` — executed tslab walkthrough


## Validation

- `pnpm --prefix <this package> test`
- `pnpm run draft:artifacts -- --base=HEAD~1` (artifact gate)
- `pnpm agent:check -- --staged` before committing
