# Formal interop metrics ledger

Machine-readable experiment rows for hypotheses **H1–H7** (plan [0015](../0015-formal-interop-hypotheses.md)).

- **File:** [`ledger.jsonl`](./ledger.jsonl) — one JSON object per line.
- **Writer:** `@hobo/formal-interop` `appendMetricsRow` (shipped harness, not ad-hoc scripts).
- **Required columns:** `hypothesis`, `tier`, `method`, `pass_at_1`, `pass_at_k`, `beq_or_fidelity`, `agentv_scores`, `preflight_reject_rate`, `cost_usd`, `latency_ms`, `seed`, `model`, `prompt_digest`.

Regenerate / extend by running:

```bash
pnpm --filter @hobo/formal-interop test
```
