# HOBO-168 MCP Server Contract

This POC pins the `@hobo/mcp` operations surface without building a production
MCP server, Yard runtime, auth provider, or dashboard. It proves tool metadata,
schema validation, CLI call-path parity, progress streaming, and the
`request_token` broker seam against local fixtures.

## What It Proves

- The documented MCP tools are listed with JSON-schema-shaped inputs and
  explicit read/write/destructive annotations.
- `plan` and `deploy` dispatch through the same shared CLI call path as
  `hobo plan` and `hobo up`.
- `inspect_run` returns projection data and `tail_logs` can stream progress.
- Each canonical CLI verb has a pinned MCP parity mapping.
- Malformed inputs produce structured errors.
- Anonymous mutation tools fail closed, while read-only tools remain callable.
- `request_token` delegates to the token-broker seam with the authenticated
  principal injected as the subject.
- Stdio and HTTP transport descriptors are exposed for the future server.

## Scope Boundary

This package intentionally does not implement auth/SVID scoping per tool,
prompt-injection hardening, editor integration, production transports, Yard
runtime handlers, or dashboard surfaces. Those are owned by the follow-on
HOBO-173, HOBO-194, and HOBO-180 slices.

## Verification

```powershell
npm.cmd --prefix src\draft\hobo-mcp-server-contract test
```
