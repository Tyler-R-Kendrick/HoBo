export {
	DEFAULT_CONNECTIVITY_CONFIG,
	parseConnectivityConfig,
	type ConnectivityConfig,
} from "./config.js";
export {
	CONNECTIVITY_HOST_PROVIDER_NAME,
	createConnectivityHostHandler,
	type ConnectivityHostHandler,
	type ConnectivityHostRequest,
	type ConnectivityHostResponse,
} from "./connectivity-host.js";
export {
	accessTokenHash,
	createDpopJtiCache,
	exportDpopPrivateJwk,
	generateDpopKeyPair,
	importDpopKeyPair,
	mintDpopProof,
	verifyDpopProof,
	type DpopJtiCache,
	type DpopKeyPair,
	type JsonWebKeyPublic,
	type MintDpopProofInput,
	type VerifiedDpopProof,
} from "./crypto/dpop.js";
export {
	DEFAULT_SVID_HMAC_SECRET,
	generateSvidIssuerKeys,
	mintJwtSvid,
	resolveSvidHmacSecret,
	spiffeIdForAgent,
	verifyJwtSvid,
	type JwtSvidClaims,
	type MintedJwtSvid,
} from "./crypto/jwt-svid.js";
export {
	createRoute53SigV4Signer,
	hmac,
	sha256Hex,
	signAwsRequest,
	type AwsCredentials,
	type SignAwsRequestInput,
	type SignedAwsRequest,
} from "./dns/aws-sigv4.js";
export {
	createCloudflareDnsProvider,
	type CloudflareDnsProviderOptions,
} from "./dns/cloudflare-provider.js";
export {
	createDnsControlProvider,
	type DnsControlPlan,
} from "./dns/dnscontrol-provider.js";
export {
	createJunctionDynamicDnsRegistrar,
	type DynamicDnsRegistrationResult,
	type DynamicDnsTarget,
	type JunctionDynamicDnsRegistrar,
} from "./dns/dynamic-registrar.js";
export { createMemoryDnsProvider } from "./dns/memory-provider.js";
export { createPublicDnsManager } from "./dns/public-dns-manager.js";
export {
	createDnsProviderFromConfig,
	createRoute53DnsProvider,
	parseListResourceRecordSets,
	type Route53DnsProviderOptions,
} from "./dns/route53-provider.js";
export {
	createJunctionAgent,
	type JunctionAgent,
	type JunctionAgentConfig,
	type JunctionAgentRole,
} from "./junction-agent.js";
export {
	attachNamedEndpoints,
	createNamedPreferringBindingResolver,
	getNamedEndpointSession,
	listNamedEndpointSessions,
	resourceId,
	type NamedEndpointEntry,
	type NamedEndpointInput,
	type NamedEndpointsResult,
} from "./local/named-endpoints.js";
export {
	probePortless,
	registerPortlessRoute,
	resolvePortlessMode,
	type PortlessMode,
	type PortlessProbe,
} from "./local/portless.js";
export {
	createBillingAggregator,
	invoiceToUsageEvents,
	type BillingAggregator,
	type BillingPeriodBucket,
	type Invoice,
	type InvoiceLine,
	type PriceBook,
} from "./metering/billing-aggregator.js";
export {
	createFileInvoiceLedger,
	createLedgerBillingProvider,
	createStripeBillingProvider,
	exportInvoiceStripeLines,
	type BillingChargeResult,
	type BillingChargeStatus,
	type BillingProvider,
	type InvoiceLedger,
} from "./metering/billing-provider.js";
export {
	createInMemoryMeteringSink,
	createLogMeteringSink,
} from "./metering/sinks.js";
export {
	createNetbirdApiClient,
	type NetbirdApiClient,
	type NetbirdApiOptions,
	type NetbirdDnsNameserverGroup,
	type NetbirdPeer,
} from "./overlay/netbird-api.js";
export { createNetbirdOverlay } from "./overlay/netbird.js";
export {
	createTailscaleApiClient,
	type TailscaleApiClient,
	type TailscaleApiOptions,
	type TailscaleSplitDnsMap,
} from "./overlay/tailscale-api.js";
export {
	createTailscaleOverlay,
	parseTenantTag,
	type TailscaleRunner,
} from "./overlay/tailscale.js";
export {
	createOpaPolicyEngine,
	defaultRegoLikeEval,
	OPA_POLICY_ENGINE_ID,
	SAMPLE_HOBO_AUTHZ_REGO,
	type OpaPolicyEngineOptions,
} from "./policy/opa-engine.js";
export {
	evaluateRegoLite,
	HOBO_DEFAULT_POLICY_DOCUMENT,
	parseRegoLiteDocument,
	type RegoLiteDocument,
	type RegoLiteRule,
	type RegoLiteWhen,
} from "./policy/rego-lite.js";
export {
	createTagAclPolicyEngine,
	TAG_ACL_POLICY_ENGINE_ID,
} from "./policy/tag-acl-engine.js";
export {
	createTenantIsolationRegistry,
	tenantFromSlug,
	type TenantControlPlanePartition,
	type TenantIsolationRegistry,
	type TenantIsolationRegistryOptions,
	type TenantOverlayPlane,
} from "./tenancy/isolation.js";

// Re-export pure naming / tenancy from core so consumers can depend on one package.
export {
	DEFAULT_LOCAL_TLD,
	DEFAULT_OMITTED_ENV,
	DEFAULT_OVERLAY_TLD,
	getNamedEndpoint,
	getNamedEndpointHost,
	HOBO_ZONE_LABEL,
	isHoboHierarchicalName,
	sanitizeDnsLabel,
	createMeteringBus,
	createUsageEvent,
	LOCAL_DEFAULT_TENANT_ID,
	parseTenantId,
	tenantContextFromEnv,
	type TenantIsolationMode,
} from "@hobo/core";
