# Plan 9 — Verification & open questions

> Part of the [HoBo Design Plan Suite](./README.md).

## Verification (how we'll validate when we implement)
- **Conformance suite:** every World/Provider/IaC/Build adapter must pass `@hobo/conformance` contract tests in CI.
- **Local E2E:** `examples/hello-bindle` deploys on `world-local`, exercises a workflow + actor + saga, and **replays** the event log to identical state (determinism test).
- **Real E2E:** `examples/multi-cloud-shop` deploys the *same bindle* to two providers via mapping rules; assert provider-specific `.with(...)` options only affect the resolved provider.
- **Durability:** kill the Yard mid-deploy; on restart it resumes from the event log; inject a provisioning failure and assert saga compensation/rollback.
- **Agent auth E2E:** an agent obtains a short-lived provider token via OIDC federation (no static secrets) and provisions a resource; assert the token-issuance events exist and the run is replayable.
- **MCP smoke test:** a real agent drives `deploy` + `inspect` through `@hobo/mcp`.

## Open questions to resolve in iteration
1. **Hobo Code standard:** publish as an open spec aligned with MCP-auth / OAuth-OBO / SPIFFE, or HoBo-proprietary first then standardize?
2. **Compiler magic:** how far to go with a build-time transform for `"use workflow"`/`"use step"` (Vercel-style) vs pure runtime wrappers?
3. **Planner intelligence:** rules-based vs cost/constraint-solver vs LLM-assisted provider selection.
4. **Default first provider** for P2 (Cloudflare vs Fly vs a local Docker provider).
5. **Built-in engine scope:** how much of Temporal/Restate we reimplement in `world-local` vs always recommending an external World in prod.
6. **Governance/license** for OSS + the hosted Yard business model.
