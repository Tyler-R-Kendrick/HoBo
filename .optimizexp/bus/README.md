# Agent bus

Append-only log for OptimizeXP write-ahead **expect → act → outcome** cycles.

Design-relevant SDLC reviews also append `kind: "council"` entries. They are a
separate exact-six consensus conversation, not overloaded outcomes.

- Schema: `.agents/skills/optimizexp/references/agent-bus.md`
- Formal scores: `.agents/skills/optimizexp/references/metric-scorecard.md`
- Designer council: `.agents/skills/optimizexp/references/design-council.md`
- Entries: `entries/*-expect.json`, `*-act.json`, `*-outcome.json`

Every entry must include a formal **`scores`** scorecard (harms / friction / uncertainty).  
Outcomes also include **`comparison`** deltas vs expect/act.

Agents **read** this bus before each new expect to correct wrong predictions (`read-bus`).

Do not edit historical entries. Redact secrets before linking transcripts.

Council entries are also immutable. Their mutable state snapshot must
cross-check against bus history; blockers leave only through an appended
`blocker-resolution` entry. A rework cycle must retain its single linked rework
packet, and closeout compares its proposal paths and normalized diff hash with
the effective Git base-to-head diff before accepting unanimous approval.

```bash
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode validate-bus
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode read-bus --run <runId> --mismatches-only
node --import tsx .agents/skills/optimizexp/workflows/cross-agent/review-loop.mts --mode aggregate-bus --run <runId>
```
