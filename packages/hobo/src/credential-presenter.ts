/**
 * Dual-principal credential presentation for remote broker calls.
 *
 * - Human principal: from `hobo login` / profile OIDC session
 * - Agent/workload principal: SPIFFE-style SVID (attestation or local fixture)
 * - Anonymous ephemeral: temporary principal + claim token material
 *
 * HONEST SCOPE: real SPIRE attestation and full DPoP proof generation/validation
 * are interface-complete with local fixtures; production crypto plugs into the
 * same presenter without changing call sites.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import type { PrincipalRef } from "@hobo/core";

import type { HoboProfile } from "./hobo-profile.js";
import { loadHoboProfile } from "./hobo-profile.js";

export type CredentialScheme =
	| "local-fixture-svid"
	| "spiffe-jwt-svid"
	| "dpop-bound"
	| "anonymous-ephemeral"
	| "bearer-session";

export interface PresentedCredential {
	readonly scheme: CredentialScheme;
	readonly principal: PrincipalRef;
	/** Human principal when an agent acts on behalf of a user (never collapsed). */
	readonly humanPrincipal?: PrincipalRef;
	readonly tenant: string;
	/** Audience-bound token (never log full value in production). */
	readonly accessToken: string;
	readonly audience: string;
	readonly expiresAt: string;
	/**
	 * HONEST SCOPE: DPoP proof JWT when scheme is dpop-bound.
	 * Local fixtures mint a deterministic mock proof header value.
	 */
	readonly dpopProof?: string;
	readonly proofKeyId?: string;
	readonly metadata?: Readonly<Record<string, string>>;
}

export interface CredentialPresenter {
	/**
	 * Resolve the principal for an authenticated remote call.
	 * Prefers agent SVID when HOBO_AGENT_SVID / agent fixture is present,
	 * else human profile session, else local fixture (dev).
	 */
	presentAuthenticated(input: {
		readonly audience: string;
		readonly hoboHome: string;
		readonly env?: NodeJS.ProcessEnv;
		readonly requirePrincipal?: boolean;
	}): Promise<PresentedCredential | null>;

	/** Mint / wrap an anonymous ephemeral credential from a broker session. */
	presentAnonymous(input: {
		readonly audience: string;
		readonly ephemeralPrincipal: PrincipalRef;
		readonly accessToken: string;
		readonly expiresAt: string;
		readonly tenant?: string;
	}): PresentedCredential;
}

export function createCredentialPresenter(options?: {
	/** Force agent principal in tests. */
	readonly agentPrincipal?: PrincipalRef;
	readonly humanPrincipal?: PrincipalRef;
}): CredentialPresenter {
	return {
		async presentAuthenticated(input) {
			const env = input.env ?? process.env;
			const profile = loadHoboProfile(input.hoboHome);

			const agent = resolveAgentPrincipal(env, options?.agentPrincipal);
			const human =
				options?.humanPrincipal ??
				profile?.session?.principal ??
				null;

			if (agent) {
				const token = mintAudienceBoundToken({
					subject: agent.id,
					audience: input.audience,
					kind: "agent",
					seed: env.HOBO_AGENT_SVID ?? agent.id,
				});
				// HONEST SCOPE: real DPoP uses private key material; fixture binds a key id.
				const proofKeyId = `dpop:${createHash("sha256").update(agent.id).digest("hex").slice(0, 12)}`;
				const dpopProof = mintMockDpopProof({
					htm: "POST",
					htu: input.audience,
					ath: token,
					keyId: proofKeyId,
				});
				return {
					scheme: "dpop-bound",
					principal: agent,
					...(human !== null ? { humanPrincipal: human } : {}),
					tenant:
						env.HOBO_TENANT ??
						profile?.session?.tenant ??
						"hobo-dev",
					accessToken: token,
					audience: input.audience,
					expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
					dpopProof,
					proofKeyId,
					metadata: {
						// HONEST SCOPE: spiffe id form for fixtures
						spiffeId: `spiffe://hobo.local/agent/${encodeURIComponent(agent.id)}`,
					},
				};
			}

			if (profile?.session) {
				const session = profile.session;
				return {
					scheme:
						session.proofKeyId !== undefined
							? "dpop-bound"
							: "bearer-session",
					principal: session.principal,
					tenant: session.tenant,
					accessToken: session.token,
					audience: input.audience,
					expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
					...(session.proofKeyId !== undefined
						? {
								proofKeyId: session.proofKeyId,
								dpopProof: mintMockDpopProof({
									htm: "POST",
									htu: input.audience,
									ath: session.token,
									keyId: session.proofKeyId,
								}),
							}
						: {}),
				};
			}

			if (input.requirePrincipal === true) {
				return null;
			}

			// Local/dev fixture path — offline capable.
			const principal: PrincipalRef = {
				kind: "user",
				id: "user:local-fixture",
			};
			const token = mintAudienceBoundToken({
				subject: principal.id,
				audience: input.audience,
				kind: "user",
				seed: "local-fixture",
			});
			return {
				scheme: "local-fixture-svid",
				principal,
				tenant: env.HOBO_TENANT ?? "hobo-dev",
				accessToken: token,
				audience: input.audience,
				expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
				metadata: { fixture: "true" },
			};
		},

		presentAnonymous(input) {
			return {
				scheme: "anonymous-ephemeral",
				principal: input.ephemeralPrincipal,
				tenant: input.tenant ?? "anonymous",
				accessToken: input.accessToken,
				audience: input.audience,
				expiresAt: input.expiresAt,
			};
		},
	};
}

function resolveAgentPrincipal(
	env: NodeJS.ProcessEnv,
	forced?: PrincipalRef,
): PrincipalRef | null {
	if (forced) return forced;
	const svid = env.HOBO_AGENT_SVID ?? env.SPIFFE_ENDPOINT_SOCKET;
	if (!svid || svid.length === 0) return null;
	// HONEST SCOPE: real SPIRE workload API would fetch JWT-SVID; fixture uses env id.
	const id =
		env.HOBO_AGENT_ID ??
		(svid.startsWith("spiffe://")
			? svid
			: `agent:${createHash("sha256").update(svid).digest("hex").slice(0, 12)}`);
	return { kind: "agent", id };
}

function mintAudienceBoundToken(input: {
	readonly subject: string;
	readonly audience: string;
	readonly kind: string;
	readonly seed: string;
}): string {
	const header = Buffer.from(
		JSON.stringify({ alg: "HS256", typ: "JWT" }),
	).toString("base64url");
	const now = Math.floor(Date.now() / 1000);
	const payload = Buffer.from(
		JSON.stringify({
			sub: input.subject,
			aud: input.audience,
			iat: now,
			exp: now + 900,
			kind: input.kind,
		}),
	).toString("base64url");
	const sig = createHmac("sha256", input.seed)
		.update(`${header}.${payload}`)
		.digest("base64url");
	return `${header}.${payload}.${sig}`;
}

/**
 * HONEST SCOPE: mock DPoP proof — shape only (RFC 9449-like header claims).
 * Production must sign with an asymmetric key and validate `ath`/`htu`/`htm`.
 */
export function mintMockDpopProof(input: {
	readonly htm: string;
	readonly htu: string;
	readonly ath: string;
	readonly keyId: string;
}): string {
	const header = Buffer.from(
		JSON.stringify({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: { kty: "EC", kid: input.keyId, crv: "P-256", x: "mock", y: "mock" },
		}),
	).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			htm: input.htm,
			htu: input.htu,
			iat: Math.floor(Date.now() / 1000),
			jti: randomBytes(8).toString("hex"),
			ath: createHash("sha256").update(input.ath).digest("base64url"),
		}),
	).toString("base64url");
	const sig = createHmac("sha256", input.keyId)
		.update(`${header}.${payload}`)
		.digest("base64url");
	return `${header}.${payload}.${sig}`;
}

export function authorizationHeaders(
	credential: PresentedCredential,
): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${credential.accessToken}`,
		"x-hobo-principal-kind": credential.principal.kind,
		"x-hobo-principal-id": credential.principal.id,
		"x-hobo-tenant": credential.tenant,
		"x-hobo-credential-scheme": credential.scheme,
	};
	if (credential.humanPrincipal) {
		headers["x-hobo-human-principal-id"] = credential.humanPrincipal.id;
		headers["x-hobo-human-principal-kind"] = credential.humanPrincipal.kind;
	}
	if (credential.dpopProof) {
		headers.dpop = credential.dpopProof;
	}
	return headers;
}

/** Test helper: profile has a usable authenticated session. */
export function profileHasSession(
	profile: HoboProfile | null,
): profile is HoboProfile & { session: NonNullable<HoboProfile["session"]> } {
	return profile?.session !== undefined;
}
