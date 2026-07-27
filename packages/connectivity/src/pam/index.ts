export {
	createPamAuditSink,
	type YardAuditAppender,
} from "./audit.js";
export {
	createBoundaryPamGateway,
	createJumpServerPamGateway,
	createNativePamGateway,
	createPrivilegedAccessGateway,
	createTeleportPamGateway,
	type CreatePrivilegedAccessGatewayOptions,
	type PrivilegedAccessGatewayHandle,
	railEnablesPam,
} from "./gateway.js";
export {
	createRemoteTransport,
	mergeRemoteIntoHandle,
	type RemoteSessionResult,
	type RemoteTransport,
} from "./remote-transport.js";
export {
	createSessionBrokerKeys,
	frameSessionProtocol,
	mintSessionToken,
	type SessionBrokerKeys,
	type SessionClaims,
	verifySessionToken,
} from "./session-broker.js";
export {
	applyEnvIsolationAclHints,
	ENV_ISOLATION_TAILSCALE_ACL_SCHEMA,
	type EnvIsolationTailscaleAcl,
	renderEnvIsolationTailscaleAcl,
	type TailscaleAclGrant,
} from "./tailscale-acl.js";
export {
	PAM_GATEWAY_SCHEMA,
	PAM_RAIL_CAPABILITY,
	type AuditSink,
	type PamAuditEvent,
	type PamKind,
	type PamTransportConfig,
	type PrivilegedAccessGateway,
	type SessionHandle,
	type SessionRequest,
	type SessionTarget,
	type StationContext,
} from "./types.js";
