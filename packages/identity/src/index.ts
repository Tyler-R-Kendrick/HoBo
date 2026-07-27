export {
	ATTESTATION_SCHEMA_VERSION,
	type AttestationDocument,
	type AttestationVerdict,
	createFixtureHostAttestor,
	type LaunchMeasurement,
	type PrincipalRef,
	verifyWorkloadAttestation,
} from "./attestation.js";
export {
	CONNECTION_EVENTS,
	CONNECTION_EVENT_SCHEMA_VERSION,
	type ConnectionEvent,
	type ConnectionEventType,
	type ConnectionFlow,
	type ConnectionPrincipalRef,
	type ConnectionStatus,
	createConnectionAuthorizationStartedEvent,
	createConnectionAuthorizedEvent,
	createConnectionCreatedEvent,
	createConnectionHealthChangedEvent,
	createConnectionRevokedEvent,
	createConnectionRotatedEvent,
	createConnectionTokenIssuedEvent,
	isConnectionEventType,
	validateConnectionEvent,
} from "./connection-events.js";
export {
	CONNECTION_SCHEMA_VERSION,
	type AuthorizeConnectionInput,
	type ConnectionPolicyDecision,
	type ConnectionPolicyGate,
	type ConnectionRecord,
	type ConnectionView,
	type CreateConnectionInput,
	ConnectionService,
	defaultConnectionPolicyGate,
	foldConnectionEvents,
} from "./connection.js";
export {
	CREDENTIAL_AUDIT_RETENTION,
	createIdentityIssuedEvent,
	createIdentityRotatedEvent,
	createTokenGrantedEvent,
	createTokenRevokedEvent,
	createTokenUsedEvent,
	IDENTITY_EVENT_SCHEMA_VERSION,
	type IdentityEvent,
	TOKEN_EVENT_SCHEMA_VERSION,
	type TokenEvent,
	type TokenScope,
	validateIdentityEvent,
	validateTokenEvent,
} from "./events.js";
export {
	type ActiveSvidRecord,
	type GatewayAuthResult,
	IDENTITY_BOUNDARY_SCHEMA,
	IdentityService,
	type IssueSvidResult,
	type RotateSvidResult,
	type ScopeEntry,
} from "./identity-service.js";
export {
	createInMemoryKms,
	JWT_ALGORITHM,
	type JwtSvidClaims,
	JwtSvidIssuer,
	type KmsLike,
	type OidcDiscovery,
	verifyJwtWithJwks,
} from "./issuer.js";
export {
	IDENTITY_INTERFACE,
	IDENTITY_PORT,
	type IdentityProvider,
} from "./port.js";
export {
	resolveConfigSchema,
	type ConfigResolutionResult,
	type ConfigResolverOptions,
} from "./config-resolver.js";
export {
	createContractAssertedConfigFixtures,
	type DevConfigFixture,
} from "./config-dev-fixtures.js";
export type {
	ConfigFieldDef,
	ConfigSchema,
	SecretSourceRank,
} from "./config-types.js";
export {
	assertNoPlaintextInEvent,
	CONFIG_SECRET_EVENT_SCHEMA,
	createConfigResolvedEvent,
	createSecretAccessedEvent,
	type ConfigSecretEvent,
} from "./secrets-events.js";
export {
	asHoboSecretsStore,
	createAwsSecretsManagerPort,
	createAwsSecretsManagerStub,
	createAzureKeyVaultPort,
	createAzureKeyVaultStub,
	createCampSecretsPort,
	createMemorySecretsPort,
	createVaultJwtSecretsPort,
	resolveConfigEntry,
	type FetchLike,
	type ResolvedConfigEntry,
	type ResolutionLadderInput,
	type SecretsAccessResult,
	type SecretsPort,
} from "./secrets-port.js";
export {
	decryptLocalOverrides,
	encryptLocalOverrides,
	type LocalOverrideFile,
} from "./local-overrides.js";
export {
	assertNoPlaintextConformance,
	requireNoPlaintextConformance,
	type PlaintextConformanceResult,
	type PlaintextScanHit,
} from "./secrets-conformance.js";
export {
	BROKER_OIDC_ASSERTION_TTL_SECONDS,
	type BrokeredCredentialSource,
	createInMemoryProviderStsExchange,
	createInMemoryVault,
	type ExchangedProviderCredential,
	type GrantTokenResult,
	mintOidcFederationAssertion,
	type OidcFederationAssertion,
	type ProviderStsExchange,
	type RevokeTokenResult,
	type ScopedTokenGrant,
	type StsExchangeRequest,
	type StsExchangeResult,
	TOKEN_BROKER_DEFAULT_TTL_SECONDS,
	TokenBroker,
	type UseTokenResult,
	type VaultedCredential,
} from "./token-broker.js";

// public-contract: the package id consumers assert against.
export const HOBO_IDENTITY_PACKAGE = "@hobo/identity";
