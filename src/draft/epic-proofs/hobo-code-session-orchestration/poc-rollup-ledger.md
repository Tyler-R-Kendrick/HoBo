# Proof rollup ledger

| Proof | Disposition |
|---|---|
| `src/draft/technical-proofs/agent-session-control-plane-contract` | Canonical versioned command/snapshot/event boundary |
| `src/draft/exp-proofs/dx/hobo-code-harness-experience` | Reused isolation, promotion, cleanup, and operator-friction evidence. Evidence-triple call updated to supply `recordingMp4Path` + `screenshotPaths`, which `emitEvidenceTriple` has required since it stopped accepting media it had not seen; the proof runs headlessly, so those two captures are fixtures standing in for a Playwright run and prove the harness wires the triple together, not that a recording was taken. |
