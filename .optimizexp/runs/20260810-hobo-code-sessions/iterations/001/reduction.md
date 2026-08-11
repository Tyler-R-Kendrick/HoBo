# Reduction: resident sessions

- Finding: the old session surface only described a one-shot handback.
- Hypothesis: real tmux PTYs, SQLite snapshots, branch worktrees, revisioned controls, and loopback browser control reduce friction and uncertainty.
- Result: improved (`metric_total` 29 → 6; `metric_max` 4 → 2).
- Verification: current-head CLI transcript, real tmux acceptance, process restart test, and reviewed browser capture.
- Residual: remote access uses the existing Station forwarding trust boundary; no public bind or parallel credential system was added.
