/**
 * Direct Hetzner Cloud API resource resolvers — the default deployment path.
 *
 * Why this module exists: a provider package that publishes an allocatable Yard
 * catalog and ships no `ResourceResolver` fails closed on every deploy. These
 * resolvers close that gap the way the Cloudflare, GCP and AWS ones do: a
 * `ResourceResolver` per product, talking to `api.hetzner.cloud/v1` over an
 * injected, guarded transport, with no IaC engine and no state file in the
 * middle.
 *
 * The property that makes that safe is **convergence**. Hetzner's collections
 * are keyed by a server-assigned numeric id, but — unlike most provider APIs —
 * every collection here accepts an exact `?name=` filter, so "does my resource
 * already exist" is one bounded call rather than a paged scan. Every
 * `reconcile()` asks that question *before* it creates anything, then applies
 * only the mutable deltas. Running it twice yields the same `physicalId`,
 * exactly one resource, and exactly one create call, which is what makes a
 * crashed half-apply safe to re-run instead of something an operator
 * reconciles by hand. `delete()` treats "already gone" as success for the same
 * reason. `"replace"` is never emitted: replacing a server or a volume
 * destroys data, so drift on an immutable field (location, image, server type)
 * is reported as a diagnostic and left for a human.
 *
 * Hetzner returns an `Action` alongside most mutations — a long-running job
 * with `status: "running"`. This module does **not** poll it. A create comes
 * back before the server is up, and that lands in `diagnostics` as *accepted,
 * not confirmed*, because a resolver that blocked a deploy on a provider's
 * provisioning clock would be worse than one that reports the truth and lets
 * the caller decide. The action id is published in `outputs` so a caller that
 * does want to wait has something to wait on.
 *
 * A product with no convergent path ships **no resolver** rather than a
 * plausible one — see {@link HETZNER_UNRESOLVED_PRODUCT_IDS}, which names each
 * one and why. Both absences here are the same shape: a different host with a
 * different credential, which `./transport.ts` deliberately does not allowlist.
 *
 * Credentials are locators, never material. A resolver is constructed with an
 * injected `resolveCredential(ref)`; `ResolveRequest.credentialRef` must be a
 * `scheme://…` locator — the grammar core's `parseResolveRequest` enforces —
 * and a value that looks like the API token itself is refused, because a raw
 * token in a request record is a token in the event log. The token reaches
 * exactly one place: the `authorization` header. It is never logged, never put
 * in `outputs`, and Hetzner's error text is redacted before it reaches a
 * message.
 *
 * Determinism: no clock, no randomness, no environment reads.
 *
 * HONEST SCOPE (also in the README):
 *   - These resolvers are exercised against an *injected fake* transport
 *     modelling a Hetzner project. Nothing in this package proves a live
 *     deploy: that additionally needs a real token, real network egress, and a
 *     real Hetzner project, none of which a unit test supplies.
 *   - The endpoint paths, request bodies and response field names below are
 *     written from Hetzner's published API reference. They have not been
 *     replayed against the running service, so a field Hetzner has since
 *     renamed would fail at deploy time, not here.
 *   - Coverage is a slice of each product's API — enough to allocate, observe,
 *     converge and remove — and explicitly not the whole surface.
 *   - The `productId` strings are read off the `./slots.js` factories, so the
 *     registry and the Yard catalog cannot drift apart. Whether a matching
 *     Resource Definition is registered is still checked at resolution time
 *     (`YARD_BINDING_PRODUCT_UNKNOWN`), not here.
 */

import {
	createResolverRegistry,
	type HttpTransport,
	RESOLVER_CONTRACT,
	type ResolveOutcome,
	type ResolveRequest,
	type ResolverAction,
	ResolverError,
	type ResourceResolver,
	type SlotBinding,
	type TransportMethod,
	type TransportResponse,
} from "@hobo/core";

import { type AwsCredentials, signAwsRequest } from "@hobo/core/aws-sigv4";

import { HETZNER_PROVIDER_TARGET } from "./options.js";
import {
	cloudServer,
	loadBalancer,
	objectStorage,
	storageBox,
	volume,
} from "./slots.js";
import {
	guardedHetznerTransport,
	guardedObjectStorageTransport,
	HETZNER_MAX_RESPONSE_BYTES,
	HETZNER_MAX_TIMEOUT_MS,
	hetznerApiUrl,
	objectStorageUrl,
} from "./transport.js";

// ---------------------------------------------------------------------------
// Product ids — read off the slot factories so the registry cannot drift from
// the catalog it is supposed to serve.
// ---------------------------------------------------------------------------

function productIdOf(binding: SlotBinding, factory: string): string {
	const { productId } = binding;
	if (productId === undefined) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`slot factory ${factory}() emitted a binding without a productId, so no resolver can be keyed to it`,
		);
	}
	return productId;
}

export const HETZNER_CLOUD_SERVER_PRODUCT_ID = productIdOf(
	cloudServer(),
	"cloudServer",
);
export const HETZNER_LOAD_BALANCER_PRODUCT_ID = productIdOf(
	loadBalancer(),
	"loadBalancer",
);
export const HETZNER_VOLUME_PRODUCT_ID = productIdOf(volume(), "volume");
export const HETZNER_OBJECT_STORAGE_PRODUCT_ID = productIdOf(
	objectStorage(),
	"objectStorage",
);

/** Every product this module resolves, id-sorted for a deterministic registry. */
export const HETZNER_RESOLVED_PRODUCT_IDS: readonly string[] = Object.freeze(
	[
		HETZNER_CLOUD_SERVER_PRODUCT_ID,
		HETZNER_LOAD_BALANCER_PRODUCT_ID,
		HETZNER_OBJECT_STORAGE_PRODUCT_ID,
		HETZNER_VOLUME_PRODUCT_ID,
	].sort(compareStrings),
);

/**
 * The one product id this package catalogs and deliberately cannot resolve.
 *
 * `hetzner.storage-box/v1`: a Storage Box is not on the Cloud API at all —
 * `GET https://api.hetzner.cloud/v1/storage_boxes` answers 404, where
 * `/v1/volumes` answers 401, so the absence is the endpoint's and not a
 * permissions artifact. Storage Boxes are administered through the Robot API
 * behind HTTP Basic with the account's *web console password*, and a resolver
 * reaching that surface would be sending a console password through an
 * injected transport — a different and much worse thing to hand out than a
 * scoped project token. See `HETZNER_EXCLUDED_SURFACES` in `./transport.ts`.
 */
export const HETZNER_UNRESOLVED_PRODUCT_IDS: readonly string[] = Object.freeze(
	[productIdOf(storageBox(), "storageBox")].sort(compareStrings),
);

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** What a host must supply to build the resolvers. */
export interface HetznerResolverOptions {
	/**
	 * Resolves a credential *locator* to a Hetzner Cloud project API token.
	 * Injected so the resolver never holds a secret and never decides where
	 * secrets live.
	 */
	readonly resolveCredential: (ref: string) => Promise<string>;
	/**
	 * Resolves a credential *locator* to an Object Storage access key pair.
	 * Separate from `resolveCredential` because Object Storage is a separate
	 * credential: the project API token does not authenticate against
	 * `<location>.your-objectstorage.com`, and letting one function serve both
	 * would invite sending the wrong secret to the wrong origin. Required only
	 * to build the Object Storage resolver.
	 */
	readonly resolveObjectStorageCredential?: (
		ref: string,
	) => Promise<ObjectStorageKeyPair>;
	/**
	 * SigV4 signing clock, injected. Reading `Date.now()` inside the resolver
	 * would make a signed request untestable. Required only to build the
	 * Object Storage resolver.
	 */
	readonly nowMs?: number | (() => number);
}

/** An Object Storage access key pair, as the host's custody hands it over. */
export interface ObjectStorageKeyPair {
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
}

/**
 * A credential locator, using the same grammar core's `parseResolveRequest`
 * enforces (`scheme://path`, no userinfo). Restated here rather than imported
 * because a resolver must refuse a bad ref even when a caller skipped the parse
 * boundary — and a second grammar would be a second answer.
 */
const CREDENTIAL_REF_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s@]+$/u;

/**
 * What a Hetzner Cloud API token looks like when someone pastes the value into
 * `credentialRef` by mistake — 64 alphanumeric characters. Refusing this shape
 * is the difference between a locator in the event log and a live token in the
 * event log.
 */
const RAW_CREDENTIAL_PATTERN = /^[A-Za-z0-9]{32,}$/u;

/** Anything long and token-shaped is scrubbed out of provider error text. */
const TOKEN_SHAPED_PATTERN = /[A-Za-z0-9_-]{20,}/gu;

/**
 * Redact provider text before it reaches a message, a diagnostic, or a log.
 * Hetzner echoes request context in `error.message`, and that context has
 * carried resource names and token fragments before.
 */
export function redactHetznerText(text: string, limit = 400): string {
	const scrubbed = text.replace(TOKEN_SHAPED_PATTERN, "[redacted]");
	return scrubbed.length > limit ? `${scrubbed.slice(0, limit)}…` : scrubbed;
}

// ---------------------------------------------------------------------------
// Small shared parsers
// ---------------------------------------------------------------------------

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function optionalString(
	record: Readonly<Record<string, unknown>>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function optionalBoolean(
	record: Readonly<Record<string, unknown>>,
	key: string,
): boolean | undefined {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

function optionalInteger(
	record: Readonly<Record<string, unknown>>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isSafeInteger(value)
		? value
		: undefined;
}

function nestedRecord(
	record: Readonly<Record<string, unknown>>,
	key: string,
): Readonly<Record<string, unknown>> {
	const value = record[key];
	return isPlainObject(value) ? value : {};
}

/** Hetzner ids are numbers on every resource this module touches. */
function identityOf(
	record: Readonly<Record<string, unknown>>,
	label: string,
): string {
	const value = record.id;
	if (typeof value === "number" && Number.isSafeInteger(value)) {
		return String(value);
	}
	if (typeof value === "string" && value.trim().length > 0) return value;
	throw new ResolverError(
		"RESOLVER_OUTPUT_UNPARSEABLE",
		`${label}: Hetzner returned a record without a usable id, so the resource cannot be addressed`,
	);
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

interface HetznerCall {
	readonly method: TransportMethod;
	/** Host-relative, with every dynamic segment already encoded. */
	readonly path: string;
	readonly json?: unknown;
}

/**
 * Send one call, through the guard. The guard is applied here rather than left
 * to the caller: an unguarded transport slipping through would be a
 * legal-TypeScript security defect, and the token is in the header of every one
 * of these requests.
 */
async function send(
	context: HetznerResolverContext,
	call: HetznerCall,
): Promise<TransportResponse> {
	const body = call.json === undefined ? undefined : JSON.stringify(call.json);
	const guarded = guardedHetznerTransport(context.transport);
	return guarded({
		method: call.method,
		url: hetznerApiUrl(call.path),
		headers: {
			accept: "application/json",
			authorization: `Bearer ${context.token}`,
			...(body !== undefined ? { "content-type": "application/json" } : {}),
		},
		...(body !== undefined ? { body } : {}),
		timeoutMs: HETZNER_MAX_TIMEOUT_MS,
		maxResponseBytes: HETZNER_MAX_RESPONSE_BYTES,
	});
}

function isNotFound(response: TransportResponse): boolean {
	return response.status === 404;
}

/**
 * Parse a JSON body. An empty body on a success status is `{}` — Hetzner
 * answers some deletes with `204 No Content` — and anything else that is not a
 * JSON object is `RESOLVER_OUTPUT_UNPARSEABLE`, because a body this code cannot
 * read leaves the outcome of the call unknown, and an unknown outcome is
 * refused rather than assumed.
 */
function parseJsonRecord(
	response: TransportResponse,
	label: string,
): Record<string, unknown> {
	if (response.body.trim().length === 0) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(response.body) as unknown;
	} catch {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`${label}: Hetzner returned a status ${response.status} body that is not JSON, so the outcome of the call is unknown and it is refused rather than assumed`,
		);
	}
	if (!isPlainObject(parsed)) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`${label}: Hetzner returned JSON that is not an object (status ${response.status}), so the resource it describes cannot be identified`,
		);
	}
	return parsed;
}

/**
 * The refusal path. Hetzner's error envelope is
 * `{"error":{"code":"invalid_input","message":"…"}}`; the message is redacted
 * before it is quoted, because provider text is the most common way a token
 * fragment or a caller's private path reaches a log.
 */
function providerRejection(
	response: TransportResponse,
	label: string,
): ResolverError {
	let detail = "no error detail was returned";
	try {
		const record = parseJsonRecord(response, label);
		const error = nestedRecord(record, "error");
		const code = optionalString(error, "code");
		const message = optionalString(error, "message");
		const parts = [code, message].filter(
			(part): part is string => part !== undefined,
		);
		if (parts.length > 0) detail = redactHetznerText(parts.join(": "));
	} catch {
		const snippet = response.body.trim();
		if (snippet.length > 0) detail = redactHetznerText(snippet, 160);
	}
	return new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`${label}: Hetzner refused the call with status ${response.status}: ${detail}`,
	);
}

/** A successful response as a record; any 4xx/5xx is a typed refusal. */
function expectOk(
	response: TransportResponse,
	label: string,
): Record<string, unknown> {
	if (response.status >= 400) throw providerRejection(response, label);
	return parseJsonRecord(response, label);
}

// ---------------------------------------------------------------------------
// Resolver plumbing
// ---------------------------------------------------------------------------

/** Everything a resolver body needs, with the credential already resolved. */
interface HetznerResolverContext {
	readonly request: ResolveRequest;
	readonly transport: HttpTransport;
	readonly token: string;
	/** The deterministic resource name: `desired.name`, else the logical id. */
	readonly name: string;
	readonly desired: Readonly<Record<string, unknown>>;
	/** True when the caller already knows the physical id (adopt vs noop). */
	readonly knownPhysicalId: string | undefined;
	/** Present only on the Object Storage path; undefined elsewhere. */
	readonly objectStorageKeys: ObjectStorageKeyPair | undefined;
	/** Injected SigV4 clock. Only the Object Storage path signs. */
	readonly nowMs: () => number;
}

function outcome(
	action: ResolverAction,
	physicalId: string,
	outputs: Readonly<Record<string, unknown>>,
	diagnostics: readonly string[],
): ResolveOutcome {
	return Object.freeze({
		contract: RESOLVER_CONTRACT,
		action,
		physicalId,
		outputs: Object.freeze({ ...outputs }),
		diagnostics: Object.freeze([...diagnostics]),
	});
}

/**
 * Existing resource, no delta: `noop` when the caller already named it, `adopt`
 * when the resolver found something the request did not know about. The
 * distinction is the audit record — adopting an unmanaged resource is a fact an
 * operator should see, not something folded into "nothing happened".
 */
function settledAction(context: HetznerResolverContext): ResolverAction {
	return context.knownPhysicalId === undefined ? "adopt" : "noop";
}

/**
 * The credential parse boundary. A blank ref is `RESOLVER_CREDENTIAL_MISSING`
 * (with remediation), a token-shaped one is `RESOLVER_CREDENTIAL_NOT_A_REF` — a
 * raw secret in a request record has already leaked by the time it is used —
 * and a host that hands back nothing is missing, never "carry on
 * unauthenticated", which would surface at Hetzner as a confusing 401.
 */
async function resolveToken(
	request: ResolveRequest,
	resolve: (ref: string) => Promise<string>,
): Promise<string> {
	const ref = request.credentialRef;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			'hetzner resolver: credentialRef is empty. Supply a locator such as "env://HCLOUD_TOKEN" or "secret://camp/hetzner-project-token" and register it with the host credential resolver; the resolver never accepts inline credential material',
		);
	}
	const trimmed = ref.trim();
	if (RAW_CREDENTIAL_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			"hetzner resolver: credentialRef looks like credential material rather than a locator. Store the project API token with the host secret custody and pass its reference (scheme://path); a raw token in a ResolveRequest is a token in the event log",
		);
	}
	if (!CREDENTIAL_REF_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			`hetzner resolver: credentialRef ${JSON.stringify(redactHetznerText(trimmed, 60))} is not a locator. Expected "<scheme>://<path>", for example "env://HCLOUD_TOKEN"`,
		);
	}
	let material: string;
	try {
		material = await resolve(trimmed);
	} catch (cause) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`hetzner resolver: the host could not resolve credentialRef ${JSON.stringify(trimmed)}: ${redactHetznerText(
				cause instanceof Error ? cause.message : String(cause),
				160,
			)}. Register the reference with the credential resolver before deploying`,
		);
	}
	if (typeof material !== "string" || material.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`hetzner resolver: credentialRef ${JSON.stringify(trimmed)} resolved to nothing. A missing credential is refused rather than retried unauthenticated, which would look like a permissions error at Hetzner`,
		);
	}
	return material.trim();
}

/**
 * The Object Storage credential parse boundary. Same discipline as
 * `resolveToken`: the ref must be a locator, the host resolves it, and a pair
 * with an empty half is refused rather than sent as a half-signed request.
 */
async function resolveObjectStorageKeys(
	request: ResolveRequest,
	resolve: ((ref: string) => Promise<ObjectStorageKeyPair>) | undefined,
): Promise<ObjectStorageKeyPair> {
	if (typeof resolve !== "function") {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			"hetzner object storage resolver: no resolveObjectStorageCredential was injected",
		);
	}
	const ref = request.credentialRef;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			'hetzner object storage resolver: credentialRef is empty. Supply a locator such as "secret://camp/hetzner-object-storage-keys"; the resolver never accepts inline credential material',
		);
	}
	const trimmed = ref.trim();
	if (RAW_CREDENTIAL_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			"hetzner object storage resolver: credentialRef looks like credential material rather than a locator. Store the key pair with the host secret custody and pass its reference (scheme://path)",
		);
	}
	if (!CREDENTIAL_REF_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			`hetzner object storage resolver: credentialRef ${JSON.stringify(redactHetznerText(trimmed, 60))} is not a locator. Expected "<scheme>://<path>"`,
		);
	}
	let keys: ObjectStorageKeyPair;
	try {
		keys = await resolve(trimmed);
	} catch (cause) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`hetzner object storage resolver: the host could not resolve credentialRef ${JSON.stringify(trimmed)}: ${redactHetznerText(
				cause instanceof Error ? cause.message : String(cause),
				160,
			)}`,
		);
	}
	if (
		typeof keys?.accessKeyId !== "string" ||
		keys.accessKeyId.trim().length === 0 ||
		typeof keys.secretAccessKey !== "string" ||
		keys.secretAccessKey.trim().length === 0
	) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`hetzner object storage resolver: credentialRef ${JSON.stringify(trimmed)} resolved to an incomplete key pair. A half-populated pair would produce a signature that fails at Hetzner with a message about the wrong thing`,
		);
	}
	return {
		accessKeyId: keys.accessKeyId,
		secretAccessKey: keys.secretAccessKey,
	};
}

function resourceName(request: ResolveRequest, productId: string): string {
	const desiredName = optionalString(request.desired, "name");
	if (desiredName !== undefined) return desiredName;
	const logicalId = request.ref.logicalId;
	if (typeof logicalId === "string" && logicalId.trim().length > 0) {
		return logicalId;
	}
	throw new ResolverError(
		"RESOLVER_PRODUCT_UNSUPPORTED",
		`${productId}: the request names no resource — set desired.name or ref.logicalId. The name is what makes reconcile convergent, so it is never generated here`,
	);
}

/** The physical id the caller already knows, if it supplied a usable one. */
function knownPhysicalId(request: ResolveRequest): string | undefined {
	const value = request.ref.physicalId;
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

/**
 * The location a placed product needs. Never defaulted: a resource silently
 * created in `fsn1` because nobody said otherwise is a residency incident, not
 * a convenience — and on Hetzner it is a *jurisdiction* decision, since `fsn1`
 * and `ash` are on different continents under different law.
 */
function requiredLocation(
	context: HetznerResolverContext,
	productId: string,
): string {
	const location =
		optionalString(context.desired, "location") ??
		optionalString(context.desired, "region");
	if (location === undefined) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${productId}: the request names no location — set desired.location (or desired.region), for example "fsn1". A location is never chosen here, because Hetzner's locations span jurisdictions and placing a resource in an unrequested one is a residency decision this resolver may not take`,
		);
	}
	return location;
}

function requiredString(
	context: HetznerResolverContext,
	key: string,
	productId: string,
	example: string,
): string {
	const value = optionalString(context.desired, key);
	if (value === undefined) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${productId}: the request names no ${key} — set desired.${key}, for example ${JSON.stringify(example)}. This resolver invents no server type or image, because a resource billed at a size nobody asked for is a cost incident`,
		);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Collections: an exact name filter, not a paged scan
// ---------------------------------------------------------------------------

/** How one collection is shaped: its path, its list key, and its item key. */
interface Collection {
	/** `/v1/servers`, `/v1/volumes`, … */
	readonly path: string;
	/** The array key in a list response: `servers`, `volumes`, … */
	readonly listKey: string;
	/** The object key in a single-item response: `server`, `volume`, … */
	readonly itemKey: string;
}

const SERVERS: Collection = Object.freeze({
	path: "/v1/servers",
	listKey: "servers",
	itemKey: "server",
});

const LOAD_BALANCERS: Collection = Object.freeze({
	path: "/v1/load_balancers",
	listKey: "load_balancers",
	itemKey: "load_balancer",
});

const VOLUMES: Collection = Object.freeze({
	path: "/v1/volumes",
	listKey: "volumes",
	itemKey: "volume",
});

/**
 * Find the single record carrying this name.
 *
 * Hetzner's collections take an exact `?name=` filter, so this is one bounded
 * call — no paging budget, and no chance of concluding "absent" from an
 * exhausted page count. Two records under one name is still refused rather than
 * resolved: Hetzner does enforce name uniqueness per project today, so a second
 * match means either the filter did not do what this code believes or something
 * outside the project answered, and both are reasons to stop rather than to
 * pick one.
 */
async function findByName(
	context: HetznerResolverContext,
	collection: Collection,
): Promise<Record<string, unknown> | undefined> {
	const label = `hetzner list ${collection.listKey} named ${context.name}`;
	const record = expectOk(
		await send(context, {
			method: "GET",
			path: `${collection.path}?name=${encodeURIComponent(context.name)}`,
		}),
		label,
	);
	const items = record[collection.listKey];
	if (!Array.isArray(items)) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`${label}: Hetzner returned a body without a ${JSON.stringify(collection.listKey)} array, so the collection cannot be searched and a create would risk duplicating an existing resource`,
		);
	}
	const matches = items
		.filter(isPlainObject)
		.filter((item) => optionalString(item, "name") === context.name);
	if (matches.length > 1) {
		throw new ResolverError(
			"RESOLVER_PROVIDER_REJECTED",
			`hetzner ${collection.listKey}: the exact name filter for ${JSON.stringify(context.name)} matched ${matches.length} records. Hetzner enforces name uniqueness per project, so this means the filter did not behave as this resolver believes; choosing one by listing order would make the managed resource depend on the order the API answered in`,
		);
	}
	return matches[0];
}

/**
 * Hetzner answers a mutation with an `Action` that is still running. The id is
 * published so a caller that wants to wait has something to wait on, and the
 * diagnostic says plainly that this resolver did not wait.
 */
function actionDiagnostics(
	created: Readonly<Record<string, unknown>>,
	what: string,
): readonly string[] {
	const action = nestedRecord(created, "action");
	const status = optionalString(action, "status");
	if (status === undefined || status === "success") return [];
	return [
		`${what} returned action ${String(action.id ?? "?")} with status ${status}: Hetzner provisions asynchronously and this resolver does not poll, so the call is accepted, not confirmed`,
	];
}

function actionOutputs(
	created: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const action = nestedRecord(created, "action");
	const id = optionalInteger(action, "id");
	return id === undefined ? {} : { actionId: id };
}

// ---------------------------------------------------------------------------
// Cloud Servers — /v1/servers
// ---------------------------------------------------------------------------

function serverOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const publicNet = nestedRecord(record, "public_net");
	const ipv4 = optionalString(nestedRecord(publicNet, "ipv4"), "ip");
	const ipv6 = optionalString(nestedRecord(publicNet, "ipv6"), "ip");
	const serverType = optionalString(
		nestedRecord(record, "server_type"),
		"name",
	);
	const datacenter = nestedRecord(record, "datacenter");
	const location = optionalString(nestedRecord(datacenter, "location"), "name");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(optionalString(record, "status") !== undefined
			? { status: optionalString(record, "status") }
			: {}),
		...(ipv4 !== undefined ? { ipv4 } : {}),
		...(ipv6 !== undefined ? { ipv6 } : {}),
		...(serverType !== undefined ? { serverType } : {}),
		...(location !== undefined ? { location } : {}),
	};
}

function serverDiagnostics(
	context: HetznerResolverContext,
	record: Readonly<Record<string, unknown>>,
): readonly string[] {
	const diagnostics: string[] = [];
	const status = optionalString(record, "status");
	if (status !== undefined && status !== "running") {
		diagnostics.push(
			`server is ${status}, not running: Hetzner provisions asynchronously and this resolver does not poll, so the create is accepted, not confirmed`,
		);
	}
	const wanted =
		optionalString(context.desired, "location") ??
		optionalString(context.desired, "region");
	const actual = optionalString(
		nestedRecord(nestedRecord(record, "datacenter"), "location"),
		"name",
	);
	if (wanted !== undefined && actual !== undefined && wanted !== actual) {
		diagnostics.push(
			`server is in ${actual} but the request asks for ${wanted}; a server cannot be moved between locations and this resolver never replaces one, so the drift is reported for a human rather than "fixed" by destroying the machine`,
		);
	}
	const wantedType = optionalString(context.desired, "serverType");
	const actualType = optionalString(
		nestedRecord(record, "server_type"),
		"name",
	);
	if (
		wantedType !== undefined &&
		actualType !== undefined &&
		wantedType !== actualType
	) {
		diagnostics.push(
			`server is type ${actualType} but the request asks for ${wantedType}; rescaling requires a power-off, which this resolver will not do to a running machine on its own — action left for a human`,
		);
	}
	return diagnostics;
}

const CLOUD_SERVER_SPEC: Omit<HetznerResolverSpec, "productId"> = {
	async read(context) {
		const observed = await findByName(context, SERVERS);
		return observed === undefined
			? undefined
			: outcome(
					settledAction(context),
					identityOf(observed, `hetzner read server ${context.name}`),
					serverOutputs(observed),
					serverDiagnostics(context, observed),
				);
	},
	async reconcile(context) {
		const observed = await findByName(context, SERVERS);
		if (observed !== undefined) {
			// Every mutable difference on a server (type, image) needs a power-off
			// or a rebuild, so there is no in-place update path here. Reporting the
			// drift is the honest outcome; "converging" it would mean taking a
			// running machine down without being asked.
			return outcome(
				settledAction(context),
				identityOf(observed, `hetzner read server ${context.name}`),
				serverOutputs(observed),
				serverDiagnostics(context, observed),
			);
		}
		const productId = HETZNER_CLOUD_SERVER_PRODUCT_ID;
		const label = `hetzner create server ${context.name}`;
		const created = expectOk(
			await send(context, {
				method: "POST",
				path: SERVERS.path,
				json: {
					name: context.name,
					server_type: requiredString(context, "serverType", productId, "cx22"),
					image: requiredString(context, "image", productId, "ubuntu-24.04"),
					location: requiredLocation(context, productId),
					...(optionalBoolean(context.desired, "backups") !== undefined
						? { backups: optionalBoolean(context.desired, "backups") }
						: {}),
					...(optionalString(context.desired, "placementGroup") !== undefined
						? {
								placement_group: optionalString(
									context.desired,
									"placementGroup",
								),
							}
						: {}),
				},
			}),
			label,
		);
		const record = nestedRecord(created, SERVERS.itemKey);
		return outcome(
			"create",
			identityOf(record, label),
			{ ...serverOutputs(record), ...actionOutputs(created) },
			[
				...serverDiagnostics(context, record),
				...actionDiagnostics(created, "server create"),
			],
		);
	},
	async remove(context) {
		const observed = await findByName(context, SERVERS);
		if (observed === undefined) return;
		const label = `hetzner delete server ${context.name}`;
		const id = identityOf(observed, label);
		const response = await send(context, {
			method: "DELETE",
			path: `${SERVERS.path}/${encodeURIComponent(id)}`,
		});
		if (isNotFound(response)) return;
		expectOk(response, label);
	},
};

// ---------------------------------------------------------------------------
// Load Balancers — /v1/load_balancers
// ---------------------------------------------------------------------------

function loadBalancerOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const publicNet = nestedRecord(record, "public_net");
	const ipv4 = optionalString(nestedRecord(publicNet, "ipv4"), "ip");
	const type = optionalString(
		nestedRecord(record, "load_balancer_type"),
		"name",
	);
	const algorithm = optionalString(nestedRecord(record, "algorithm"), "type");
	const location = optionalString(nestedRecord(record, "location"), "name");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(ipv4 !== undefined ? { ipv4 } : {}),
		...(type !== undefined ? { loadBalancerType: type } : {}),
		...(algorithm !== undefined ? { algorithm } : {}),
		...(location !== undefined ? { location } : {}),
	};
}

const LOAD_BALANCER_SPEC: Omit<HetznerResolverSpec, "productId"> = {
	async read(context) {
		const observed = await findByName(context, LOAD_BALANCERS);
		return observed === undefined
			? undefined
			: outcome(
					settledAction(context),
					identityOf(observed, `hetzner read load balancer ${context.name}`),
					loadBalancerOutputs(observed),
					[],
				);
	},
	async reconcile(context) {
		const productId = HETZNER_LOAD_BALANCER_PRODUCT_ID;
		const observed = await findByName(context, LOAD_BALANCERS);
		if (observed === undefined) {
			const label = `hetzner create load balancer ${context.name}`;
			const created = expectOk(
				await send(context, {
					method: "POST",
					path: LOAD_BALANCERS.path,
					json: {
						name: context.name,
						load_balancer_type: requiredString(
							context,
							"loadBalancerType",
							productId,
							"lb11",
						),
						location: requiredLocation(context, productId),
						...(optionalString(context.desired, "algorithm") !== undefined
							? {
									algorithm: {
										type: optionalString(context.desired, "algorithm"),
									},
								}
							: {}),
						...(optionalBoolean(context.desired, "publicInterface") !==
						undefined
							? {
									public_interface: optionalBoolean(
										context.desired,
										"publicInterface",
									),
								}
							: {}),
					},
				}),
				label,
			);
			const record = nestedRecord(created, LOAD_BALANCERS.itemKey);
			return outcome(
				"create",
				identityOf(record, label),
				{ ...loadBalancerOutputs(record), ...actionOutputs(created) },
				actionDiagnostics(created, "load balancer create"),
			);
		}
		const id = identityOf(
			observed,
			`hetzner read load balancer ${context.name}`,
		);
		const wanted = optionalString(context.desired, "algorithm");
		const current = optionalString(nestedRecord(observed, "algorithm"), "type");
		if (wanted === undefined || wanted === current) {
			return outcome(
				settledAction(context),
				id,
				loadBalancerOutputs(observed),
				[],
			);
		}
		// The algorithm has its own action endpoint; the top-level PUT only
		// changes name and labels, so sending the algorithm there would silently
		// do nothing.
		const label = `hetzner change load balancer algorithm ${context.name}`;
		const changed = expectOk(
			await send(context, {
				method: "POST",
				path: `${LOAD_BALANCERS.path}/${encodeURIComponent(id)}/actions/change_algorithm`,
				json: { type: wanted },
			}),
			label,
		);
		const refreshed = (await findByName(context, LOAD_BALANCERS)) ?? observed;
		return outcome(
			"update",
			id,
			{ ...loadBalancerOutputs(refreshed), ...actionOutputs(changed) },
			actionDiagnostics(changed, "load balancer algorithm change"),
		);
	},
	async remove(context) {
		const observed = await findByName(context, LOAD_BALANCERS);
		if (observed === undefined) return;
		const label = `hetzner delete load balancer ${context.name}`;
		const id = identityOf(observed, label);
		const response = await send(context, {
			method: "DELETE",
			path: `${LOAD_BALANCERS.path}/${encodeURIComponent(id)}`,
		});
		if (isNotFound(response)) return;
		expectOk(response, label);
	},
};

// ---------------------------------------------------------------------------
// Volumes — /v1/volumes
// ---------------------------------------------------------------------------

function volumeOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const size = optionalInteger(record, "size");
	const location = optionalString(nestedRecord(record, "location"), "name");
	const linuxDevice = optionalString(record, "linux_device");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(optionalString(record, "status") !== undefined
			? { status: optionalString(record, "status") }
			: {}),
		...(size !== undefined ? { sizeGb: size } : {}),
		...(location !== undefined ? { location } : {}),
		...(linuxDevice !== undefined ? { linuxDevice } : {}),
	};
}

function volumeDiagnostics(
	context: HetznerResolverContext,
	record: Readonly<Record<string, unknown>>,
): readonly string[] {
	const diagnostics: string[] = [];
	const wantedSize = optionalInteger(context.desired, "sizeGb");
	const actualSize = optionalInteger(record, "size");
	if (
		wantedSize !== undefined &&
		actualSize !== undefined &&
		wantedSize < actualSize
	) {
		diagnostics.push(
			`volume is ${actualSize} GB but the request asks for ${wantedSize} GB; Hetzner volumes only grow, so shrinking is reported for a human rather than "fixed" by replacing the volume and destroying the data on it`,
		);
	}
	const wantedLocation =
		optionalString(context.desired, "location") ??
		optionalString(context.desired, "region");
	const actualLocation = optionalString(
		nestedRecord(record, "location"),
		"name",
	);
	if (
		wantedLocation !== undefined &&
		actualLocation !== undefined &&
		wantedLocation !== actualLocation
	) {
		diagnostics.push(
			`volume is in ${actualLocation} but the request asks for ${wantedLocation}; a volume's location is immutable and this resolver never replaces one, so the drift is reported for a human`,
		);
	}
	return diagnostics;
}

const VOLUME_SPEC: Omit<HetznerResolverSpec, "productId"> = {
	async read(context) {
		const observed = await findByName(context, VOLUMES);
		return observed === undefined
			? undefined
			: outcome(
					settledAction(context),
					identityOf(observed, `hetzner read volume ${context.name}`),
					volumeOutputs(observed),
					volumeDiagnostics(context, observed),
				);
	},
	async reconcile(context) {
		const productId = HETZNER_VOLUME_PRODUCT_ID;
		const observed = await findByName(context, VOLUMES);
		if (observed === undefined) {
			const size = optionalInteger(context.desired, "sizeGb");
			if (size === undefined) {
				throw new ResolverError(
					"RESOLVER_PRODUCT_UNSUPPORTED",
					`${productId}: the request names no sizeGb — set desired.sizeGb, for example 10. A volume billed at a size nobody asked for is a cost incident, so no size is invented here`,
				);
			}
			const label = `hetzner create volume ${context.name}`;
			const created = expectOk(
				await send(context, {
					method: "POST",
					path: VOLUMES.path,
					json: {
						name: context.name,
						size,
						location: requiredLocation(context, productId),
						...(optionalString(context.desired, "format") !== undefined
							? { format: optionalString(context.desired, "format") }
							: {}),
						...(optionalBoolean(context.desired, "automount") !== undefined
							? { automount: optionalBoolean(context.desired, "automount") }
							: {}),
					},
				}),
				label,
			);
			const record = nestedRecord(created, VOLUMES.itemKey);
			return outcome(
				"create",
				identityOf(record, label),
				{ ...volumeOutputs(record), ...actionOutputs(created) },
				[
					...volumeDiagnostics(context, record),
					...actionDiagnostics(created, "volume create"),
				],
			);
		}
		const id = identityOf(observed, `hetzner read volume ${context.name}`);
		const wantedSize = optionalInteger(context.desired, "sizeGb");
		const actualSize = optionalInteger(observed, "size");
		if (
			wantedSize === undefined ||
			actualSize === undefined ||
			wantedSize <= actualSize
		) {
			return outcome(
				settledAction(context),
				id,
				volumeOutputs(observed),
				volumeDiagnostics(context, observed),
			);
		}
		const label = `hetzner resize volume ${context.name}`;
		const resized = expectOk(
			await send(context, {
				method: "POST",
				path: `${VOLUMES.path}/${encodeURIComponent(id)}/actions/resize`,
				json: { size: wantedSize },
			}),
			label,
		);
		const refreshed = (await findByName(context, VOLUMES)) ?? observed;
		return outcome(
			"update",
			id,
			{ ...volumeOutputs(refreshed), ...actionOutputs(resized) },
			[
				...volumeDiagnostics(context, refreshed),
				...actionDiagnostics(resized, "volume resize"),
				"a grown volume still needs its filesystem extended inside the guest; this resolver does not run commands on a machine, so that step is left to the workload",
			],
		);
	},
	async remove(context) {
		const observed = await findByName(context, VOLUMES);
		if (observed === undefined) return;
		const label = `hetzner delete volume ${context.name}`;
		const id = identityOf(observed, label);
		const response = await send(context, {
			method: "DELETE",
			path: `${VOLUMES.path}/${encodeURIComponent(id)}`,
		});
		if (isNotFound(response)) return;
		expectOk(response, label);
	},
};

// ---------------------------------------------------------------------------
// Object Storage — S3 on <location>.your-objectstorage.com, signed with SigV4
// ---------------------------------------------------------------------------

/**
 * The one product here that does not speak to the Cloud API. It is an S3
 * surface on its own host with its own key pair, so it has its own guard
 * policy, its own credential, and its own send path — which is what makes
 * "the project token cannot reach this origin" a property of construction
 * rather than of care.
 *
 * Convergence is a plain read-or-create against S3's own documented existence
 * check: `HEAD /{bucket}` answers 200 or 404, and 404 is the only signal that
 * a create is needed.
 */
async function sendObjectStorage(
	context: HetznerResolverContext,
	call: {
		readonly method: TransportMethod;
		readonly path: string;
		readonly body?: string;
	},
): Promise<TransportResponse> {
	const location = requiredLocation(context, HETZNER_OBJECT_STORAGE_PRODUCT_ID);
	const keys = context.objectStorageKeys;
	if (keys === undefined) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`${HETZNER_OBJECT_STORAGE_PRODUCT_ID}: no Object Storage credential was resolved. Construct the resolvers with resolveObjectStorageCredential(ref) — Object Storage uses an access key pair, not the project API token, and this package will not send one where the other belongs`,
		);
	}
	const url = objectStorageUrl(location, call.path);
	const credentials: AwsCredentials = {
		accessKeyId: keys.accessKeyId,
		secretAccessKey: keys.secretAccessKey,
	};
	const signed = signAwsRequest({
		method: call.method,
		url,
		...(call.body === undefined ? {} : { body: call.body }),
		// Hetzner's S3 surface verifies a signature scoped to the location.
		region: location,
		service: "s3",
		credentials,
		now: new Date(context.nowMs()),
	});
	const guarded = guardedObjectStorageTransport(context.transport, location);
	return guarded({
		method: call.method,
		url,
		headers: lowerCaseHeaders(signed.headers),
		...(call.body === undefined ? {} : { body: call.body }),
		timeoutMs: HETZNER_MAX_TIMEOUT_MS,
		maxResponseBytes: HETZNER_MAX_RESPONSE_BYTES,
	});
}

/**
 * Fold signed header names to lower case.
 *
 * `signAwsRequest` returns `Authorization` with its conventional casing and
 * everything else lower; HTTP header names are case-insensitive, so both reach
 * the provider identically. Folding here means every request this repo composes
 * carries one convention, which is what lets a guard, a test, or a log line
 * look for `authorization` without knowing which signer produced it.
 */
function lowerCaseHeaders(
	headers: Readonly<Record<string, string>>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		out[name.toLowerCase()] = value;
	}
	return out;
}

function objectStorageOutputs(
	context: HetznerResolverContext,
	location: string,
): Readonly<Record<string, unknown>> {
	return {
		bucketName: context.name,
		location,
		endpoint: `https://${context.name}.${location}.your-objectstorage.com`,
		s3Endpoint: `https://${location}.your-objectstorage.com`,
	};
}

const OBJECT_STORAGE_SPEC: Omit<HetznerResolverSpec, "productId"> = {
	async read(context) {
		const location = requiredLocation(
			context,
			HETZNER_OBJECT_STORAGE_PRODUCT_ID,
		);
		const response = await sendObjectStorage(context, {
			method: "HEAD",
			path: `/${encodeURIComponent(context.name)}`,
		});
		if (response.status === 404) return undefined;
		if (response.status >= 400) {
			throw providerRejection(
				response,
				`object storage read bucket ${context.name}`,
			);
		}
		return outcome(
			settledAction(context),
			context.name,
			objectStorageOutputs(context, location),
			[],
		);
	},
	async reconcile(context) {
		const location = requiredLocation(
			context,
			HETZNER_OBJECT_STORAGE_PRODUCT_ID,
		);
		const path = `/${encodeURIComponent(context.name)}`;
		const head = await sendObjectStorage(context, { method: "HEAD", path });
		if (head.status !== 404) {
			if (head.status >= 400) {
				throw providerRejection(
					head,
					`object storage read bucket ${context.name}`,
				);
			}
			return outcome(
				settledAction(context),
				context.name,
				objectStorageOutputs(context, location),
				[],
			);
		}
		const label = `object storage create bucket ${context.name}`;
		const created = await sendObjectStorage(context, { method: "PUT", path });
		if (created.status === 409) {
			throw new ResolverError(
				"RESOLVER_PROVIDER_REJECTED",
				`${label}: the bucket name is already taken. S3 bucket names are global within a location, so this is somebody else's bucket — it is reported rather than adopted, because adopting a bucket you do not own is worse than failing`,
			);
		}
		if (created.status >= 400) throw providerRejection(created, label);
		return outcome(
			"create",
			context.name,
			objectStorageOutputs(context, location),
			[
				"the bucket was created private; this resolver sets no ACL, so a bucket meant to be public still needs one applied deliberately",
			],
		);
	},
	async remove(context) {
		const label = `object storage delete bucket ${context.name}`;
		const response = await sendObjectStorage(context, {
			method: "DELETE",
			path: `/${encodeURIComponent(context.name)}`,
		});
		if (response.status === 404) return;
		if (response.status === 409) {
			throw new ResolverError(
				"RESOLVER_PROVIDER_REJECTED",
				`${label}: the bucket is not empty. This resolver will not enumerate and delete objects to make a delete succeed — that is unbounded data loss dressed as cleanup. Empty the bucket deliberately, then reconcile`,
			);
		}
		if (response.status >= 400) throw providerRejection(response, label);
	},
};

// ---------------------------------------------------------------------------
// Wrapper and registry
// ---------------------------------------------------------------------------

/** Per-product behaviour; the wrapper owns credentials, naming, and refusals. */
interface HetznerResolverSpec {
	readonly productId: string;
	reconcile(context: HetznerResolverContext): Promise<ResolveOutcome>;
	read(context: HetznerResolverContext): Promise<ResolveOutcome | undefined>;
	remove(context: HetznerResolverContext): Promise<void>;
}

/**
 * The SigV4 clock, refused rather than defaulted. A signer that reads the
 * ambient clock cannot be pinned by a test.
 */
function clockOf(nowMs: HetznerResolverOptions["nowMs"]): () => number {
	if (typeof nowMs === "function") return nowMs;
	if (typeof nowMs === "number" && Number.isFinite(nowMs)) return () => nowMs;
	throw new ResolverError(
		"RESOLVER_PRODUCT_UNSUPPORTED",
		"the hetzner object storage resolver needs an injected nowMs (a number or a () => number). SigV4 signs a timestamp, and reading the clock inside the resolver would make a signed request untestable",
	);
}

function createResolver(
	spec: HetznerResolverSpec,
	options: HetznerResolverOptions,
): ResourceResolver {
	const signsRequests = spec.productId === HETZNER_OBJECT_STORAGE_PRODUCT_ID;
	if (typeof options.resolveCredential !== "function") {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			"hetzner resolvers need an injected resolveCredential(ref): the resolver never reads an environment variable or a credential file itself",
		);
	}

	async function contextFor(
		request: ResolveRequest,
		transport: HttpTransport,
	): Promise<HetznerResolverContext> {
		if (request.ref.productId !== spec.productId) {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`hetzner resolver for ${spec.productId} was handed a request for ${JSON.stringify(request.ref.productId)}; route the request through the registry rather than picking a resolver by hand`,
				spec.productId,
			);
		}
		// The two credentials are mutually exclusive by construction: the S3
		// path never resolves the project token, and the Cloud API path never
		// resolves the S3 keys.
		// The Object Storage prerequisites are demanded when that resolver is
		// actually used, not when the registry is built. A registry is a
		// catalog: building one to reconcile a Cloud Server must not fail for
		// want of an S3 key pair that will never be sent.
		const nowMs = signsRequests ? clockOf(options.nowMs) : () => 0;
		const token = signsRequests
			? ""
			: await resolveToken(request, options.resolveCredential);
		const objectStorageKeys = signsRequests
			? await resolveObjectStorageKeys(
					request,
					options.resolveObjectStorageCredential,
				)
			: undefined;
		return {
			request,
			transport,
			token,
			name: resourceName(request, spec.productId),
			desired: request.desired,
			knownPhysicalId: knownPhysicalId(request),
			objectStorageKeys,
			nowMs,
		};
	}

	return {
		providerId: HETZNER_PROVIDER_TARGET,
		productId: spec.productId,
		async reconcile(request, transport) {
			return spec.reconcile(await contextFor(request, transport));
		},
		async read(request, transport) {
			return spec.read(await contextFor(request, transport));
		},
		async delete(request, transport) {
			await spec.remove(await contextFor(request, transport));
		},
	};
}

/**
 * Every Hetzner resolver, id-sorted so the list is a function of the code
 * rather than of construction order. The two catalogued products that are
 * absent are named in {@link HETZNER_UNRESOLVED_PRODUCT_IDS}, with the reason.
 */
export function hetznerResolvers(
	options: HetznerResolverOptions,
): readonly ResourceResolver[] {
	const specs: readonly HetznerResolverSpec[] = [
		{ productId: HETZNER_CLOUD_SERVER_PRODUCT_ID, ...CLOUD_SERVER_SPEC },
		{ productId: HETZNER_LOAD_BALANCER_PRODUCT_ID, ...LOAD_BALANCER_SPEC },
		{ productId: HETZNER_VOLUME_PRODUCT_ID, ...VOLUME_SPEC },
		{
			productId: HETZNER_OBJECT_STORAGE_PRODUCT_ID,
			...OBJECT_STORAGE_SPEC,
		},
	];
	return Object.freeze(
		[...specs]
			.sort((left, right) => compareStrings(left.productId, right.productId))
			.map((spec) => createResolver(spec, options)),
	);
}

/** The same resolvers, behind core's product-id lookup. */
export function hetznerResolverRegistry(options: HetznerResolverOptions): {
	get(productId: string): ResourceResolver | undefined;
	list(): readonly ResourceResolver[];
} {
	return createResolverRegistry(hetznerResolvers(options));
}
