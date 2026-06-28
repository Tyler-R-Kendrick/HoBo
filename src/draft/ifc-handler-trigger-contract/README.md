# IfC Handler Trigger Contract POC

Independent proof for HOBO-79.

This package pins the authoring-side trigger attachment contract for IfC resources:

- HTTP routes lower to `wasi:http/incoming-handler`.
- `topic.subscribe`, `schedule.cron`, and `bucket.on` produce manifest trigger edges with host-trigger WIT exports.
- Workflow subscribers record a durable `hobo:runtime/workflow@0.1.0` link.
- Handler `ctx.bindings` is typed from the resource bind map.
- Duplicate routes, out-of-Bindle trigger resources, missing durable event paths, and bucket write-event permission inference are guarded by tests.

Out of scope: host trigger execution, durable runtime internals, gateway/websocket fan-out, and runtime provider wiring.

Run:

```powershell
npm.cmd --prefix src\draft\ifc-handler-trigger-contract test
```
