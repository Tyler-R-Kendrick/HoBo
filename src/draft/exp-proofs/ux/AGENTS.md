# ux experience proofs

End-user experience. Artifacts: `assets/` with REAL visuals — SVG/PNG wireframes, image mockups, screenshots. TypeScript "mockup modules" do not satisfy the gate.

Everything else (proof.json, executed examples/, notebook, cascade rule, run commands) follows the
parent [`src/draft/exp-proofs/AGENTS.md`](../AGENTS.md). Run a package with
`pnpm exec turbo run test --filter ./src/draft/exp-proofs/ux/<slug>`; validate artifacts with
`pnpm run draft:artifacts -- --staged`. Changing a proof here cascades into referencing epic
rollups — update them in the same diff (`pnpm run draft:cascade -- --staged`).
