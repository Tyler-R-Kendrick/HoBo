/**
 * Privileged Access Gateway Station attachment surface (ADR-0131 / ADR-0133).
 * Re-exports full implementations from @hobo/connectivity — no stubs.
 */
export {
	createBoundaryPamGateway,
	createJumpServerPamGateway,
	createNativePamGateway,
	createPamAuditSink,
	createPrivilegedAccessGateway,
	createTeleportPamGateway,
	PAM_GATEWAY_SCHEMA,
	PAM_RAIL_CAPABILITY,
	railEnablesPam,
	type AuditSink,
	type CreatePrivilegedAccessGatewayOptions,
	type PamAuditEvent,
	type PamKind,
	type PrivilegedAccessGateway,
	type PrivilegedAccessGatewayHandle,
	type SessionHandle,
	type SessionRequest,
	type SessionTarget,
	type StationContext,
} from "@hobo/connectivity";

/** @deprecated use PamKind from connectivity */
export type PamIsolationClass = import("@hobo/connectivity").IsolationClass;
