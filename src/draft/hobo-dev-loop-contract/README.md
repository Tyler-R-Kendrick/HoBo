# HoBo Dev Loop Contract POC

HOBO-122 proof for the `hobo dev` local runtime loop boundary.

## What This Proves

- A scaffolded `hobo new` project can boot through the `hobo dev` contract on localhost in under a minute with no cloud account.
- Local resources resolve through the existing local Camp/resource contract and surface honest fidelity labels: `real`, `simulated`, `mocked`, and `camp-only`.
- Handler edits hot-reload without losing run state.
- `.hobo/dev-state.json` survives process restart and replays to the same state.
- Zod/source edits regenerate checked-in `_generated/` output through the existing codegen contract, and concurrent saves debounce to one codegen run.
- Syntax errors report a clear reload error while the daemon stays alive.
- Incompatible `.hobo/` state fails closed without corrupting the stored state file.
- `--fork` request-lane writes stay isolated from the shared environment baseline.

## Boundary

This is an executable contract for the local-loop surface, not a production daemon. It does not
implement the real file watcher, inspect/logs UI, provider-backed runtime, sandbox/test mocking,
cloud credentials, or production deployment behavior.

## Verification

```powershell
npm.cmd --prefix src\draft\hobo-dev-loop-contract test
```


## Architecture Evidence

This package ships the architecture-guard evidence required by
`scripts/check-architecture-guardrails.mjs`:

- `architecture/` — protobuf data shapes and CUE constraints for Hobo Dev Loop Contract.
- `architecture/pacts/` — PACT contract for the package boundary.
- `ARCHITECTURE.md` — parse-don't-validate and event-architecture evidence.
