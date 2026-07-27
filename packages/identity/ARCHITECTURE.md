# @hobo/identity — Architecture Evidence

Production identity service for S2-04. Promotes the near-production draft proof
`src/draft/projects/s3-02-hobo-identity/` into `packages/identity/` and adds the
S2-04 token-broker skeleton.

## Schema and constraints

- Protobuf records live in [`data-models/`](./data-models): attestation binding,
  principal ref, code version, scope entry, JWT-SVID record, the identity event
  payloads, and the S2-04 token-broker records (`TokenScope`, `TokenGrantRecord`,
  `TokenGrantedEventData`, `TokenUsedEventData`, `TokenRevokedEventData`).
- CUE constraints in `data-models/identity.cue` bound every protobuf message in
  that schema.
- PACT consumer evidence for the identity service boundary lives under
  [`contracts/`](./contracts) and is exercised by `contracts/consumer`.

## Parse, don't validate

`verifyWorkloadAttestation` is the single parse, don't validate boundary for
workload identity: an untrusted `AttestationDocument` becomes a frozen, derived
parsed domain binding (verified host signature, measured tenant, code version,
component image digest, freshness) before any SVID is minted. Callers receive
derived parsed domain types — an `AttestationVerdict` and `ActiveSvidRecord` —
instead of re-checking raw claims. Provider-shaped callers depend on the
`IdentityProvider` contract in `src/port.ts`, built through `@hobo/core`.

## Scope narrowing, never widening

Rotation and token minting only ever narrow authority. `rotateSvidWithScope`
rejects any requested scope that widens the live SVID's `(port, resource,
verbs[])`; the token broker refuses a `(port, resource, action)` the SVID does
not already authorize. TTL defaults to 900s with a 300s renewal grace.

## Token broker (S2-04 skeleton)

The `TokenBroker` holds a single vaulted root credential (`VaultedCredential`)
and mints per-deploy, scope-bound, TTL'd tokens for an attested SVID. The raw
secret never leaves the in-memory vault: only one-way HMAC-derived material
crosses the boundary. The keyless provider-STS exchange is deferred to S3-03 —
see the `ponytail:` note in `src/token-broker.ts` where the OIDC-federation
token-exchange call will replace the fixture derivation.

## Event architecture

- **Command** — an attested-workload `issueSvidFromAttestation` /
  `rotateSvid` request, a `grantForDeploy` / `useToken` / `revokeToken`
  request against the broker, a Connection create/authorize/revoke, or a
  `resolveConfigSchema` / residual secrets-port access.
- **Event** — `identity.Issued`, `identity.Rotated`, `token.Granted`,
  `token.Used`, `token.Revoked`, `connection.*`, `config.Resolved`, and
  `secret.Accessed` facts. Every event carries the never-compact
  `CREDENTIAL_AUDIT_RETENTION` descriptor. Config/secret events carry **refs
  and version-ids only** — never plaintext values.
- **Actor** — the per-subject identity aggregate (and the per-grant broker /
  Connection / config-resolver aggregates) apply those events in order and own
  the active-SVID/grant/config-ref state.
- **Event store** — accepted events append to the platform event store as the
  durable source of truth for the credential-audit stream.
- **Materialized view / projection** — the credential-audit projection (S3-04,
  in `packages/cloud`) folds identity, token, connection, config, and secret
  event families into a per-correlation audit view off the single retained stream.
- **Snapshot** — the `activeSvids` / active-grant / Connection maps and resolved
  config placeholders are the in-memory snapshot of that projection.
- **Read store** — `getAuditEvents`, `discovery`, `jwks`, and agent-safe
  `schemaOnlyView` / `agentView` serve reads from that snapshot rather than
  replaying the raw event log.

## Secretless-first config (ADR-0027)

Ranked resolution ladder in `src/secrets-port.ts` / `src/config-resolver.ts`:
`bound-resource` → `provider-federation` → `camp-value` → `static-escape` (≤7d).
`hobo:secrets` / Vault JWT-OIDC / cloud SM stubs are residual adapters; preferred
paths are SVID-brokered tokens and `fromBinding` / `secretRef`. Dev uses
contract-asserted fixtures (`createContractAssertedConfigFixtures`) with the same
schema contracts as can-deploy.
