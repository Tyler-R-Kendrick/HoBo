# POC Rollup Ledger — Stage Gate S3

| Source proof | Reused capability |
|---|---|
| `hobo-mcp-server-contract` | SVID-bound MCP server, tool parity |
| `token-broker-skeleton-contract` | Brokered `request_token`, token events |
| `mcp-server-hardening-contract` | Approval gates, scope enforcement; refreshed for the validated leaf hardening, with simulation and Pact evidence unchanged |
| `cli-credential-hardening-contract` | Static secret rejection |
| `hobo-auth-json-contract` | Signed auth.json fixture for S2 cloud |

## HOBO-636 acceptance mapping

| Acceptance bullet | Evidence |
|---|---|
| J2 MCP journey on hello-bindle | `tests/stage-gate-s3-drill.test.ts` journey steps |
| Brokered tokens only | `traceScan.brokeredOnly` |
| token.* events | `tokenEvents` array |
| Replayable run | `replay.replayable` |
| NFR-017 self-correction | `selfCorrection.followedSteps` |
| High-risk approval gate | `prodDeployBlocked.decision.effect` |
| request_token bounded by .allow() | `overBroadToken.ok === false`, `overBroadToken.error.code === "MCP_SCOPE_DENIED"` |
