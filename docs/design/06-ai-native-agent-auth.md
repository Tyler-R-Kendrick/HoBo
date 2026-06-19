# Plan 6 — AI-native & agent auth ⭐ (deep)

> Part of the [HoBo Design Plan Suite](./README.md).

This is HoBo's biggest differentiation vs Lakebed. **Goal: an agent can discover providers and self-provision credentials with zero developer involvement, and every action is durable + auditable.**

## 6.1 Hobo Code / Signs — the `auth.md` standard
A machine-readable standard each Provider publishes so agents can understand *what it offers* and *how to authenticate*. Markdown for humans + a strict JSON companion for machines, served at a well-known location.

```
/.well-known/hobo-code/          # discovery root for a provider
  signs.md                       # human-readable overview (llms-friendly)
  capabilities.json              # which ports + service models it implements
  auth.json                      # supported auth flows, scopes, token lifetimes, resource indicators
  cost.json                      # optional cost/region signals for the Planner
```
```jsonc
// auth.json (illustrative)
{
  "issuer": "https://provider.example.com",
  "flows": [
    { "type": "oidc-federation", "audience": "hobo", "exchange": "sts:AssumeRoleWithWebIdentity" },
    { "type": "oauth2-obo",      "scopes": ["db:write","compute:deploy"] },
    { "type": "device-code" },
    { "type": "api-key", "header": "X-Api-Key" }
  ],
  "tokenLifetimeSec": 3600,
  "resourceIndicators": ["urn:provider:db", "urn:provider:compute"]
}
```
Thematic anchor: real hobo signs were a shared symbol language for finding resources & safe passage — `signs.md` is that, for agents. This is the analog of "a standard like auth.md", and the centralized place providers register it is the **Registry**.

## 6.2 Agent identity as a first-class principal
- Every actor/agent gets a **workload identity** (SPIFFE-style SVID / short-lived OIDC token) issued by the Yard's **Identity** service. No static secrets in agent code.
- The Identity service is an **OIDC provider + token broker**. To call a provider, an agent's flow is:
  1. Agent presents its HoBo SVID/OIDC token.
  2. Yard looks up the provider's **Hobo Code** in the Registry.
  3. Token broker performs the provider's declared flow — **OIDC federation** (AWS `AssumeRoleWithWebIdentity`, GCP Workload Identity Federation, Azure federated credentials) or **OAuth On-Behalf-Of** when acting for a human, or **MCP/OAuth2.1** for SaaS.
  4. Agent receives a short-lived, capability-scoped provider token.
- **Every token issuance is an event** in the store → fully replayable, auditable credential trail (directly addresses the industry gap where agent actions can't be audited).

## 6.3 Durable AI agents (the `agent()` primitive)
A DurableAgent analog backed by the World: replayable, resumable, tools-as-steps, identity + scoped tokens injected via `ctx`.
```ts
import { agent, step } from "@hobo/runtime";

const deployTool = step(async ({ bindle }: { bindle: string }, ctx) => {
  // ctx.identity is the agent's SVID; ctx.token("aws") brokers a scoped token via Hobo Code
  return ctx.hobo.deploy(bindle);
});

export const opsAgent = agent("ops", {
  model: "anthropic/claude-haiku-4.5",
  instructions: "You operate HoBo deployments on the user's behalf.",
  tools: { deploy: { input: z.object({ bindle: z.string() }), execute: deployTool } },
});
```
Because tools are steps and runs are event-sourced, an agent can be interrupted and resumed without losing state — and its entire decision + credential history is replayable.

## 6.4 MCP control surface
The Yard exposes an **MCP server** (`@hobo/mcp`) so any agent (Claude, etc.) can drive HoBo: list/inspect bindles, deploy, read logs, query the Registry, request provider tokens, browse Hobo Code. This is the "make it as easy as possible for AI agents" requirement, and mirrors Lakebed's machine-readable ethos but for *operations*, not just app contracts. We also publish `llms.txt` / `llms-full.txt` / `docs.json` like Lakebed.

## 6.5 The Forge — AI-generated provider plugins
Instead of relying on a community to write adapters: given a backend's docs/OpenAPI/Terraform provider/Hobo Code, the **Forge** pipeline:
1. Generates a candidate `@hobo/provider-x` (port implementations + IaC mappings + a Hobo Code manifest).
2. Runs it in a Firecracker sandbox against the **`@hobo/conformance`** port contract tests with capability-scoped tokens (can't exfiltrate).
3. On pass, signs and publishes a shareable plugin to the Registry; on fail, feeds errors back for repair.

Conformance tests are the trust boundary that makes AI-generated extensibility safe.

## Iteration hooks
- Exact Hobo Code schema + `.well-known` path.
- Whether to align with emerging standards (MCP auth, OAuth-OBO draft, SPIFFE federation, Agent Identity Protocol).
- Human-in-the-loop gates for high-risk agent actions.
- Forge model/eval design.
- Plugin signing & supply-chain trust.
