# ADR-0027 — Secretless-first configuration & secrets

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Security, Engineering, Product
- **Related:** [Plan 31 — Config & secretless secrets](../31-config-secretless-secrets.md) · [06 AI/agent auth](../06-ai-native-agent-auth.md) · [12 Security](../12-security-multitenancy.md) · [ADR-0008](./README.md) (keyless identity) · [ADR-0023](./ADR-0023-security-posture-commitments.md) (bounded static-key hatch)
- **Origin:** product direction — "env vars / secrets should be loaded somehow, leveraging secretless auth patterns." The suite had keyless identity + a token broker but no explicit *app config/secrets loading* surface.

## Context
HoBo already issues keyless workload identities (SVIDs) and brokers short-lived provider tokens ([ADR-0008](./README.md)), and forbids static secrets at rest ([Plan 12](../12-security-multitenancy.md)). What was missing: a defined way for an **app** to declare and load configuration and secrets. Without it, teams default to the antipattern — static secrets in env files/images/IaC, or worse, in the event log.

## Decision
Define a **secretless-first** config/secrets model ([Plan 31](../31-config-secretless-secrets.md)):
1. **References, not values.** `config()`/`secret()`/`env()` declarations resolve to **references**, resolved **per Camp at use-time**. A value never lives in the Bindle, the Camp config, or the event log.
2. **Resolution ladder (secretless-first):** (a) **bound resource** → SVID-brokered short-lived token (no secret exists); (b) **secret with provider federation** → broker a scoped token and read from the provider's secret store at use-time; (c) **non-secret config** → typed value from the Camp's Deployment Set; (d) **static-secret escape hatch** → only where no federation exists, **bounded** by TTL + rotation + audit + opt-in ([ADR-0023](./ADR-0023-security-posture-commitments.md)).
3. **Provider-specific resolution belongs to the Camp.** The Bindle declares *what it needs*; each Camp supplies *where it comes from* (Key Vault vs Secrets Manager vs Vault) — so swapping clouds is a Camp change, not an app edit ([ADR-0024](./ADR-0024-portability-conformance-guarantee.md)).
4. **Audit + redaction.** Resolution is `config.Resolved` (ref → source, not value); secret reads are `secret.Accessed` joined to `token.Used`; values are redacted from logs/OTel/OpenInference spans and per-run-encrypted if they must transit a step's I/O ([TR-111](../../requirements/TRD.md)).

## Alternatives considered
- **Plain env-var injection** (12-factor) — rejected as the default: it normalizes static secrets and value-at-rest. Supported only as the bounded escape hatch.
- **A dedicated secrets manager product** — out of scope (a non-goal): HoBo brokers access to the provider's secret store rather than being one.
- **Resolve config at deploy-time and bake into the artifact** — rejected for secrets (value at rest); allowed for non-secret config via the Deployment Set.

## Consequences
- **(+)** The common case has **no secret to steal** (brokered tokens); secrets that do exist are referenced, short-lived, and audited. Strengthens the zero-secret KPI (NFR-005).
- **(+)** Config/secret sourcing is portable (declared in Bindle, sourced per Camp).
- **(−)** Requires a `secrets` port adapter per provider and a config-resolution path in the runtime; providers lacking federation fall back to the bounded static hatch (gap documented).
- **(−)** Adds `config.Resolved`/`secret.Accessed` events and redaction obligations to the runtime/observability surface.
