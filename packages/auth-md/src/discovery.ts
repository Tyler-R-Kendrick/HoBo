/**
 * Discovery: OAuth Protected Resource Metadata is machine-authoritative;
 * `/auth.md` is the agent-readable companion document.
 *
 * The precedence rule is enforced structurally, not by convention: every
 * effective value on `AuthMdDiscovery` is computed from the metadata record,
 * and prose disagreements are surfaced as `conflicts` with
 * `authority: "metadata"`. A caller cannot accidentally act on the prose,
 * because the prose never reaches an effective field.
 */
import { createHash } from "node:crypto";

import { authMdError } from "./errors.js";
import type { HttpPort } from "./http.js";
import { requestBounded, requestJson } from "./http.js";
import type { HttpsUrl, Scope } from "./types.js";
import { parseHttpsUrl, parseScopes } from "./types.js";

// public-contract: the well-known path is fixed by OAuth Protected Resource Metadata; callers assert against it.
export const PROTECTED_RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource";
// public-contract: the auth.md companion path is fixed by the auth.md convention.
export const AUTH_MD_PATH = "/auth.md";

// domain-view: parsed derived type; wire form is ProtectedResourceMetadataRecord in data-models/auth_md.proto.
export interface ProtectedResourceMetadata {
	readonly resource: HttpsUrl;
	readonly authorizationServers: readonly HttpsUrl[];
	readonly scopesSupported: readonly Scope[];
	readonly bearerMethodsSupported: readonly string[];
	readonly anonymousRegistrationEndpoint?: HttpsUrl;
	readonly authMdUrl?: HttpsUrl;
}

// domain-view: parsed derived type; wire form is AuthMdDocumentRecord in data-models/auth_md.proto.
export interface AuthMdDocument {
	readonly url: HttpsUrl;
	readonly declaredScopes: readonly Scope[];
	readonly declaresAnonymousRegistration: boolean;
	readonly sha256: string;
}

// domain-view: parsed derived type; wire form is MetadataProseConflictRecord in data-models/auth_md.proto.
export interface MetadataProseConflict {
	readonly field: "scopesSupported" | "anonymousRegistration";
	readonly metadataValue: string;
	readonly documentValue: string;
	readonly authority: "metadata";
}

export interface AuthMdDiscovery {
	readonly metadata: ProtectedResourceMetadata;
	readonly document?: AuthMdDocument;
	readonly conflicts: readonly MetadataProseConflict[];
	/** Always metadata-derived. */
	readonly effectiveScopes: readonly Scope[];
	/** Always metadata-derived. */
	readonly anonymousRegistrationSupported: boolean;
	readonly anonymousRegistrationEndpoint?: HttpsUrl;
}

export interface DiscoveryOptions {
	readonly port: HttpPort;
	/** The protected resource origin or URL, e.g. `https://api.example.com`. */
	readonly resource: string;
	/** Fetch the prose companion too (default true). */
	readonly includeDocument?: boolean;
}

export function protectedResourceMetadataUrl(resource: string): HttpsUrl {
	const base = new URL(parseHttpsUrl(resource, "resource"));
	return parseHttpsUrl(
		new URL(PROTECTED_RESOURCE_METADATA_PATH, base.origin).toString(),
		"metadataUrl",
	);
}

export function authMdDocumentUrl(resource: string): HttpsUrl {
	const base = new URL(parseHttpsUrl(resource, "resource"));
	return parseHttpsUrl(
		new URL(AUTH_MD_PATH, base.origin).toString(),
		"authMdUrl",
	);
}

export function parseProtectedResourceMetadata(
	raw: unknown,
): ProtectedResourceMetadata {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw authMdError(
			"AUTHMD_METADATA_INVALID",
			"protected resource metadata must be a JSON object",
		);
	}
	const record = raw as Record<string, unknown>;
	const resource = parseHttpsUrl(record.resource, "resource");
	const authorizationServersRaw = record.authorization_servers;
	if (
		authorizationServersRaw !== undefined &&
		!Array.isArray(authorizationServersRaw)
	) {
		throw authMdError(
			"AUTHMD_METADATA_INVALID",
			"authorization_servers must be an array",
			{ field: "authorization_servers" },
		);
	}
	const authorizationServers = Object.freeze(
		(authorizationServersRaw ?? []).map((entry: unknown) =>
			parseHttpsUrl(entry, "authorization_servers[]"),
		),
	);
	if (authorizationServers.length === 0) {
		throw authMdError(
			"AUTHMD_METADATA_INVALID",
			"protected resource metadata must list at least one authorization server",
			{ field: "authorization_servers" },
		);
	}

	const bearerMethodsRaw = record.bearer_methods_supported;
	if (bearerMethodsRaw !== undefined && !Array.isArray(bearerMethodsRaw)) {
		throw authMdError(
			"AUTHMD_METADATA_INVALID",
			"bearer_methods_supported must be an array",
			{ field: "bearer_methods_supported" },
		);
	}
	const bearerMethods = Object.freeze(
		(bearerMethodsRaw ?? []).map((entry: unknown, index: number) => {
			if (typeof entry !== "string" || entry.length === 0) {
				throw authMdError(
					"AUTHMD_METADATA_INVALID",
					`bearer_methods_supported[${index}] must be a non-empty string`,
					{ field: "bearer_methods_supported" },
				);
			}
			return entry;
		}),
	);

	return Object.freeze({
		resource,
		authorizationServers,
		scopesSupported: parseScopes(record.scopes_supported, "scopes_supported"),
		bearerMethodsSupported: bearerMethods,
		...(record.anonymous_registration_endpoint === undefined
			? {}
			: {
					anonymousRegistrationEndpoint: parseHttpsUrl(
						record.anonymous_registration_endpoint,
						"anonymous_registration_endpoint",
					),
				}),
		...(record.auth_md_url === undefined
			? {}
			: { authMdUrl: parseHttpsUrl(record.auth_md_url, "auth_md_url") }),
	});
}

const SCOPE_BULLET_PATTERN = /^[-*]\s+`([^`]+)`/u;
const ANONYMOUS_SUPPORTED_PATTERN = /anonymous\s+(?:agent\s+)?registration/iu;
const ANONYMOUS_DENIED_PATTERN =
	/anonymous\s+(?:agent\s+)?registration\s+(?:is\s+)?(?:not\s+supported|unsupported|disabled)/iu;

/**
 * Parse the prose companion. Deliberately shallow: this document is advisory,
 * so a richer parser would only create more ways for prose to look
 * authoritative. Scopes are read from `- \`scope\`` bullets.
 */
export function parseAuthMdDocument(
	text: string,
	url: HttpsUrl,
): AuthMdDocument {
	const declared: string[] = [];
	for (const line of text.split(/\r?\n/u)) {
		const match = line.trim().match(SCOPE_BULLET_PATTERN);
		if (match?.[1] !== undefined) declared.push(match[1]);
	}
	return Object.freeze({
		url,
		declaredScopes: parseScopes(declared, "authMdScopes"),
		declaresAnonymousRegistration:
			ANONYMOUS_SUPPORTED_PATTERN.test(text) &&
			!ANONYMOUS_DENIED_PATTERN.test(text),
		sha256: createHash("sha256").update(text, "utf8").digest("hex"),
	});
}

/**
 * Compose metadata (authoritative) with the document (advisory) and record
 * every disagreement. The returned effective fields are metadata-only.
 */
export function reconcileDiscovery(
	metadata: ProtectedResourceMetadata,
	document?: AuthMdDocument,
): AuthMdDiscovery {
	const conflicts: MetadataProseConflict[] = [];
	if (document !== undefined) {
		const metadataScopes = [...metadata.scopesSupported].sort();
		const documentScopes = [...document.declaredScopes].sort();
		if (metadataScopes.join(" ") !== documentScopes.join(" ")) {
			conflicts.push({
				field: "scopesSupported",
				metadataValue: metadataScopes.join(" "),
				documentValue: documentScopes.join(" "),
				authority: "metadata",
			});
		}
		const metadataSupportsRegistration =
			metadata.anonymousRegistrationEndpoint !== undefined;
		if (
			document.declaresAnonymousRegistration !== metadataSupportsRegistration
		) {
			conflicts.push({
				field: "anonymousRegistration",
				metadataValue: String(metadataSupportsRegistration),
				documentValue: String(document.declaresAnonymousRegistration),
				authority: "metadata",
			});
		}
	}

	return Object.freeze({
		metadata,
		...(document === undefined ? {} : { document }),
		conflicts: Object.freeze(conflicts),
		effectiveScopes: metadata.scopesSupported,
		anonymousRegistrationSupported:
			metadata.anonymousRegistrationEndpoint !== undefined,
		...(metadata.anonymousRegistrationEndpoint === undefined
			? {}
			: {
					anonymousRegistrationEndpoint: metadata.anonymousRegistrationEndpoint,
				}),
	});
}

export async function discoverAuthMd(
	options: DiscoveryOptions,
): Promise<AuthMdDiscovery> {
	const metadata = parseProtectedResourceMetadata(
		await requestJson(
			options.port,
			protectedResourceMetadataUrl(options.resource),
		),
	);

	if (options.includeDocument === false) {
		return reconcileDiscovery(metadata);
	}

	const documentUrl = metadata.authMdUrl ?? authMdDocumentUrl(options.resource);
	try {
		const response = await requestBounded(options.port, documentUrl, {
			accept: "text/markdown, text/plain",
		});
		return reconcileDiscovery(
			metadata,
			parseAuthMdDocument(response.body, response.url),
		);
	} catch {
		// The companion document is optional and advisory: a missing or broken
		// /auth.md must not defeat discovery that already has authoritative
		// metadata.
		return reconcileDiscovery(metadata);
	}
}
