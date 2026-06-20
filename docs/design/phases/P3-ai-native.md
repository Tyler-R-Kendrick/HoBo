# Phase P3 — AI-native core

> [Phases index](./README.md) · realizes [Plan 6](../06-ai-native-agent-auth.md), [Plan 12](../12-security-multitenancy.md), [Plan 14](../14-observability.md).

**Objective.** Agents become first-class principals: keyless identity + token brokering, a provider/Hobo Code registry, durable agents, and an MCP control surface — so an agent can deploy with zero static secrets and a full audit trail.
**Depends on.** P2.

> **v3 (Humanitec):** this phase also lands the **HoBo Agent** (outbound-only private-network deploys; Executors run behind it) and the **GitOps publisher** mode ([Plan 28](../28-agent-gitops-pipelines.md)) — both lean on the identity/SVID work here. The Registry begins accepting **Forge-generated Resource Definitions/Packs** ([Plan 25](../25-resource-definitions-matching.md)/[Plan 27](../27-drivers-packs-profiles.md)).

## Workstream 1 — Identity (`@hobo/identity`)
1. **SVID issuance** (SPIFFE-style JWT-SVID) with attestation of run/tenant/parent/code-version; rotation ([Plan 6](../06-ai-native-agent-auth.md)).
2. **OIDC provider** (discovery endpoint) so clouds can federate trust.
3. **Token broker**: exchange SVID → resource-scoped provider token via OIDC federation (AWS `AssumeRoleWithWebIdentity` / GCP WIF / Azure federated creds), OAuth On-Behalf-Of, or MCP/OAuth2.1.
4. Emit `identity.*` / `token.*` events → **CredentialAudit** projection ([Plan 14](../14-observability.md)).

## Workstream 2 — Registry (`@hobo/registry`)
1. Ingest + verify provider **Hobo Code** (`.well-known/hobo-code/`), index capabilities/auth/cost.
2. Capability search API; plugin records (provenance, conformance report).

## Workstream 3 — `.allow()` → scope wiring
1. Connect resource `.allow()` declarations ([Plan 21](../21-resources-catalog.md)) to: least-privilege IAM (IaC), wasm capability **links**, and brokered **token scope** — one declaration, three effects.
2. Policy gates for high-risk actions (destroy/prod/spend) — auto / require-approval (hook) / deny ([Plan 12](../12-security-multitenancy.md)).

## Workstream 4 — Durable agents (`@hobo/runtime` `agent()`)
1. `agent()` with model/instructions/tools; tools execute as **steps**; runs are event-sourced + replayable/resumable.
2. Inject `ctx.identity` (SVID) + `ctx.token(...)` (broker) + guardrails (`spendCapUsd`, live-fix policy stub).

## Workstream 5 — MCP control surface (`@hobo/mcp`)
1. Tools: `list_bindles`/`get_bindle`, `plan`, `deploy`/`promote`/`rollback`/`destroy`, `inspect_run`/`tail_logs`, `search_registry`, `request_token`, `get_drift`/`heal`.
2. MCP auth via the SVID model; capability-scoped tools. Publish `llms.txt`/`llms-full.txt`/`docs.json`.

## Deliverables
- `identity`, `registry`, `mcp`; `agent()` durable primitive; CredentialAudit projection.

## Exit criteria (acceptance)
- An **agent deploys a bindle via MCP** using only **brokered, short-lived tokens** (no static secrets); `token.*` events exist and the run is replayable.
- A high-risk action **blocks on a policy gate** until approved.
- Registry serves a provider's capabilities from its ingested Hobo Code; `request_token` returns a scoped token bounded by `.allow()`.

## Risks / iteration hooks
- Hobo Code as an open spec aligned with MCP-auth / OAuth-OBO / SPIFFE federation / AIP.
- Delegation chains (agent → sub-agent).
- Policy language for guardrails/ABAC (typed TS vs Rego/CEL).
