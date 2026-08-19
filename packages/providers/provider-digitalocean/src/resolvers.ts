/**
 * Direct DigitalOcean API v2 resource resolvers — the default deployment path.
 *
 * Why this module exists: a provider package that publishes an allocatable Yard
 * catalog and ships no `ResourceResolver` fails closed on every deploy. These
 * resolvers close that gap the way the Cloudflare, GCP and AWS ones do: a
 * `ResourceResolver` per product, talking to `api.digitalocean.com/v2` over an
 * injected, guarded transport, with no IaC engine and no state file in the
 * middle.
 *
 * The property that makes that safe is **convergence**. DigitalOcean's v2
 * collections are keyed by a server-assigned `id`, not by the name the caller
 * chose, so "does my resource already exist" is a *listing* question rather
 * than a GET. Every `reconcile()` here therefore pages the collection — under a
 * bounded page budget, never an unbounded loop — looking for the
 * deterministically-named record *before* it creates anything, then applies
 * only the mutable deltas. Running it twice yields the same `physicalId`,
 * exactly one resource, and exactly one create call, which is what makes a
 * crashed half-apply safe to re-run instead of something an operator
 * reconciles by hand. `delete()` treats "already gone" as success for the same
 * reason. `"replace"` is never emitted: replacing a database or a Droplet
 * destroys data, so drift on an immutable field (region, engine, image) is
 * reported as a diagnostic and left for a human.
 *
 * A name that matches more than one record is refused rather than resolved.
 * DigitalOcean does not enforce name uniqueness on Droplets or Load Balancers,
 * and picking "the first one" would make `physicalId` depend on listing order —
 * which is exactly how a reconcile starts silently managing somebody else's
 * resource.
 *
 * Provisioning is asynchronous and this module says so rather than reporting a
 * `create` as ready. A database comes back `status: "creating"`, an app comes
 * back with no `live_url` and a Droplet comes back `status: "new"`; each of
 * those lands in `diagnostics` as *accepted, not confirmed*. There is no
 * polling here at all: a resolver that blocks a deploy on a provider's
 * provisioning clock is worse than one that reports the truth and lets the
 * caller decide.
 *
 * A product with no convergent path ships **no resolver** rather than a
 * plausible one — see {@link DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS}, which names
 * each one and why. A resolver that duplicates a resource on every retry is
 * worse than an absent one.
 *
 * Credentials are locators, never material. A resolver is constructed with an
 * injected `resolveCredential(ref)`; `ResolveRequest.credentialRef` must be a
 * `scheme://…` locator — the grammar core's `parseResolveRequest` enforces —
 * and a value that looks like the personal access token itself is refused,
 * because a raw token in a request record is a token in the event log. The
 * token reaches exactly one place: the `authorization` header. It is never
 * logged, never put in `outputs`, and DigitalOcean's error text is redacted
 * before it reaches a message.
 *
 * Determinism: no clock, no randomness, no environment reads.
 *
 * HONEST SCOPE (also in the README):
 *   - These resolvers are exercised against an *injected fake* transport
 *     modelling a DigitalOcean team. Nothing in this package proves a live
 *     deploy: that additionally needs a real token, real network egress, and a
 *     real DigitalOcean account, none of which a unit test supplies.
 *   - The endpoint paths, request bodies and response field names below are
 *     written from DigitalOcean's published API reference. They have not been
 *     replayed against the running service, so a field DigitalOcean has since
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

import { DIGITALOCEAN_PROVIDER_TARGET } from "./options.js";
import {
	appPlatform,
	droplet,
	functions,
	kubernetesWorkload,
	loadBalancer,
	managed,
	managedValkey,
	spaces,
} from "./slots.js";
import {
	DIGITALOCEAN_MAX_RESPONSE_BYTES,
	DIGITALOCEAN_MAX_TIMEOUT_MS,
	digitaloceanApiUrl,
	guardedDigitalOceanTransport,
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

export const DIGITALOCEAN_APP_SERVICE_PRODUCT_ID = productIdOf(
	appPlatform.service(),
	"appPlatform.service",
);
export const DIGITALOCEAN_APP_STATIC_SITE_PRODUCT_ID = productIdOf(
	appPlatform.staticSite(),
	"appPlatform.staticSite",
);
export const DIGITALOCEAN_DROPLET_PRODUCT_ID = productIdOf(
	droplet(),
	"droplet",
);
export const DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID = productIdOf(
	loadBalancer(),
	"loadBalancer",
);
export const DIGITALOCEAN_MANAGED_MONGODB_PRODUCT_ID = productIdOf(
	managed.mongodb(),
	"managed.mongodb",
);
export const DIGITALOCEAN_MANAGED_MYSQL_PRODUCT_ID = productIdOf(
	managed.mysql(),
	"managed.mysql",
);
export const DIGITALOCEAN_MANAGED_OPENSEARCH_PRODUCT_ID = productIdOf(
	managed.opensearch(),
	"managed.opensearch",
);
export const DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID = productIdOf(
	managed.postgres(),
	"managed.postgres",
);
export const DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID = productIdOf(
	managedValkey(),
	"managedValkey",
);

/** Every product this module resolves, id-sorted for a deterministic registry. */
export const DIGITALOCEAN_RESOLVED_PRODUCT_IDS: readonly string[] =
	Object.freeze(
		[
			DIGITALOCEAN_APP_SERVICE_PRODUCT_ID,
			DIGITALOCEAN_APP_STATIC_SITE_PRODUCT_ID,
			DIGITALOCEAN_DROPLET_PRODUCT_ID,
			DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID,
			DIGITALOCEAN_MANAGED_MONGODB_PRODUCT_ID,
			DIGITALOCEAN_MANAGED_MYSQL_PRODUCT_ID,
			DIGITALOCEAN_MANAGED_OPENSEARCH_PRODUCT_ID,
			DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID,
			DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID,
		].sort(compareStrings),
	);

/**
 * Product ids this package catalogs but deliberately cannot resolve. A
 * non-convergent resolver that duplicates a resource on every retry is worse
 * than an absent one, so these are absent and declared.
 *
 * `digitalocean.spaces/v1`: Spaces is an S3 surface on
 * `<region>.digitaloceanspaces.com`, signed with SigV4 against a *separate*
 * Spaces key pair — a different host, a different credential, and a host the
 * transport guard in `./transport.ts` deliberately does not allowlist.
 * Resolving it would mean widening the guard for the one product that does not
 * use the control-plane token.
 *
 * `digitalocean.app-platform-worker/v1` and `digitalocean.app-platform-job/v1`:
 * a worker and a job are *components inside* an App Platform app spec, not
 * standalone resources with their own ids. The app resolver owns the whole
 * spec; a second resolver mutating one component of it would race the first.
 *
 * `digitalocean.functions/v1`: deploying a function packages and uploads source
 * to a namespace-scoped endpoint minted per call. The upload is not
 * deterministic and the source bytes are not part of `desired`.
 *
 * `digitalocean.kubernetes-workload/v1`: the row names a DOKS node pool, and a
 * node pool is not the workload. The Deployment, Service and Job objects that
 * actually run belong to `@hobo/provider-kubernetes`, which resolves them
 * against the cluster's own apiserver.
 */
export const DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS: readonly string[] =
	Object.freeze(
		[
			productIdOf(appPlatform.job(), "appPlatform.job"),
			productIdOf(appPlatform.worker(), "appPlatform.worker"),
			productIdOf(functions(), "functions"),
			productIdOf(kubernetesWorkload(), "kubernetesWorkload"),
			productIdOf(spaces(), "spaces"),
		].sort(compareStrings),
	);

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** What a host must supply to build the resolvers. */
export interface DigitalOceanResolverOptions {
	/**
	 * Resolves a credential *locator* to a DigitalOcean personal access token.
	 * Injected so the resolver never holds a secret and never decides where
	 * secrets live.
	 */
	readonly resolveCredential: (ref: string) => Promise<string>;
	/**
	 * How many pages of a collection a lookup may read before it refuses.
	 * Bounded on purpose: an unbounded listing is an unbounded deploy, and a
	 * team with more resources than this budget covers should say so rather
	 * than have the resolver silently conclude "not found" and create a
	 * duplicate. Defaults to {@link DEFAULT_MAX_LIST_PAGES}.
	 */
	readonly maxListPages?: number;
}

/** Twenty pages of 200 records: 4,000 resources before a listing refuses. */
export const DEFAULT_MAX_LIST_PAGES = 20;

/** Records per page requested from a collection endpoint. */
const PAGE_SIZE = 200;

/**
 * A credential locator, using the same grammar core's `parseResolveRequest`
 * enforces (`scheme://path`, no userinfo). Restated here rather than imported
 * because a resolver must refuse a bad ref even when a caller skipped the parse
 * boundary — and a second grammar would be a second answer.
 */
const CREDENTIAL_REF_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s@]+$/u;

/**
 * What a DigitalOcean personal access token looks like when someone pastes the
 * value into `credentialRef` by mistake. Refusing this shape is the difference
 * between a locator in the event log and a live token in the event log.
 */
const RAW_CREDENTIAL_PATTERN = /^(?:dop_v1_)?[A-Za-z0-9_-]{32,}$/u;

/** Anything long and token-shaped is scrubbed out of provider error text. */
const TOKEN_SHAPED_PATTERN = /[A-Za-z0-9_-]{20,}/gu;

/**
 * Redact provider text before it reaches a message, a diagnostic, or a log.
 * DigitalOcean echoes request context in `message`, and that context has
 * carried resource ids and token fragments before.
 */
export function redactDigitalOceanText(text: string, limit = 400): string {
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

/** DigitalOcean ids are numbers on Droplets and UUID strings elsewhere. */
function identityOf(
	record: Readonly<Record<string, unknown>>,
	label: string,
): string {
	const value = record.id;
	if (typeof value === "string" && value.trim().length > 0) return value;
	if (typeof value === "number" && Number.isSafeInteger(value)) {
		return String(value);
	}
	throw new ResolverError(
		"RESOLVER_OUTPUT_UNPARSEABLE",
		`${label}: DigitalOcean returned a record without a usable id, so the resource cannot be addressed`,
	);
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

interface DigitalOceanCall {
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
	context: DigitalOceanResolverContext,
	call: DigitalOceanCall,
): Promise<TransportResponse> {
	const body = call.json === undefined ? undefined : JSON.stringify(call.json);
	const guarded = guardedDigitalOceanTransport(context.transport);
	return guarded({
		method: call.method,
		url: digitaloceanApiUrl(call.path),
		headers: {
			accept: "application/json",
			authorization: `Bearer ${context.token}`,
			...(body !== undefined ? { "content-type": "application/json" } : {}),
		},
		...(body !== undefined ? { body } : {}),
		timeoutMs: DIGITALOCEAN_MAX_TIMEOUT_MS,
		maxResponseBytes: DIGITALOCEAN_MAX_RESPONSE_BYTES,
	});
}

function isNotFound(response: TransportResponse): boolean {
	return response.status === 404;
}

/**
 * Parse a JSON body. An empty body on a success status is `{}` —
 * DigitalOcean answers deletes with `204 No Content` — and anything else that
 * is not a JSON object is `RESOLVER_OUTPUT_UNPARSEABLE`, because a body this
 * code cannot read leaves the outcome of the call unknown, and an unknown
 * outcome is refused rather than assumed.
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
			`${label}: DigitalOcean returned a status ${response.status} body that is not JSON, so the outcome of the call is unknown and it is refused rather than assumed`,
		);
	}
	if (!isPlainObject(parsed)) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`${label}: DigitalOcean returned JSON that is not an object (status ${response.status}), so the resource it describes cannot be identified`,
		);
	}
	return parsed;
}

/**
 * The refusal path. DigitalOcean's error envelope is
 * `{"id":"unprocessable_entity","message":"…"}`; the message is redacted
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
		const id = optionalString(record, "id");
		const message = optionalString(record, "message");
		const parts = [id, message].filter(
			(part): part is string => part !== undefined,
		);
		if (parts.length > 0) {
			detail = redactDigitalOceanText(parts.join(": "));
		}
	} catch {
		const snippet = response.body.trim();
		if (snippet.length > 0) detail = redactDigitalOceanText(snippet, 160);
	}
	return new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`${label}: DigitalOcean refused the call with status ${response.status}: ${detail}`,
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
interface DigitalOceanResolverContext {
	readonly request: ResolveRequest;
	readonly transport: HttpTransport;
	readonly token: string;
	/** The deterministic resource name: `desired.name`, else the logical id. */
	readonly name: string;
	readonly desired: Readonly<Record<string, unknown>>;
	/** True when the caller already knows the physical id (adopt vs noop). */
	readonly knownPhysicalId: string | undefined;
	readonly maxListPages: number;
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
function settledAction(context: DigitalOceanResolverContext): ResolverAction {
	return context.knownPhysicalId === undefined ? "adopt" : "noop";
}

function assertListPages(pages: number | undefined): number {
	if (pages === undefined) return DEFAULT_MAX_LIST_PAGES;
	if (!Number.isSafeInteger(pages) || pages < 1 || pages > 500) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`digitalocean resolvers need a bounded maxListPages between 1 and 500, received ${JSON.stringify(pages)}; an unbounded listing is an unbounded deploy`,
		);
	}
	return pages;
}

/**
 * The credential parse boundary. A blank ref is `RESOLVER_CREDENTIAL_MISSING`
 * (with remediation), a token-shaped one is `RESOLVER_CREDENTIAL_NOT_A_REF` — a
 * raw secret in a request record has already leaked by the time it is used —
 * and a host that hands back nothing is missing, never "carry on
 * unauthenticated", which would surface at DigitalOcean as a confusing 401.
 */
async function resolveToken(
	request: ResolveRequest,
	resolve: (ref: string) => Promise<string>,
): Promise<string> {
	const ref = request.credentialRef;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			'digitalocean resolver: credentialRef is empty. Supply a locator such as "env://DIGITALOCEAN_TOKEN" or "secret://camp/digitalocean-pat" and register it with the host credential resolver; the resolver never accepts inline credential material',
		);
	}
	const trimmed = ref.trim();
	if (RAW_CREDENTIAL_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			"digitalocean resolver: credentialRef looks like credential material rather than a locator. Store the personal access token with the host secret custody and pass its reference (scheme://path); a raw token in a ResolveRequest is a token in the event log",
		);
	}
	if (!CREDENTIAL_REF_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			`digitalocean resolver: credentialRef ${JSON.stringify(redactDigitalOceanText(trimmed, 60))} is not a locator. Expected "<scheme>://<path>", for example "env://DIGITALOCEAN_TOKEN"`,
		);
	}
	let material: string;
	try {
		material = await resolve(trimmed);
	} catch (cause) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`digitalocean resolver: the host could not resolve credentialRef ${JSON.stringify(trimmed)}: ${redactDigitalOceanText(
				cause instanceof Error ? cause.message : String(cause),
				160,
			)}. Register the reference with the credential resolver before deploying`,
		);
	}
	if (typeof material !== "string" || material.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`digitalocean resolver: credentialRef ${JSON.stringify(trimmed)} resolved to nothing. A missing credential is refused rather than retried unauthenticated, which would look like a permissions error at DigitalOcean`,
		);
	}
	return material.trim();
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
 * The region a regional product needs. Never defaulted: a resource silently
 * created in `nyc3` because nobody said otherwise is a residency incident, not
 * a convenience.
 */
function requiredRegion(
	context: DigitalOceanResolverContext,
	productId: string,
): string {
	const region =
		optionalString(context.desired, "region") ??
		optionalString(context.desired, "location");
	if (region === undefined) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${productId}: the request names no region — set desired.region, for example "nyc3". A region is never chosen here, because a resource placed in an unrequested region is a residency decision this resolver may not take`,
		);
	}
	return region;
}

function requiredString(
	context: DigitalOceanResolverContext,
	key: string,
	productId: string,
	example: string,
): string {
	const value = optionalString(context.desired, key);
	if (value === undefined) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${productId}: the request names no ${key} — set desired.${key}, for example ${JSON.stringify(example)}. This resolver invents no plan size or image, because a resource billed at a size nobody asked for is a cost incident`,
		);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Collections: page, then match by name
// ---------------------------------------------------------------------------

/** How one collection is shaped: its path, its list key, and its item key. */
interface Collection {
	/** `/v2/databases`, `/v2/droplets`, … */
	readonly path: string;
	/** The array key in a list response: `databases`, `droplets`, … */
	readonly listKey: string;
	/** The object key in a single-item response: `database`, `droplet`, … */
	readonly itemKey: string;
	/** Reads the caller-visible name off one record. */
	readonly nameOf: (
		record: Readonly<Record<string, unknown>>,
	) => string | undefined;
}

function listPath(collection: Collection, page: number): string {
	return `${collection.path}?page=${page}&per_page=${PAGE_SIZE}`;
}

/**
 * Find the single record carrying this name, paging under the injected budget.
 *
 * Two records with the same name is a refusal, not a coin flip: DigitalOcean
 * does not enforce name uniqueness on Droplets or Load Balancers, and picking
 * the first would make `physicalId` depend on listing order — which is how a
 * reconcile starts silently managing somebody else's resource.
 *
 * Running out of pages is also a refusal. Concluding "not found" from an
 * exhausted budget would create a duplicate of a resource that exists on the
 * page nobody read.
 */
async function findByName(
	context: DigitalOceanResolverContext,
	collection: Collection,
): Promise<Record<string, unknown> | undefined> {
	const label = `digitalocean list ${collection.listKey} for ${context.name}`;
	const matches: Record<string, unknown>[] = [];
	for (let page = 1; page <= context.maxListPages; page += 1) {
		const record = expectOk(
			await send(context, { method: "GET", path: listPath(collection, page) }),
			label,
		);
		const items = record[collection.listKey];
		if (!Array.isArray(items)) {
			throw new ResolverError(
				"RESOLVER_OUTPUT_UNPARSEABLE",
				`${label}: DigitalOcean returned a page without a ${JSON.stringify(collection.listKey)} array, so the collection cannot be searched and a create would risk duplicating an existing resource`,
			);
		}
		for (const item of items) {
			if (isPlainObject(item) && collection.nameOf(item) === context.name) {
				matches.push(item);
			}
		}
		if (items.length < PAGE_SIZE) {
			if (matches.length > 1) throw ambiguous(context, collection);
			return matches[0];
		}
	}
	if (matches.length > 1) throw ambiguous(context, collection);
	if (matches.length === 1) return matches[0];
	throw new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`digitalocean ${collection.listKey}: read ${context.maxListPages} pages of ${PAGE_SIZE} without reaching the end of the collection and without finding ${JSON.stringify(context.name)}. The lookup refuses rather than concluding "absent" from an exhausted budget, which would create a duplicate of a resource on a page nobody read; raise maxListPages if the team really is this large`,
	);
}

function ambiguous(
	context: DigitalOceanResolverContext,
	collection: Collection,
): ResolverError {
	return new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`digitalocean ${collection.listKey}: more than one record is named ${JSON.stringify(context.name)}. DigitalOcean does not enforce name uniqueness here, and choosing one by listing order would make the managed resource depend on the order the API answered in; rename the duplicates or pass ref.physicalId`,
	);
}

// ---------------------------------------------------------------------------
// Managed databases — /v2/databases
// ---------------------------------------------------------------------------

const DATABASE_COLLECTION: Collection = Object.freeze({
	path: "/v2/databases",
	listKey: "databases",
	itemKey: "database",
	nameOf: (record: Readonly<Record<string, unknown>>) =>
		optionalString(record, "name"),
});

/** Engine slugs the DigitalOcean API takes, per catalogued product. */
const DATABASE_ENGINES: Readonly<Record<string, string>> = Object.freeze({
	[DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID]: "pg",
	[DIGITALOCEAN_MANAGED_MYSQL_PRODUCT_ID]: "mysql",
	[DIGITALOCEAN_MANAGED_MONGODB_PRODUCT_ID]: "mongodb",
	[DIGITALOCEAN_MANAGED_OPENSEARCH_PRODUCT_ID]: "opensearch",
	[DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID]: "valkey",
});

/**
 * Outputs never carry the connection URI. DigitalOcean returns
 * `connection.uri` with the password inline, and an output is a value the
 * deployment record keeps — so the host and port go out and the credential
 * stays where it was.
 */
function databaseOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const connection = nestedRecord(record, "connection");
	const host = optionalString(connection, "host");
	const port = optionalInteger(connection, "port");
	const database = optionalString(connection, "database");
	const user = optionalString(connection, "user");
	const status = optionalString(record, "status");
	const engine = optionalString(record, "engine");
	const version = optionalString(record, "version");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(host !== undefined ? { host } : {}),
		...(port !== undefined ? { port } : {}),
		...(database !== undefined ? { database } : {}),
		...(user !== undefined ? { user } : {}),
		...(engine !== undefined ? { engine } : {}),
		...(version !== undefined ? { version } : {}),
		...(status !== undefined ? { status } : {}),
	};
}

function databaseDiagnostics(
	context: DigitalOceanResolverContext,
	record: Readonly<Record<string, unknown>>,
	productId: string,
): readonly string[] {
	const diagnostics: string[] = [];
	const status = optionalString(record, "status");
	if (status !== undefined && status !== "online") {
		diagnostics.push(
			`database cluster is ${status}, not online: DigitalOcean provisions asynchronously and this resolver does not poll, so the create is accepted, not confirmed`,
		);
	}
	const wantedRegion = optionalString(context.desired, "region");
	const actualRegion = optionalString(record, "region");
	if (
		wantedRegion !== undefined &&
		actualRegion !== undefined &&
		wantedRegion !== actualRegion
	) {
		diagnostics.push(
			`database cluster is in ${actualRegion} but the request asks for ${wantedRegion}; a cluster's region is immutable and this resolver never replaces a database, so the drift is reported for a human rather than "fixed" by destroying the data`,
		);
	}
	const wantedEngine = DATABASE_ENGINES[productId];
	const actualEngine = optionalString(record, "engine");
	if (
		wantedEngine !== undefined &&
		actualEngine !== undefined &&
		wantedEngine !== actualEngine
	) {
		diagnostics.push(
			`cluster ${JSON.stringify(context.name)} runs engine ${actualEngine} but ${productId} allocates ${wantedEngine}; the engine is fixed at creation, so this is reported rather than silently adopted as the right product`,
		);
	}
	return diagnostics;
}

function databaseSpec(
	productId: string,
): Omit<DigitalOceanResolverSpec, "productId"> {
	const engine = DATABASE_ENGINES[productId] as string;
	return {
		async read(context) {
			const observed = await findByName(context, DATABASE_COLLECTION);
			return observed === undefined
				? undefined
				: outcome(
						settledAction(context),
						identityOf(observed, `digitalocean read database ${context.name}`),
						databaseOutputs(observed),
						databaseDiagnostics(context, observed, productId),
					);
		},
		async reconcile(context) {
			const observed = await findByName(context, DATABASE_COLLECTION);
			if (observed === undefined) {
				const label = `digitalocean create database ${context.name}`;
				const created = expectOk(
					await send(context, {
						method: "POST",
						path: DATABASE_COLLECTION.path,
						json: {
							name: context.name,
							engine,
							region: requiredRegion(context, productId),
							size: requiredString(
								context,
								"size",
								productId,
								"db-s-1vcpu-1gb",
							),
							num_nodes: optionalInteger(context.desired, "nodeCount") ?? 1,
							...(optionalString(context.desired, "version") !== undefined
								? { version: optionalString(context.desired, "version") }
								: {}),
							...(optionalString(context.desired, "privateNetworkUuid") !==
							undefined
								? {
										private_network_uuid: optionalString(
											context.desired,
											"privateNetworkUuid",
										),
									}
								: {}),
							...(optionalInteger(context.desired, "storageMib") !== undefined
								? {
										storage_size_mib: optionalInteger(
											context.desired,
											"storageMib",
										),
									}
								: {}),
						},
					}),
					label,
				);
				const database = nestedRecord(created, DATABASE_COLLECTION.itemKey);
				return outcome(
					"create",
					identityOf(database, label),
					databaseOutputs(database),
					databaseDiagnostics(context, database, productId),
				);
			}
			const id = identityOf(
				observed,
				`digitalocean read database ${context.name}`,
			);
			const wantedSize = optionalString(context.desired, "size");
			const wantedNodes = optionalInteger(context.desired, "nodeCount");
			const currentSize = optionalString(observed, "size");
			const currentNodes = optionalInteger(observed, "num_nodes");
			const sizeDrift = wantedSize !== undefined && wantedSize !== currentSize;
			const nodeDrift =
				wantedNodes !== undefined && wantedNodes !== currentNodes;
			if (!sizeDrift && !nodeDrift) {
				return outcome(
					settledAction(context),
					id,
					databaseOutputs(observed),
					databaseDiagnostics(context, observed, productId),
				);
			}
			const label = `digitalocean resize database ${context.name}`;
			expectOk(
				await send(context, {
					method: "PUT",
					path: `${DATABASE_COLLECTION.path}/${encodeURIComponent(id)}/resize`,
					json: {
						size: wantedSize ?? currentSize,
						num_nodes: wantedNodes ?? currentNodes ?? 1,
					},
				}),
				label,
			);
			// The resize endpoint answers 202 with no body, so the outputs come
			// from a fresh read rather than from the record we sent — a resolver
			// that echoed the request would report a size the cluster does not
			// have yet.
			const refreshed =
				(await findByName(context, DATABASE_COLLECTION)) ?? observed;
			return outcome("update", id, databaseOutputs(refreshed), [
				...databaseDiagnostics(context, refreshed, productId),
				"resize accepted; DigitalOcean applies it asynchronously and this resolver does not poll, so the new size is requested, not confirmed",
			]);
		},
		async remove(context) {
			const observed = await findByName(context, DATABASE_COLLECTION);
			if (observed === undefined) return;
			const label = `digitalocean delete database ${context.name}`;
			const id = identityOf(observed, label);
			const response = await send(context, {
				method: "DELETE",
				path: `${DATABASE_COLLECTION.path}/${encodeURIComponent(id)}`,
			});
			if (isNotFound(response)) return;
			expectOk(response, label);
		},
	};
}

// ---------------------------------------------------------------------------
// Droplets — /v2/droplets
// ---------------------------------------------------------------------------

const DROPLET_COLLECTION: Collection = Object.freeze({
	path: "/v2/droplets",
	listKey: "droplets",
	itemKey: "droplet",
	nameOf: (record: Readonly<Record<string, unknown>>) =>
		optionalString(record, "name"),
});

function dropletOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const networks = nestedRecord(record, "networks");
	const v4 = Array.isArray(networks.v4) ? networks.v4 : [];
	const publicAddress = v4
		.filter(isPlainObject)
		.find((entry) => optionalString(entry, "type") === "public");
	const privateAddress = v4
		.filter(isPlainObject)
		.find((entry) => optionalString(entry, "type") === "private");
	const region = nestedRecord(record, "region");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(optionalString(record, "status") !== undefined
			? { status: optionalString(record, "status") }
			: {}),
		...(optionalString(record, "size_slug") !== undefined
			? { size: optionalString(record, "size_slug") }
			: {}),
		...(optionalString(region, "slug") !== undefined
			? { region: optionalString(region, "slug") }
			: {}),
		...(publicAddress !== undefined &&
		optionalString(publicAddress, "ip_address") !== undefined
			? { publicIpv4: optionalString(publicAddress, "ip_address") }
			: {}),
		...(privateAddress !== undefined &&
		optionalString(privateAddress, "ip_address") !== undefined
			? { privateIpv4: optionalString(privateAddress, "ip_address") }
			: {}),
	};
}

function dropletDiagnostics(
	context: DigitalOceanResolverContext,
	record: Readonly<Record<string, unknown>>,
): readonly string[] {
	const diagnostics: string[] = [];
	const status = optionalString(record, "status");
	if (status !== undefined && status !== "active") {
		diagnostics.push(
			`droplet is ${status}, not active: DigitalOcean provisions asynchronously and this resolver does not poll, so the create is accepted, not confirmed`,
		);
	}
	const wantedRegion = optionalString(context.desired, "region");
	const actualRegion = optionalString(nestedRecord(record, "region"), "slug");
	if (
		wantedRegion !== undefined &&
		actualRegion !== undefined &&
		wantedRegion !== actualRegion
	) {
		diagnostics.push(
			`droplet is in ${actualRegion} but the request asks for ${wantedRegion}; a droplet cannot be moved between regions and this resolver never replaces one, so the drift is reported for a human`,
		);
	}
	const wantedSize = optionalString(context.desired, "size");
	const actualSize = optionalString(record, "size_slug");
	if (
		wantedSize !== undefined &&
		actualSize !== undefined &&
		wantedSize !== actualSize
	) {
		diagnostics.push(
			`droplet is size ${actualSize} but the request asks for ${wantedSize}; resizing a droplet requires a power-off, which this resolver will not do to a running machine on its own — action left for a human`,
		);
	}
	return diagnostics;
}

const DROPLET_SPEC: Omit<DigitalOceanResolverSpec, "productId"> = {
	async read(context) {
		const observed = await findByName(context, DROPLET_COLLECTION);
		return observed === undefined
			? undefined
			: outcome(
					settledAction(context),
					identityOf(observed, `digitalocean read droplet ${context.name}`),
					dropletOutputs(observed),
					dropletDiagnostics(context, observed),
				);
	},
	async reconcile(context) {
		const observed = await findByName(context, DROPLET_COLLECTION);
		if (observed !== undefined) {
			// Every mutable difference on a Droplet (size, image) needs a
			// power-off or a rebuild, so there is no in-place update path here.
			// Reporting the drift is the honest outcome; "converging" it would
			// mean taking a running machine down without being asked.
			return outcome(
				settledAction(context),
				identityOf(observed, `digitalocean read droplet ${context.name}`),
				dropletOutputs(observed),
				dropletDiagnostics(context, observed),
			);
		}
		const productId = DIGITALOCEAN_DROPLET_PRODUCT_ID;
		const label = `digitalocean create droplet ${context.name}`;
		const created = expectOk(
			await send(context, {
				method: "POST",
				path: DROPLET_COLLECTION.path,
				json: {
					name: context.name,
					region: requiredRegion(context, productId),
					size: requiredString(context, "size", productId, "s-1vcpu-1gb"),
					image: requiredString(
						context,
						"image",
						productId,
						"ubuntu-24-04-x64",
					),
					...(optionalBoolean(context.desired, "backups") !== undefined
						? { backups: optionalBoolean(context.desired, "backups") }
						: {}),
					...(optionalBoolean(context.desired, "monitoring") !== undefined
						? { monitoring: optionalBoolean(context.desired, "monitoring") }
						: {}),
					...(optionalBoolean(context.desired, "ipv6") !== undefined
						? { ipv6: optionalBoolean(context.desired, "ipv6") }
						: {}),
					...(optionalString(context.desired, "vpcUuid") !== undefined
						? { vpc_uuid: optionalString(context.desired, "vpcUuid") }
						: {}),
				},
			}),
			label,
		);
		const record = nestedRecord(created, DROPLET_COLLECTION.itemKey);
		return outcome(
			"create",
			identityOf(record, label),
			dropletOutputs(record),
			dropletDiagnostics(context, record),
		);
	},
	async remove(context) {
		const observed = await findByName(context, DROPLET_COLLECTION);
		if (observed === undefined) return;
		const label = `digitalocean delete droplet ${context.name}`;
		const id = identityOf(observed, label);
		const response = await send(context, {
			method: "DELETE",
			path: `${DROPLET_COLLECTION.path}/${encodeURIComponent(id)}`,
		});
		if (isNotFound(response)) return;
		expectOk(response, label);
	},
};

// ---------------------------------------------------------------------------
// Load balancers — /v2/load_balancers
// ---------------------------------------------------------------------------

const LOAD_BALANCER_COLLECTION: Collection = Object.freeze({
	path: "/v2/load_balancers",
	listKey: "load_balancers",
	itemKey: "load_balancer",
	nameOf: (record: Readonly<Record<string, unknown>>) =>
		optionalString(record, "name"),
});

/**
 * The default forwarding rule. A load balancer with no rule forwards nothing,
 * and DigitalOcean rejects the create — so an unstated rule set becomes plain
 * HTTP 80→80, which is stated here rather than left as a surprise inside the
 * request body.
 */
const DEFAULT_FORWARDING_RULES = Object.freeze([
	Object.freeze({
		entry_protocol: "http",
		entry_port: 80,
		target_protocol: "http",
		target_port: 80,
	}),
]);

function loadBalancerOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const region = nestedRecord(record, "region");
	return {
		...(optionalString(record, "name") !== undefined
			? { name: optionalString(record, "name") }
			: {}),
		...(optionalString(record, "ip") !== undefined
			? { ip: optionalString(record, "ip") }
			: {}),
		...(optionalString(record, "status") !== undefined
			? { status: optionalString(record, "status") }
			: {}),
		...(optionalString(record, "algorithm") !== undefined
			? { algorithm: optionalString(record, "algorithm") }
			: {}),
		...(optionalString(region, "slug") !== undefined
			? { region: optionalString(region, "slug") }
			: {}),
	};
}

function loadBalancerDiagnostics(
	record: Readonly<Record<string, unknown>>,
): readonly string[] {
	const status = optionalString(record, "status");
	return status !== undefined && status !== "active"
		? [
				`load balancer is ${status}, not active: DigitalOcean provisions asynchronously and this resolver does not poll, so the create is accepted, not confirmed`,
			]
		: [];
}

function loadBalancerBody(
	context: DigitalOceanResolverContext,
): Record<string, unknown> {
	const rules = context.desired.forwardingRules;
	return {
		name: context.name,
		region: requiredRegion(context, DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID),
		forwarding_rules: Array.isArray(rules) ? rules : DEFAULT_FORWARDING_RULES,
		...(optionalString(context.desired, "algorithm") !== undefined
			? { algorithm: optionalString(context.desired, "algorithm") }
			: {}),
		...(optionalInteger(context.desired, "sizeUnit") !== undefined
			? { size_unit: optionalInteger(context.desired, "sizeUnit") }
			: {}),
		...(optionalBoolean(context.desired, "redirectHttpToHttps") !== undefined
			? {
					redirect_http_to_https: optionalBoolean(
						context.desired,
						"redirectHttpToHttps",
					),
				}
			: {}),
		...(optionalString(context.desired, "vpcUuid") !== undefined
			? { vpc_uuid: optionalString(context.desired, "vpcUuid") }
			: {}),
	};
}

const LOAD_BALANCER_SPEC: Omit<DigitalOceanResolverSpec, "productId"> = {
	async read(context) {
		const observed = await findByName(context, LOAD_BALANCER_COLLECTION);
		return observed === undefined
			? undefined
			: outcome(
					settledAction(context),
					identityOf(
						observed,
						`digitalocean read load balancer ${context.name}`,
					),
					loadBalancerOutputs(observed),
					loadBalancerDiagnostics(observed),
				);
	},
	async reconcile(context) {
		const observed = await findByName(context, LOAD_BALANCER_COLLECTION);
		if (observed === undefined) {
			const label = `digitalocean create load balancer ${context.name}`;
			const created = expectOk(
				await send(context, {
					method: "POST",
					path: LOAD_BALANCER_COLLECTION.path,
					json: loadBalancerBody(context),
				}),
				label,
			);
			const record = nestedRecord(created, LOAD_BALANCER_COLLECTION.itemKey);
			return outcome(
				"create",
				identityOf(record, label),
				loadBalancerOutputs(record),
				loadBalancerDiagnostics(record),
			);
		}
		const id = identityOf(
			observed,
			`digitalocean read load balancer ${context.name}`,
		);
		const wantedAlgorithm = optionalString(context.desired, "algorithm");
		const wantedRedirect = optionalBoolean(
			context.desired,
			"redirectHttpToHttps",
		);
		const algorithmDrift =
			wantedAlgorithm !== undefined &&
			wantedAlgorithm !== optionalString(observed, "algorithm");
		const redirectDrift =
			wantedRedirect !== undefined &&
			wantedRedirect !== optionalBoolean(observed, "redirect_http_to_https");
		if (!algorithmDrift && !redirectDrift) {
			return outcome(
				settledAction(context),
				id,
				loadBalancerOutputs(observed),
				loadBalancerDiagnostics(observed),
			);
		}
		// DigitalOcean's load-balancer PUT is a full replace, not a patch: a
		// partial body silently clears the fields it omits. The body is
		// therefore rebuilt from `desired` in full rather than from the delta.
		const label = `digitalocean update load balancer ${context.name}`;
		const updated = expectOk(
			await send(context, {
				method: "PUT",
				path: `${LOAD_BALANCER_COLLECTION.path}/${encodeURIComponent(id)}`,
				json: loadBalancerBody(context),
			}),
			label,
		);
		const record = nestedRecord(updated, LOAD_BALANCER_COLLECTION.itemKey);
		return outcome(
			"update",
			id,
			loadBalancerOutputs(record),
			loadBalancerDiagnostics(record),
		);
	},
	async remove(context) {
		const observed = await findByName(context, LOAD_BALANCER_COLLECTION);
		if (observed === undefined) return;
		const label = `digitalocean delete load balancer ${context.name}`;
		const id = identityOf(observed, label);
		const response = await send(context, {
			method: "DELETE",
			path: `${LOAD_BALANCER_COLLECTION.path}/${encodeURIComponent(id)}`,
		});
		if (isNotFound(response)) return;
		expectOk(response, label);
	},
};

// ---------------------------------------------------------------------------
// App Platform — /v2/apps
// ---------------------------------------------------------------------------

const APP_COLLECTION: Collection = Object.freeze({
	path: "/v2/apps",
	listKey: "apps",
	itemKey: "app",
	// An app's name lives inside its spec, not at the record root.
	nameOf: (record: Readonly<Record<string, unknown>>) =>
		optionalString(nestedRecord(record, "spec"), "name"),
});

function appOutputs(
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const spec = nestedRecord(record, "spec");
	const liveUrl = optionalString(record, "live_url");
	const ingress = optionalString(record, "default_ingress");
	const phase = optionalString(
		nestedRecord(record, "active_deployment"),
		"phase",
	);
	return {
		...(optionalString(spec, "name") !== undefined
			? { name: optionalString(spec, "name") }
			: {}),
		...(optionalString(spec, "region") !== undefined
			? { region: optionalString(spec, "region") }
			: {}),
		...(liveUrl !== undefined ? { url: liveUrl } : {}),
		...(ingress !== undefined ? { defaultIngress: ingress } : {}),
		...(phase !== undefined ? { phase } : {}),
	};
}

function appDiagnostics(
	record: Readonly<Record<string, unknown>>,
): readonly string[] {
	const diagnostics: string[] = [];
	if (optionalString(record, "live_url") === undefined) {
		diagnostics.push(
			"the app has no live_url yet: App Platform builds and deploys asynchronously and this resolver does not poll, so the create is accepted, not confirmed",
		);
	}
	const phase = optionalString(
		nestedRecord(record, "active_deployment"),
		"phase",
	);
	if (phase !== undefined && phase !== "ACTIVE") {
		diagnostics.push(
			`the active deployment is in phase ${phase}, not ACTIVE; the app spec was accepted but the rollout it triggered has not finished`,
		);
	}
	return diagnostics;
}

/**
 * The app spec the caller authored, with the name forced to the resolver's
 * deterministic name.
 *
 * `desired.spec` is passed through rather than assembled field by field: an App
 * Platform spec carries services, static sites, workers, jobs, databases,
 * domains, ingress rules and env var *references*, and a resolver that rebuilt
 * a subset of that would silently drop everything it did not know about on the
 * next reconcile. The one field this resolver owns is `name`, because the name
 * is what makes the lookup convergent.
 */
function appSpec(
	context: DigitalOceanResolverContext,
	productId: string,
): Record<string, unknown> {
	const spec = context.desired.spec;
	if (!isPlainObject(spec)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${productId}: the request carries no desired.spec. An App Platform app is defined by its spec (services, static sites, env var references, ingress); this resolver forwards the spec you authored and owns only its name, because inventing a spec would deploy something nobody wrote`,
		);
	}
	return { ...spec, name: context.name };
}

function appSpecEqual(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean {
	return stableJson(left) === stableJson(right);
}

/** Key-sorted JSON, so a spec compare does not depend on key order. */
function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableJson(item)).join(",")}]`;
	}
	if (isPlainObject(value)) {
		return `{${Object.keys(value)
			.sort(compareStrings)
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function appPlatformSpec(
	productId: string,
): Omit<DigitalOceanResolverSpec, "productId"> {
	return {
		async read(context) {
			const observed = await findByName(context, APP_COLLECTION);
			return observed === undefined
				? undefined
				: outcome(
						settledAction(context),
						identityOf(observed, `digitalocean read app ${context.name}`),
						appOutputs(observed),
						appDiagnostics(observed),
					);
		},
		async reconcile(context) {
			const spec = appSpec(context, productId);
			const observed = await findByName(context, APP_COLLECTION);
			if (observed === undefined) {
				const label = `digitalocean create app ${context.name}`;
				const created = expectOk(
					await send(context, {
						method: "POST",
						path: APP_COLLECTION.path,
						json: { spec },
					}),
					label,
				);
				const record = nestedRecord(created, APP_COLLECTION.itemKey);
				return outcome(
					"create",
					identityOf(record, label),
					appOutputs(record),
					appDiagnostics(record),
				);
			}
			const id = identityOf(observed, `digitalocean read app ${context.name}`);
			if (appSpecEqual(spec, nestedRecord(observed, "spec"))) {
				return outcome(
					settledAction(context),
					id,
					appOutputs(observed),
					appDiagnostics(observed),
				);
			}
			const label = `digitalocean update app ${context.name}`;
			const updated = expectOk(
				await send(context, {
					method: "PUT",
					path: `${APP_COLLECTION.path}/${encodeURIComponent(id)}`,
					json: { spec },
				}),
				label,
			);
			const record = nestedRecord(updated, APP_COLLECTION.itemKey);
			return outcome("update", id, appOutputs(record), [
				...appDiagnostics(record),
				"the updated spec triggers a new App Platform deployment; this resolver does not poll it, so the rollout is requested, not confirmed",
			]);
		},
		async remove(context) {
			const observed = await findByName(context, APP_COLLECTION);
			if (observed === undefined) return;
			const label = `digitalocean delete app ${context.name}`;
			const id = identityOf(observed, label);
			const response = await send(context, {
				method: "DELETE",
				path: `${APP_COLLECTION.path}/${encodeURIComponent(id)}`,
			});
			if (isNotFound(response)) return;
			expectOk(response, label);
		},
	};
}

// ---------------------------------------------------------------------------
// Wrapper and registry
// ---------------------------------------------------------------------------

/** Per-product behaviour; the wrapper owns credentials, naming, and refusals. */
interface DigitalOceanResolverSpec {
	readonly productId: string;
	reconcile(context: DigitalOceanResolverContext): Promise<ResolveOutcome>;
	read(
		context: DigitalOceanResolverContext,
	): Promise<ResolveOutcome | undefined>;
	remove(context: DigitalOceanResolverContext): Promise<void>;
}

function createResolver(
	spec: DigitalOceanResolverSpec,
	options: DigitalOceanResolverOptions,
): ResourceResolver {
	const maxListPages = assertListPages(options.maxListPages);
	if (typeof options.resolveCredential !== "function") {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			"digitalocean resolvers need an injected resolveCredential(ref): the resolver never reads an environment variable or a credential file itself",
		);
	}

	async function contextFor(
		request: ResolveRequest,
		transport: HttpTransport,
	): Promise<DigitalOceanResolverContext> {
		if (request.ref.productId !== spec.productId) {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`digitalocean resolver for ${spec.productId} was handed a request for ${JSON.stringify(request.ref.productId)}; route the request through the registry rather than picking a resolver by hand`,
				spec.productId,
			);
		}
		const token = await resolveToken(request, options.resolveCredential);
		return {
			request,
			transport,
			token,
			name: resourceName(request, spec.productId),
			desired: request.desired,
			knownPhysicalId: knownPhysicalId(request),
			maxListPages,
		};
	}

	return {
		providerId: DIGITALOCEAN_PROVIDER_TARGET,
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
 * Every DigitalOcean resolver, id-sorted so the list is a function of the code
 * rather than of construction order. The five catalogued products that are
 * absent are named in {@link DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS}, with the
 * reason.
 */
export function digitaloceanResolvers(
	options: DigitalOceanResolverOptions,
): readonly ResourceResolver[] {
	const specs: readonly DigitalOceanResolverSpec[] = [
		{
			productId: DIGITALOCEAN_APP_SERVICE_PRODUCT_ID,
			...appPlatformSpec(DIGITALOCEAN_APP_SERVICE_PRODUCT_ID),
		},
		{
			productId: DIGITALOCEAN_APP_STATIC_SITE_PRODUCT_ID,
			...appPlatformSpec(DIGITALOCEAN_APP_STATIC_SITE_PRODUCT_ID),
		},
		{ productId: DIGITALOCEAN_DROPLET_PRODUCT_ID, ...DROPLET_SPEC },
		{
			productId: DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID,
			...LOAD_BALANCER_SPEC,
		},
		{
			productId: DIGITALOCEAN_MANAGED_MONGODB_PRODUCT_ID,
			...databaseSpec(DIGITALOCEAN_MANAGED_MONGODB_PRODUCT_ID),
		},
		{
			productId: DIGITALOCEAN_MANAGED_MYSQL_PRODUCT_ID,
			...databaseSpec(DIGITALOCEAN_MANAGED_MYSQL_PRODUCT_ID),
		},
		{
			productId: DIGITALOCEAN_MANAGED_OPENSEARCH_PRODUCT_ID,
			...databaseSpec(DIGITALOCEAN_MANAGED_OPENSEARCH_PRODUCT_ID),
		},
		{
			productId: DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID,
			...databaseSpec(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID),
		},
		{
			productId: DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID,
			...databaseSpec(DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID),
		},
	];
	return Object.freeze(
		[...specs]
			.sort((left, right) => compareStrings(left.productId, right.productId))
			.map((spec) => createResolver(spec, options)),
	);
}

/** The same resolvers, behind core's product-id lookup. */
export function digitaloceanResolverRegistry(
	options: DigitalOceanResolverOptions,
): {
	get(productId: string): ResourceResolver | undefined;
	list(): readonly ResourceResolver[];
} {
	return createResolverRegistry(digitaloceanResolvers(options));
}
