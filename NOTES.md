# Loop-me notes

## Tools & channels

- **GitHub** — `Tyler-R-Kendrick/HoBo` repo; PRs numbered; Cursor Cloud agents use `cursor/<descriptive-name>-<suffix>` branches
- **Linear** — team HoBo, issue keys `HOBO-N`; projects map to design epics; Done status + PR link comments
- **CI** — Docs + PR impact gate on every PR; `pnpm agent:check -- --base=origin/main` locally
- **Agent permissions** — can merge PRs, push branches, and post PR reviews via Cursor Automation MCP; cannot `gh pr close` via GraphQL integration

## Terminology

- **Stale PR** — open >24h, or draft with green CI but unmerged
- **Superseded PR** — branch work already landed on `main`; merge would regress or duplicate
- **Zero-out** — force-push `origin/main` to PR head branch; GitHub auto-closes when diff empty
- **Squash merge** — default merge style for agent PRs

## HoBo repo patterns

- Draft proofs live under `src/draft/<kind>/<slug>`
- Each proof needs traceability row, design proof README, protobuf/CUE/Pact artifacts
- Pre-existing `main` failures (closure-builder path, docs:okf on 4 proof READMEs) are known; don't chase as blockers
