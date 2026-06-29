# Region Objective Ranking Contract

POC for HOBO-81. It proves the deterministic Planner selection step that applies region and colocation constraints, then ranks full candidates by the configured objective before the stable definition-id tiebreak.

The module consumes a pinned catalog snapshot and deploy context only. It performs no live provider calls, clock reads, random selection, or model calls. The resulting `match.Decided` and `deployment.Planned` events carry the objective, ranking rationale, catalog hash, and tie state needed for replay.
