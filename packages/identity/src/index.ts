export {
  ATTESTATION_SCHEMA_VERSION,
  createFixtureHostAttestor,
  verifyWorkloadAttestation,
  type AttestationDocument,
  type AttestationVerdict,
  type LaunchMeasurement,
  type PrincipalRef,
} from "./attestation.js";
export {
  createIdentityIssuedEvent,
  createIdentityRotatedEvent,
  createTokenGrantedEvent,
  createTokenRevokedEvent,
  createTokenUsedEvent,
  CREDENTIAL_AUDIT_RETENTION,
  IDENTITY_EVENT_SCHEMA_VERSION,
  TOKEN_EVENT_SCHEMA_VERSION,
  validateIdentityEvent,
  validateTokenEvent,
  type IdentityEvent,
  type TokenEvent,
  type TokenScope,
} from "./events.js";
export {
  createInMemoryKms,
  JwtSvidIssuer,
  JWT_ALGORITHM,
  verifyJwtWithJwks,
  type JwtSvidClaims,
  type KmsLike,
  type OidcDiscovery,
} from "./issuer.js";
export {
  IDENTITY_BOUNDARY_SCHEMA,
  IdentityService,
  type ActiveSvidRecord,
  type GatewayAuthResult,
  type IssueSvidResult,
  type RotateSvidResult,
  type ScopeEntry,
} from "./identity-service.js";
export {
  createInMemoryVault,
  TokenBroker,
  TOKEN_BROKER_DEFAULT_TTL_SECONDS,
  type GrantTokenResult,
  type RevokeTokenResult,
  type ScopedTokenGrant,
  type UseTokenResult,
  type VaultedCredential,
} from "./token-broker.js";
export {
  IDENTITY_INTERFACE,
  IDENTITY_PORT,
  type IdentityProvider,
} from "./port.js";

export const HOBO_IDENTITY_PACKAGE = "@hobo/identity";
