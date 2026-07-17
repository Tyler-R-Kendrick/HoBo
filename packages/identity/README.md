# @hobo/identity

Production identity service for HoBo: SPIFFE JWT-SVID issuance from workload
attestation, OIDC discovery/JWKS verification, scope-narrowing rotation, an
append-only credential-audit event stream, and a per-deploy token broker. S2-04
promotes the near-production draft proof
(`src/draft/projects/s3-02-hobo-identity/`) into `packages/identity/`.

## What it does

- `IdentityService` — mints a JWT-SVID for an attested workload
  (`issueSvidFromAttestation`), rotates within the renewal grace window
  (`rotateSvid` / `rotateSvidWithScope`, which rejects scope widening),
  authenticates a token at the gateway (`authenticateAtGateway`), and exposes
  OIDC `discovery()` / `jwks()`. TTL defaults to 900s, renewal grace 300s.
- `TokenBroker` — holds one vaulted root credential and mints per-deploy,
  scope-bound, TTL'd tokens for an SVID, emitting `token.Granted` / `token.Used`
  / `token.Revoked`.
- Every identity and token event carries the never-compact
  `CREDENTIAL_AUDIT_RETENTION` descriptor.

## Deferred: keyless provider-STS exchange (S3-03)

The broker returns a deterministic fixture-scoped token derived inside the
vault. The real keyless OIDC-federation / provider-STS token exchange is a later
item (S3-03); see the `ponytail:` note in `src/token-broker.ts`.

## Exports

- `IdentityService`, `createFixtureHostAttestor`, `verifyWorkloadAttestation`,
  `JwtSvidIssuer`, `createInMemoryKms`, `verifyJwtWithJwks`.
- `TokenBroker`, `createInMemoryVault`, `TokenScope`, `ScopedTokenGrant`.
- Event factories/validators and `CREDENTIAL_AUDIT_RETENTION`.
- `IDENTITY_PORT` — the `IdentityProvider` port descriptor built through
  `@hobo/core`.

## Verification

```sh
pnpm --filter @hobo/identity build
pnpm --filter @hobo/identity test
pnpm --filter @hobo/identity test:contract:consumer
```
