---
type: Reference
title: "Stage 3 Acceptance Record — Agent Autonomy"
description: "Source issue: S3-01."
tags: [hobo, design]
---

# Stage 3 Acceptance Record — Agent Autonomy

Source issue: S3-01 (HOBO-627).

Branch evidence:

- [`build-s3-agent-autonomy-acceptance proof record`](./proofs/build-s3-agent-autonomy-acceptance/README.md)

This M0 record defines the accepted productionization scope for Stage 3 (Agent Autonomy). It does not
build Identity, Registry, MCP server, durable `agent()` runtime, `.allow()` scope wiring, Relay/GitOps
publisher, Operator Crew, or adversarial hardening code.

## Executable Proofs

Promoted draft epic proofs (read-only evidence; do not modify):

| Proof | Runnable command |
|---|---|
| [`identity-auth-secrets-cross-app-access-xaa`](../../src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/README.md) | `pnpm --prefix src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa test` |
| [`cli-mcp-developer-experience`](../../src/draft/epic-proofs/cli-mcp-developer-experience/README.md) | `pnpm --prefix src/draft/epic-proofs/cli-mcp-developer-experience test` |
| [`portability-registry-distribution`](../../src/draft/epic-proofs/portability-registry-distribution/README.md) | `pnpm --prefix src/draft/epic-proofs/portability-registry-distribution test` |

## Stage Goal And Runnable Gate

**Roadmap objective** (from [`docs/archive/roadmap.md`](../archive/roadmap.md), Stage 3 — AI-native
core):

> Make HoBo AI-native: agents are first-class authenticated principals — keyless SVID identity +
> token brokering, a Capability Manifest registry, durable agents, and an MCP control surface.

**Roadmap acceptance gate** (quoted verbatim):

> an agent deploys a bindle via MCP using only brokered short-lived tokens (no static secrets),
> `token.*` events exist + run replayable; a high-risk action blocks on a policy gate until
> approved; Registry serves capabilities from an ingested Manifest, `request_token` returns a scope
> bounded by `.allow()`.

**Release criteria** (from [`docs/archive/requirements/requirements.md`](../archive/requirements/requirements.md),
Stage 3):

> an agent deploys via MCP using only brokered tokens; credential audit present.

### Runnable gate checklist

| Assertion | Requirement citations |
|---|---|
| An agent deploys a bindle via MCP using only brokered short-lived tokens (no static secrets). | FR-020, FR-023, NFR-005 |
| `token.*` events exist and the agent run is replayable. | FR-021, NFR-005 |
| A high-risk action blocks on a policy gate until approved. | FR-022 |
| Registry serves capabilities from an ingested Manifest. | FR-020 |
| `request_token` returns a scope bounded by `.allow()`. | FR-021, FR-023 |
| An agent deploys via MCP using only brokered tokens; credential audit present. | FR-020, FR-023, NFR-005 |

### Normative design decisions

1. **Agents are principals, not scripts.** Every actor/agent receives a SPIFFE-style JWT-SVID
   (`spiffe://yard/<tenant>/agent/<name>`) via attest → issue (`identity.Issued`) → rotate
   (`identity.Rotated`) → scope. No static secrets ship in agent code.
2. **Keyless preference order is fixed:** `oidc-federation` > `oauth2-xaa` > `oauth2-obo` >
   `device-code` > `api-key`. The API-key escape hatch is opt-in, max-TTL-bounded,
   rotation-enforced, and fully audited (NFR-005, TR-051, ADR-0023).
3. **Capability Manifest lives at** `/.well-known/capability-manifest/` (`index.json`, `signs.md`,
   `capabilities.json`, `auth.json`, `cost.json`). The Registry crawls/accepts `index.json`, verifies
   its signature, and indexes capabilities plus auth. Its schema is owned by `@hobo/core` (Stage 0),
   not re-invented here.
4. **One `.allow()` declaration drives three effects:** least-privilege IAM, wasm capability links,
   and brokered token scope. `request_token` scope must be bounded by `.allow()`.
5. **Every credential event is audited:** `token.Granted` → `token.Used` → `token.Revoked` (plus
   `token.Denied`) feed the replayable `CredentialAudit` projection.
6. **`agent()` is internal; connectors are public.** Public agent interop is
   `connector(..., { protocol: "a2a" | "acp" })` from `@hobo/bindles`. `@hobo/runtime`'s `agent()`
   (tools-as-steps, event-sourced, replayable, `ctx.identity` / `ctx.token(...)` / `spendCapUsd`) is
   not a public SDK factory ([`sdk-contracts.md`](./sdk-contracts.md), [`package-namespaces.md`](./package-namespaces.md)).
7. **MCP tool surface (initial):** `list_bindles` / `get_bindle`, `plan`, `deploy` / `promote` /
   `rollback` / `destroy`, `inspect_run` / `tail_logs`, `search_registry`, `request_token`,
   `get_drift` / `heal`. MCP auth uses the same SVID model. HoBo publishes `llms.txt` /
   `llms-full.txt` / `docs.json`.

**Naming reconciliation:** the archived roadmap names the Yard control plane `@hobo/cloud`, while
[`architecture.md`](./architecture.md#packages) places Yard self-host configuration in the operator
SDK `@hobo/sdk` (`packages/sdk/`). S2-01 (Stage 2 acceptance record, HOBO-616) pins Yard
Gateway/Planner/Orchestrator services to `packages/cloud` (`@hobo/cloud`). This record uses the S2-01
pin for `.allow()` scope wiring through the Yard control plane and describes `@hobo/sdk` as the
operator SDK wherever self-host configuration is in scope.

## Scope In

Each package below is a **proof expectation for S3-02..S3-09**, not a deliverable of this M0 issue.
When built, each package carries protobuf-first records with CUE constraints in a package-local
`data-models/` folder and PACT pacts in `contracts/` at every service boundary.

### `packages/identity/` — `@hobo/identity`

**Public surface:** SVID issuance and rotation, OIDC provider, token broker.

**Proof expectations:** attest → issue (`identity.Issued`) → rotate (`identity.Rotated`); keyless
credential ladder with fixed preference order; `token.Granted` / `token.Used` / `token.Revoked` /
`token.Denied` audit; bounded API-key escape hatch.

### `packages/registry/` — `@hobo/registry`

**Public surface:** Capability Manifest ingest, verify, and index; capability search API.

**Proof expectations:** crawl/accept `/.well-known/capability-manifest/index.json`; verify signature;
index capabilities and `auth.json` flows; serve search results from ingested manifests.

### `packages/mcp/` — `@hobo/mcp`

**Public surface:** MCP tool table from decision 7; SVID-bound MCP auth.

**Proof expectations:** CLI/MCP parity for plan, deploy, inspect, registry search, and
`request_token`; fail-closed scope denial; `llms.txt` / `docs.json` publication.

### `packages/runtime/` — `@hobo/runtime` (`agent()` internal)

**Public surface:** none for `agent()` — internal durable-agent execution surface only.

**Proof expectations:** tools-as-steps durable runs; `ctx.identity` (SVID); `ctx.token(...)` brokered
tokens; `spendCapUsd` guardrails; replayable event-sourced runs. Public agent interop stays in
`@hobo/bindles` via `connector(..., { protocol })`.

### `packages/bindles/` + Yard control plane — `.allow()` scope wiring

**Public surface:** `.allow()` declarations in `@hobo/bindles`; scope propagation through the Yard
control-plane package pinned by S2-01: `packages/cloud` (`@hobo/cloud`).

**Proof expectations:** one `.allow()` drives least-privilege IAM, wasm capability links, and
brokered token scope; `request_token` scope bounded by `.allow()`; high-risk actions route through
policy gates emitting `policy.Decided`.

## Scope Out And Non-Goals

| Exclusion | Owner issue |
|---|---|
| `@hobo/identity` implementation (SVID issuance, OIDC provider, token broker) | S3-02 |
| `@hobo/registry` implementation (manifest ingest/verify/index, search API) | S3-03 |
| `.allow()` → IAM / links / token-scope wiring and high-risk policy gates | S3-04 |
| Durable `agent()` plus protocol connectors in `@hobo/runtime` / `@hobo/bindles` | S3-05 |
| `@hobo/mcp` server plus `llms.txt` / `docs.json` | S3-06 |
| HoBo Relay and GitOps publisher | S3-07 |
| Operator Crew core | S3-08 |
| Stage-3 adversarial hardening and runnable stage-gate fixture (`examples/durable-agent`) | S3-09 |
| Forge / generation pipeline (Stage 5) | Stage 5 |
| Multi-provider mapping (Stage 4) | Stage 4 |
| Governance planes / AI-safety guardrail runtime (Stage 6) | Stage 6 |
| Meta-cloud broker records | HOBO-521 family |

## Resolved Open Hooks

### Capability Manifest as an open spec

The manifest is published as a versioned, signed spec at `/.well-known/capability-manifest/` with the
`@hobo/core`-owned protobuf+CUE schema as normative. `auth.json` flow types are pinned to named
standards: OIDC federation, OAuth-OBO, MCP-OAuth2.1, and `oauth2-xaa` with its ID-JAG draft string
pinned per [ADR-0084](./adr/02-identity-security.md#adr-0084) and the HOBO-271 threat-model ADR — a
mismatched, missing, or newer unreviewed draft revision yields `hold` or `invalid_grant`, never
silent interop. Unknown flow types fail closed.

**Decision:** HoBo treats the Capability Manifest as a signed, versioned open spec at
`/.well-known/capability-manifest/` with `@hobo/core` schema authority and fail-closed handling for
unknown or unreviewed `auth.json` flow types.

### Agent→sub-agent delegation chains

Every sub-agent run attests its **parent principal** at Identity (Plan 06 §6.2 step 1 already
carries it), receives its **own** SVID, and its brokered scopes must be an **attenuation-only
subset** of the parent's `.allow()`-derived scope. The full chain is answerable from
`token.Granted` / `token.Used` / `token.Revoked` exactly as ADR-0084 records user → agent →
external-app chains. Scope broadening across a delegation hop is a `token.Denied`, never a silent
widening.

**Decision:** Sub-agent delegation is attenuation-only: each hop gets its own SVID, parent principal
attestation, and brokered scopes that are a subset of the parent's `.allow()`-derived scope, with
scope broadening emitting `token.Denied`.

### Guardrail / ABAC policy language

The built-in engine is the typed TypeScript policy decision model in `@hobo/policy` (Plan 29). Rego
(OPA) and Cedar are optional adapters behind the `policy-engine` port (`provider-opa`,
`provider-cedar` per [`architecture.md`](./architecture.md#packages)), never the default. Guardrail
verdicts (`require-approval` / `auto-allow` / `deny`, `spendCapUsd`, destroy protection — FR-022)
are policy-plane gates emitting `policy.Decided`.

**Decision:** Stage 3 guardrails use the built-in typed TypeScript policy model in `@hobo/policy` as
the default engine, with Rego and Cedar only as optional `policy-engine` port adapters.

## Authority Boundaries

| Boundary | Owner | M0 decision |
|---|---|---|
| Identity | `@hobo/identity` | Owns SVID issuance, rotation, OIDC provider, and token brokering. No other surface mints or widens credentials. |
| Registry | `@hobo/registry` | Owns Capability Manifest verification, signature checks, and capability indexing. Does not issue tokens or bypass policy. |
| MCP | `@hobo/mcp` | Owns the MCP tool surface and SVID-bound tool auth. Never bypasses Identity or policy gates. |
| Yard / Gatekeeper | `@hobo/cloud` Yard + `@hobo/policy` / `@hobo/contracts` | Owns block/approve for high-risk deploy and token actions. MCP tools cannot bypass Gatekeeper decisions. |

Identity, Registry, MCP, and Gatekeeper cannot silently overwrite each other's authority. A
superseding credential or deploy decision requires a new audited event (`token.*`, `policy.Decided`,
or deployment gate evidence), not in-place mutation.

## Evidence Table

| Runnable-gate line | Promoted epic proof | Notes |
|---|---|---|
| Brokered short-lived tokens; no static secrets; credential audit | [`identity-auth-secrets-cross-app-access-xaa`](../../src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/README.md) | Keyless ladder, `token.*` audit, XAA delegation |
| MCP deploy parity; fail-closed scope denial | [`cli-mcp-developer-experience`](../../src/draft/epic-proofs/cli-mcp-developer-experience/README.md) | SVID-bound MCP plan/deploy; high-risk block |
| Registry manifest ingest and search | [`portability-registry-distribution`](../../src/draft/epic-proofs/portability-registry-distribution/README.md) | Certified listing install/verify; capability discovery |
| `token.*` replayable run | [`identity-auth-secrets-cross-app-access-xaa`](../../src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/README.md) | Event-sourced credential audit projection |
| High-risk action blocks on policy gate | [`cli-mcp-developer-experience`](../../src/draft/epic-proofs/cli-mcp-developer-experience/README.md) | `policy.Decided` on denied deploy |
| `request_token` bounded by `.allow()` | [`identity-auth-secrets-cross-app-access-xaa`](../../src/draft/epic-proofs/identity-auth-secrets-cross-app-access-xaa/README.md) | Least-privilege scope narrowing |

Provider-side Pact verification is documented as unavailable in the promoted drafts; providers are
mocked at the proof boundary.

## Follow-Up Gate

Do not start S3-02..S3-09 until reviewers accept this record and the three executable proofs pass.
