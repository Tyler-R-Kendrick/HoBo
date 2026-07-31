# Agent bus

Append-only log for OptimizeXP write-ahead **expect → act → outcome** cycles.

- Schema: `.agents/skills/optimizexp/references/agent-bus.md`
- Formal scores: `.agents/skills/optimizexp/references/metric-scorecard.md`
- Entries: `entries/*-expect.json`, `*-act.json`, `*-outcome.json`

Every entry must include a formal **`scores`** scorecard (harms / friction / uncertainty).  
Outcomes also include **`comparison`** deltas vs expect/act.

Agents **read** this bus before each new expect to correct wrong predictions (`read-bus`).

Do not edit historical entries. Redact secrets before linking transcripts.

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode validate-bus
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode read-bus --run <runId> --mismatches-only
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode aggregate-bus --run <runId>
```
