/**
 * Privileged Access Gateway (PAM) — optional Station capability / Rail profile.
 * Pluggable JumpServer / Teleport / Boundary / custom. No embedded binaries.
 * Subject to environment isolation policy; never above PolicyEngine.
 *
 * HONEST SCOPE: adapters are stubs. Wire real Teleport/Boundary clients in
 * production without importing GPLv3 JumpServer into core packages.
 */

// public-contract: privileged access gateway capability schema.
export const PAM_GATEWAY_SCHEMA = "hobo.privileged-access-gateway/v1" as const;

export type PamKind = "jumpserver" | "teleport" | "boundary" | "custom";

/** Mirrors connectivity IsolationClass without a package dependency edge. */
export type PamIsolationClass =
	| "local-dev"
	| "preview"
	| "development"
	| "staging"
	| "production"
	| "ephemeral";

export type StationContext = Readonly<{
	stationId: string;
	tenant: string;
	/** Station is tagged to exactly one isolation class. */
	isolationClass: PamIsolationClass;
	railId?: string;
	trustDomain: string;
}>;

export type SessionRequest = Readonly<{
	subject: string;
	target: string;
	/** Prefer short-lived brokered token / cert over static password. */
	preferSecretless: true;
	/** Elevated capability token when required for production. */
	elevatedToken?: string;
	ttlSeconds?: number;
	reason?: string;
}>;

export type SessionHandle = Readonly<{
	sessionId: string;
	expiresAt: string;
	/** Opaque credential ref — never raw password in return value. */
	credentialRef: string;
	auditStreamId: string;
	isolationClass: PamIsolationClass;
}>;

export type PamAuditEvent = Readonly<{
	type: "pam.SessionStarted" | "pam.SessionEnded" | "pam.SessionDenied";
	time: string;
	stationId: string;
	sessionId?: string;
	subject: string;
	target?: string;
	isolationClass: PamIsolationClass;
	reason?: string;
}>;

export type AuditSink = {
	readonly append: (event: PamAuditEvent) => void | Promise<void>;
};

/**
 * Optional Station capability. Must federate with HoBo Identity (OIDC/SVID).
 * Prefer secretless short-lived brokered tokens (ADR-0027).
 */
export interface PrivilegedAccessGateway {
	readonly kind: PamKind;
	readonly schemaVersion: typeof PAM_GATEWAY_SCHEMA;
	readonly isolationClass: PamIsolationClass;
	start(ctx: StationContext): Promise<void>;
	stop(): Promise<void>;
	brokerSession(req: SessionRequest): Promise<SessionHandle>;
	readonly auditSink: AuditSink;
	readonly running: boolean;
}

export type CreatePamGatewayOptions = Readonly<{
	kind: PamKind;
	isolationClass: PamIsolationClass;
	auditSink?: AuditSink;
	/** Inject clock for tests. */
	now?: () => string;
}>;

function memoryAuditSink(): AuditSink & { events: PamAuditEvent[] } {
	const events: PamAuditEvent[] = [];
	return {
		events,
		append(event) {
			events.push(Object.freeze({ ...event }));
		},
	};
}

/**
 * Teleport-oriented stub (preferred cloud-native / cert-based path).
 * HONEST SCOPE: does not call Teleport API; records audit events only.
 */
export function createTeleportPamGatewayStub(
	options: Omit<CreatePamGatewayOptions, "kind">,
): PrivilegedAccessGateway & { readonly auditEvents: readonly PamAuditEvent[] } {
	return createPamGatewayStub({ ...options, kind: "teleport" });
}

/**
 * JumpServer adapter stub.
 * HONEST SCOPE: JumpServer is GPLv3 — do not embed source or make it a
 * transitive dependency of core packages. Operators run JumpServer out-of-band
 * and point this stub's production adapter at its API.
 */
export function createJumpServerPamGatewayStub(
	options: Omit<CreatePamGatewayOptions, "kind">,
): PrivilegedAccessGateway & { readonly auditEvents: readonly PamAuditEvent[] } {
	return createPamGatewayStub({ ...options, kind: "jumpserver" });
}

/** Boundary adapter stub (HashiCorp-style). */
export function createBoundaryPamGatewayStub(
	options: Omit<CreatePamGatewayOptions, "kind">,
): PrivilegedAccessGateway & { readonly auditEvents: readonly PamAuditEvent[] } {
	return createPamGatewayStub({ ...options, kind: "boundary" });
}

export function createPamGatewayStub(
	options: CreatePamGatewayOptions,
): PrivilegedAccessGateway & { readonly auditEvents: readonly PamAuditEvent[] } {
	const sink = options.auditSink ?? memoryAuditSink();
	const events =
		"events" in sink
			? (sink as ReturnType<typeof memoryAuditSink>).events
			: [];
	const now = options.now ?? (() => new Date().toISOString());
	let running = false;
	let ctx: StationContext | null = null;
	let n = 0;

	return {
		kind: options.kind,
		schemaVersion: PAM_GATEWAY_SCHEMA,
		isolationClass: options.isolationClass,
		get running() {
			return running;
		},
		get auditEvents() {
			return events;
		},
		auditSink: sink,
		async start(stationCtx) {
			if (stationCtx.isolationClass !== options.isolationClass) {
				throw Object.assign(
					new Error(
						`PAM gateway isolation class ${options.isolationClass} must match Station ${stationCtx.isolationClass}`,
					),
					{ code: "pam-env-mismatch" },
				);
			}
			ctx = stationCtx;
			running = true;
		},
		async stop() {
			running = false;
			ctx = null;
		},
		async brokerSession(req) {
			if (!running || !ctx) {
				throw Object.assign(new Error("PAM gateway not started"), {
					code: "pam-not-running",
				});
			}
			// Production requires elevated capability (network membership insufficient).
			if (
				options.isolationClass === "production" &&
				!req.elevatedToken
			) {
				await sink.append({
					type: "pam.SessionDenied",
					time: now(),
					stationId: ctx.stationId,
					subject: req.subject,
					target: req.target,
					isolationClass: options.isolationClass,
					reason: "elevated capability required for production PAM session",
				});
				throw Object.assign(
					new Error(
						"production PAM session requires elevated capability token",
					),
					{ code: "elevated-required" },
				);
			}
			n += 1;
			const sessionId = `pam_${options.kind}_${n}`;
			const ttl = req.ttlSeconds ?? 900;
			const expiresAt = new Date(Date.parse(now()) + ttl * 1000).toISOString();
			const handle: SessionHandle = Object.freeze({
				sessionId,
				expiresAt,
				credentialRef: `tokenref://pam/${options.kind}/${sessionId}`,
				auditStreamId: `audit:pam:${ctx.stationId}:${sessionId}`,
				isolationClass: options.isolationClass,
			});
			// Audit must leave Station promptly (Yard event log / immutable sink).
			await sink.append({
				type: "pam.SessionStarted",
				time: now(),
				stationId: ctx.stationId,
				sessionId,
				subject: req.subject,
				target: req.target,
				isolationClass: options.isolationClass,
				...(req.reason !== undefined ? { reason: req.reason } : {}),
			});
			return handle;
		},
	};
}

/** Rail capability marker for optional PAM enablement. */
// public-contract: PAM Rail capability id.
export const PAM_RAIL_CAPABILITY = "capability:privileged-access-gateway" as const;

export function railEnablesPam(
	policyPacks: readonly string[],
	metadata?: Readonly<Record<string, string>>,
): boolean {
	if (metadata?.privilegedAccessGateway === "true") return true;
	if (policyPacks.includes(PAM_RAIL_CAPABILITY)) return true;
	if (policyPacks.some((p) => p.includes("privileged-access"))) return true;
	return false;
}
