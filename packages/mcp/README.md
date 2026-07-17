# @hobo/mcp

The MCP server that exposes HoBo's control surface to agents (S3-01/S3-02). It
maps every tool to a canonical CLI verb over the **same** `@hobo/cli` dispatch
path — there is no second implementation of plan/up/down — and gates each call
by the caller's SVID scope (deny-by-default), with inert tool output.

- `src/tool-surface.ts` — derives the tool list from `CANONICAL_VERBS`
  (NFR-004 parity; a divergent hand-list fails `assertToolSurfaceParity`).
- `src/server.ts` — `listTools()` / `callTool(name, input, auth)` dispatching
  through an injected `HoboCli` (wired to a `YardRuntime`).
- `src/auth.ts` — composes `@hobo/identity` for SVID scope, emits audited
  `mcp.ToolCallDecided` decisions, and proves the ADR-0023 inert-output rule.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and
[`ai-native-agent-auth.md`](../../docs/design/ai-native-agent-auth.md) §6.4.

## Scripts

- `pnpm --filter @hobo/mcp run build` — `tsc`
- `pnpm --filter @hobo/mcp run test` — vitest (parity, scripted plan→up,
  scope denial, inert output, pact consumer)
