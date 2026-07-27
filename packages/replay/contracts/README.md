# @hobo/replay contracts

PACT boundaries for Session Replay (ADR-0137):

| Pact | Boundary |
|---|---|
| `pacts/replay-tracker-ingest.pact.json` | Browser tracker → Station ingest (masked chunks, kill switch) |
| `pacts/replay-player-store.pact.json` | Player / CLI / MCP → Session index + blob store (station isolation) |

Contracts are fixture-backed for offline CI. Live multi-cloud object storage and OpenReplay Assist are residual / optional Station templates.
