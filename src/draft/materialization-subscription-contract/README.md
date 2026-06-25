# Materialization Subscription Contract POC

Independent POC for HOBO-51, defining the reactive materialization subscription event contract:

- `subscription.Opened`
- `subscription.Recomputed`
- `subscription.Pushed`
- `subscription.Closed`
- `data.Changed`

## What This Proves

- Subscription events and `data.Changed` round-trip through contract validators.
- `subscription.Recomputed` carries a deterministic read-set hash.
- `data.Changed.op` is restricted to `insert`, `update`, or `delete`.
- Pushed subscription results are ephemeral and are not appended to the persisted fact log.
- Rebuilding from persisted facts restores `{ materialization, args, readSet, lastSeq }`.
- Change-feed anomalies for duplicate or non-monotonic source sequence numbers are detectable.

## Scope Boundary

This is a contract POC only. It does not implement the Reactor engine, RX operator library, Streamer transport, GraphQL facade, or ordered-feed conformance suite.
