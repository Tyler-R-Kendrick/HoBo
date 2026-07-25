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
	BROKER_OIDC_ASSERTION_TTL_SECONDS,
	createInMemoryProviderStsExchange,
	createInMemoryVault,
	mintOidcFederationAssertion,
	TokenBroker,
	TOKEN_BROKER_DEFAULT_TTL_SECONDS,
	type BrokeredCredentialSource,
	type ExchangedProviderCredential,
	type GrantTokenResult,
	type OidcFederationAssertion,
	type ProviderStsExchange,
	type RevokeTokenResult,
	type ScopedTokenGrant,
	type StsExchangeRequest,
	type StsExchangeResult,
	type UseTokenResult,
	type VaultedCredential,
} from "./token-broker.js";
export {
	IDENTITY_INTERFACE,
	IDENTITY_PORT,
	type IdentityProvider,
} from "./port.js";

export const HOBO_IDENTITY_PACKAGE = "@hobo/identity";
