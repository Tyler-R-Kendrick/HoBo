# dx experience proofs

Developer/operator experience. Artifacts: pseudo-code, protobuf + CUE contracts, mermaid diagrams. Model the developer persona and friction before shaping the interface.

Everything else (proof.json, executed examples/, notebook, cascade rule, run commands) follows the
parent [`src/draft/exp-proofs/AGENTS.md`](../AGENTS.md). Run a package with
`pnpm exec turbo run test --filter ./src/draft/exp-proofs/dx/<slug>`; validate artifacts with
`pnpm run draft:artifacts -- --staged`. Changing a proof here cascades into referencing epic
rollups — update them in the same diff (`pnpm run draft:cascade -- --staged`).
