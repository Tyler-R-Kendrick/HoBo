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
- **Continuous Identity Migration Plane** ([ADR-0132](../../docs/design/adr/02-identity-security.md#adr-0132))
  — dual-path PrincipalRef continuity when adapters, residency, spectrum, or
  Yard placement change. **Nothing is required in the Bindle** for continuous
  migration: Matching + policy activate dual mode; progressive ramp uses
  existing Harness cohort flags; dual fixtures extend [ADR-0070](../../docs/design/adr/02-identity-security.md#adr-0070)
  for offline `hobo dev` / tests. Observe with `hobo identity status` /
  `hobo identity inspect <id>` and `hobo doctor`.

## Continuous identity migration (hands-off)

```ts
import {
  decideIdentityMigration,
  defaultContinuousMappingSpec,
  createContractAssertedDualFixtures,
  IdentityMigrationService,
  evaluateCanMigrate,
} from "@hobo/identity";

// Matching decides — no Bindle dual-adapter block required.
const decision = decideIdentityMigration({
  tenant: "acme",
  sourceAdapter: "oidc-legacy",
  targetAdapter: "oidc-modern",
});

const dual = createContractAssertedDualFixtures({ tenant: "acme" });
const can = evaluateCanMigrate({
  sourceAdapter: dual.sourceAdapter,
  targetAdapter: dual.targetAdapter,
  mapping: dual.mapping,
  dualOracleReady: true,
});

const svc = new IdentityMigrationService({ tenant: "acme" });
svc.start({
  tenant: "acme",
  sourceAdapter: decision.sourceAdapter,
  targetAdapter: decision.targetAdapter,
  mapping: decision.mapping,
  reason: decision.reason,
  mode: decision.mode,
  matchDecisionId: decision.decisionId,
});
// JIT link keeps both adapters valid until cutover (ADR-0100 grace patterns).
```

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
- Migration plane: `IdentityMigrationControlPlane` (Matching → auto-start →
  OpenFeature ramp → cutover), `IdentityMigrationService`,
  `decideIdentityMigration`, `evaluateCanMigrate`,
  `createContractAssertedDualFixtures` / `createDualAdapterPair`,
  `FeatureFlagStore`, `runSpectrumIdentityCutover` (Plan 50 composition),
  `dualVerifyClaims`, `mintDualAudienceGrant`, `advanceMigrationRamp`,
  `agentActionsForMigrationEvents`, `identity.Migration*` events.

## Verification

```sh
pnpm --filter @hobo/identity build
pnpm --filter @hobo/identity test
pnpm --filter @hobo/identity test:contract:consumer
```
