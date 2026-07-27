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

// Continuous Identity Migration Plane (hands-off; zero Bindle config required).
export {
	CAN_MIGRATE_SCHEMA_VERSION,
	type CanMigrateInput,
	type CanMigrateReason,
	type CanMigrateResult,
	evaluateCanMigrate,
} from "./can-migrate.js";
export {
	type AdapterClaims,
	agentRebindHint,
	type DualAudienceGrant,
	type DualVerifyResult,
	dualConsistencyDigest,
	dualVerifyClaims,
	mintDualAudienceGrant,
	verifyDualAudienceGrant,
} from "./dual-adapter.js";
export {
	applyClaimTransform,
	defaultContinuousMappingSpec,
	MAPPING_SPEC_SCHEMA_VERSION,
	type ClaimMapping,
	type MappingSpec,
	type MappingSpecInput,
	parseMappingSpec,
} from "./mapping-spec.js";
export {
	foldIdentityMigrationEvents,
	IDENTITY_MIGRATION_SCHEMA,
	IdentityMigrationService,
	type IdentityMigrationRecord,
	type MigrationMode,
	type MigrationReason,
	type MigrationState,
	type PrincipalLink,
	type StartMigrationInput,
} from "./migration-aggregate.js";
export {
	createContractAssertedDualFixtures,
	DUAL_FIXTURE_FIDELITY,
	type DualIdentityFixtures,
} from "./migration-dual-fixtures.js";
export {
	createDualConsistencyCheckedEvent,
	createDualLinkedEvent,
	createMigratedEvent,
	createMigrationAbortedEvent,
	createMigrationCompensatedEvent,
	createMigrationCutoverEvent,
	createMigrationProgressedEvent,
	createMigrationStartedEvent,
	createShadowVerifiedEvent,
	IDENTITY_MIGRATION_EVENT_SCHEMA,
	IDENTITY_MIGRATION_EVENTS,
	type IdentityMigrationEvent,
	type IdentityMigrationEventType,
	isIdentityMigrationEventType,
	validateIdentityMigrationEvent,
} from "./migration-events.js";
export {
	advanceMigrationRamp,
	createMigrationCohortFlag,
	MIGRATION_COHORT_FLAG_SCHEMA,
	type MigrationCohortFlag,
	principalInMigrationCohort,
} from "./migration-harness.js";
export {
	decideIdentityMigration,
	IDENTITY_MIGRATION_MATCH_SCHEMA,
	type IdentityMigrationMatchDecision,
	type MatchingMigrationInput,
} from "./migration-matching.js";
export {
	agentActionsForMigrationEvents,
	type AgentRebindAction,
	isMigrationReactiveEvent,
	migrationStatusView,
	type MigrationStatusView,
} from "./migration-observe.js";

// public-contract: the package id consumers assert against.
export const HOBO_IDENTITY_PACKAGE = "@hobo/identity";
