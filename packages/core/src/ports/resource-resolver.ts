/**
 * The contract every provider resource resolver implements.
 *
 * HoBo's default deployment path calls provider REST APIs directly: there is
 * no IaC engine holding a state file and no plan/apply round trip. What
 * replaces it is this — one convergent `reconcile` per product, handed an
 * already-guarded `HttpTransport`. The resolver is the only thing that knows
 * a provider's wire shape; everything above it sees `ResolveRequest` in and
 * `ResolveOutcome` out.
 *
 * `reconcile` is required to be convergent and idempotent. Running it twice
 * against the same desired state must yield the same outcome and exactly one
 * resource, which is why the outcome names an `action` rather than a bare
 * success: a caller that cannot tell `create` from `noop` cannot tell a
 * working deploy from a duplicate one. `adopt` is the honest name for finding
 * a pre-existing resource that matches, and `read` is what makes adoption and
 * state recovery possible without a state file.
 *
 * The hard law here is that **the app never holds credential material**.
 * `credentialRef` is a locator — `scheme://…` — resolved by the host at the
 * moment of the call, never a connection string, bearer token, or PEM.
 * `parseResolveRequest` refuses anything value-shaped with
 * `RESOLVER_CREDENTIAL_NOT_A_REF`, because a secret that reaches this record
 * reaches the event log, the plan digest, and every diagnostic printed from
 * them. The same screen runs over `desired`, `observed`, and `outputs`: a
 * credential-shaped key in a property bag is exactly as leaked as one in the
 * ref field.
 *
 * Determinism: parsed records are deep-frozen with property keys sorted by
 * code unit, and `createResolverRegistry` lists id-sorted rather than in
 * registration order, so a catalog dump is a function of its contents and not
 * of import order. No clock, no randomness, no ambient environment reads.
 */

import { deepFreeze } from "../parse-utils.js";
import { CAPABILITY_SLOTS, type CapabilitySlot } from "./capability-slot.js";
import type { HttpTransport } from "./http-transport.js";

// public-contract: versioned identity stamped on every resolver outcome.
export const RESOLVER_CONTRACT = "hobo.resource-resolver/v1";

// public-contract: the closed set of outcomes a reconcile may report.
export const RESOLVER_ACTIONS = Object.freeze([
	"create",
	"update",
	"replace",
	"delete",
	"adopt",
	"noop",
] as const);
export type ResolverAction = (typeof RESOLVER_ACTIONS)[number];

/** Author-facing id grammar: stable across deploys, safe in a path segment. */
const LOGICAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
/** Provider/product id grammar, bounded so an id cannot smuggle a payload. */
const RESOLVER_ID_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,127}$/u;
/**
 * A locator names where material lives; it never carries the material. The
 * body is the RFC 3986 character set minus `@`, so whitespace, control
 * characters, and embedded userinfo are all excluded by construction rather
 * than by a screen that could be reordered away.
 */
const CREDENTIAL_LOCATOR_PATTERN =
	/^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9\-._~:/?#[\]!$&'()*+,;=%]+$/u;
/** Longest locator accepted: past this a "ref" is carrying a payload. */
const MAX_CREDENTIAL_REF_LENGTH = 512;
/** Property keys that read as a secret value rather than a locator. */
const CREDENTIAL_KEY_PATTERN =
	/(secret|password|token|credential|private[_-]?key|api[_-]?key)/i;
/** A PEM block, a scheme-less auth header, and a JWT: all material, not refs. */
const PEM_PATTERN = /-{3,}\s*BEGIN\b/u;
const AUTH_SCHEME_PATTERN = /^(?:bearer|basic|digest)\s/iu;
const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\./u;

// domain-view: parse-time derived type; wire form is ResolvedResourceRefRecord in data-models/resource_resolver.proto.
export interface ResolvedResourceRef {
	readonly slot: CapabilitySlot;
	readonly productId: string;
	/** Stable author-facing id: the identity a redeploy reconciles against. */
	readonly logicalId: string;
	/** Provider-assigned id, present once the resource exists. */
	readonly physicalId?: string;
}

// domain-view: parse-time derived type; wire form is ResolveRequestRecord in data-models/resource_resolver.proto.
export interface ResolveRequest {
	readonly ref: ResolvedResourceRef;
	/** Realization parameters: the desired state, non-sensitive only. */
	readonly desired: Readonly<Record<string, unknown>>;
	/** Last known provider outputs, when the caller has them. */
	readonly observed?: Readonly<Record<string, unknown>>;
	/** LOCATOR only, never a value. See the module note on the credential law. */
	readonly credentialRef: string;
}

// domain-view: parse-time derived type; wire form is ResolveOutcomeRecord in data-models/resource_resolver.proto.
export interface ResolveOutcome {
	readonly contract: typeof RESOLVER_CONTRACT;
	readonly action: ResolverAction;
	readonly physicalId: string;
	readonly outputs: Readonly<Record<string, unknown>>;
	readonly diagnostics: readonly string[];
}

/**
 * One provider product's resolver. Implementations live in provider packages;
 * this package owns only the shape and the parse boundaries around it.
 */
export interface ResourceResolver {
	readonly providerId: string;
	readonly productId: string;
	/** Convergent and idempotent: running twice must yield the same outcome
	 *  and one resource. */
	reconcile(
		request: ResolveRequest,
		transport: HttpTransport,
	): Promise<ResolveOutcome>;
	delete(request: ResolveRequest, transport: HttpTransport): Promise<void>;
	/** Does it exist and is it ours? Powers adoption and state recovery. */
	read?(
		request: ResolveRequest,
		transport: HttpTransport,
	): Promise<ResolveOutcome | undefined>;
}

// public-contract: every refusal the resolver contract can report.
export const RESOLVER_ERROR_CODES = Object.freeze([
	"RESOLVER_CREDENTIAL_MISSING",
	"RESOLVER_CREDENTIAL_NOT_A_REF",
	"RESOLVER_PRODUCT_UNSUPPORTED",
	"RESOLVER_PROVIDER_REJECTED",
	"RESOLVER_OUTPUT_UNPARSEABLE",
] as const);
export type ResolverErrorCode = (typeof RESOLVER_ERROR_CODES)[number];

/**
 * Refusal from a resolver or one of its parse boundaries. Always carries a
 * code; `productId` is set when the refusal happened after the product was
 * recognized, so remediation can name the resolver to fix.
 */
export class ResolverError extends Error {
	readonly code: ResolverErrorCode;
	readonly productId?: string;

	constructor(code: ResolverErrorCode, message: string, productId?: unknown) {
		super(message);
		this.name = "ResolverError";
		this.code = code;
		if (typeof productId === "string" && productId.length > 0) {
			this.productId = productId;
		}
	}
}

/**
 * Parse boundary for an inbound resolve request. Returns a deep-frozen record
 * whose property-bag keys are sorted, so two authorings of the same request
 * are deep-equal and hash identically.
 */
export function parseResolveRequest(input: unknown): ResolveRequest {
	const source = expectRecord(
		input,
		"resolve request",
		"RESOLVER_PRODUCT_UNSUPPORTED",
	);
	const ref = parseResolvedResourceRef(source.ref);
	const credentialRef = parseCredentialRef(source.credentialRef, ref.productId);
	const desired = canonicalizeBag(
		source.desired,
		"desired",
		ref.productId,
		"RESOLVER_PRODUCT_UNSUPPORTED",
	);
	const observed =
		source.observed === undefined
			? undefined
			: canonicalizeBag(
					source.observed,
					"observed",
					ref.productId,
					"RESOLVER_PRODUCT_UNSUPPORTED",
				);

	return deepFreeze({
		ref,
		desired,
		...(observed !== undefined ? { observed } : {}),
		credentialRef,
	});
}

/**
 * Parse boundary for whatever a resolver hands back. A provider driver is the
 * least trusted code in the deploy path — it is shaped by a remote API's
 * response — so its output crosses a boundary like any other external input.
 */
export function parseResolveOutcome(input: unknown): ResolveOutcome {
	const source = expectRecord(
		input,
		"resolve outcome",
		"RESOLVER_OUTPUT_UNPARSEABLE",
	);
	if (source.contract !== RESOLVER_CONTRACT) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`contract: expected ${JSON.stringify(RESOLVER_CONTRACT)}, received ${JSON.stringify(source.contract)}`,
		);
	}
	const action = source.action;
	if (
		typeof action !== "string" ||
		!(RESOLVER_ACTIONS as readonly string[]).includes(action)
	) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`action: expected ${RESOLVER_ACTIONS.join(" | ")}, received ${JSON.stringify(action)}; an outcome that cannot name its action cannot tell a create from a duplicate`,
		);
	}
	const physicalId = source.physicalId;
	if (typeof physicalId !== "string" || physicalId.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`physicalId: expected the provider-assigned id as a non-empty string, received ${JSON.stringify(physicalId)}`,
		);
	}
	const outputs = canonicalizeBag(
		source.outputs,
		"outputs",
		undefined,
		"RESOLVER_OUTPUT_UNPARSEABLE",
	);
	const diagnostics = parseDiagnostics(source.diagnostics);

	return deepFreeze({
		contract: RESOLVER_CONTRACT,
		action: action as ResolverAction,
		physicalId,
		outputs,
		diagnostics,
	});
}

/**
 * Index resolvers by product. Listing is id-sorted rather than registration
 * ordered so a catalog dump is a function of its contents; a duplicate
 * `productId` is refused rather than last-write-wins, because a silently
 * shadowed resolver is a deploy calling a provider nobody reviewed.
 */
export function createResolverRegistry(
	resolvers: readonly ResourceResolver[],
): {
	get(productId: string): ResourceResolver | undefined;
	list(): readonly ResourceResolver[];
} {
	if (!Array.isArray(resolvers)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			"resolver registry: expected an array of resolvers",
		);
	}
	const byProduct = new Map<string, ResourceResolver>();
	for (const resolver of resolvers) {
		assertResolverShape(resolver);
		const existing = byProduct.get(resolver.productId);
		if (existing !== undefined) {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`productId ${JSON.stringify(resolver.productId)} is registered by both ${JSON.stringify(existing.providerId)} and ${JSON.stringify(resolver.providerId)}: a duplicate makes the product unroutable, so it is refused rather than shadowed`,
				resolver.productId,
			);
		}
		byProduct.set(resolver.productId, resolver);
	}

	const ordered = Object.freeze(
		[...byProduct.values()].sort((left, right) =>
			compare(left.productId, right.productId),
		),
	);

	return Object.freeze({
		get(productId: string): ResourceResolver | undefined {
			return byProduct.get(productId);
		},
		list(): readonly ResourceResolver[] {
			return ordered;
		},
	});
}

function assertResolverShape(
	value: unknown,
): asserts value is ResourceResolver {
	if (value === null || typeof value !== "object") {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`resolver registry: expected a resolver object, received ${describe(value)}`,
		);
	}
	const candidate = value as Record<string, unknown>;
	for (const field of ["providerId", "productId"] as const) {
		const id = candidate[field];
		if (typeof id !== "string" || !RESOLVER_ID_PATTERN.test(id)) {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`resolver ${field}: expected a lowercase id matching ${RESOLVER_ID_PATTERN.source}, received ${JSON.stringify(id)}`,
			);
		}
	}
	for (const method of ["reconcile", "delete"] as const) {
		if (typeof candidate[method] !== "function") {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`resolver ${JSON.stringify(candidate.productId)} is missing the required ${method}() method`,
				candidate.productId,
			);
		}
	}
}

function parseResolvedResourceRef(value: unknown): ResolvedResourceRef {
	const source = expectRecord(
		value,
		"resolve request ref",
		"RESOLVER_PRODUCT_UNSUPPORTED",
	);
	const slot = source.slot;
	if (
		typeof slot !== "string" ||
		!(CAPABILITY_SLOTS as readonly string[]).includes(slot)
	) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`ref.slot: expected ${CAPABILITY_SLOTS.join(" | ")}, received ${JSON.stringify(slot)}`,
		);
	}
	const productId = source.productId;
	if (typeof productId !== "string" || !RESOLVER_ID_PATTERN.test(productId)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`ref.productId: expected a lowercase id matching ${RESOLVER_ID_PATTERN.source}, received ${JSON.stringify(productId)}; a request that names no product cannot be routed to a resolver`,
		);
	}
	const logicalId = source.logicalId;
	if (typeof logicalId !== "string" || !LOGICAL_ID_PATTERN.test(logicalId)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`ref.logicalId: expected a stable author id matching ${LOGICAL_ID_PATTERN.source}, received ${JSON.stringify(logicalId)}`,
			productId,
		);
	}
	const physicalId = source.physicalId;
	if (
		physicalId !== undefined &&
		(typeof physicalId !== "string" || physicalId.trim().length === 0)
	) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`ref.physicalId: expected a non-empty provider id when present, received ${JSON.stringify(physicalId)}`,
			productId,
		);
	}

	return {
		slot: slot as CapabilitySlot,
		productId,
		logicalId,
		...(physicalId !== undefined ? { physicalId } : {}),
	};
}

/**
 * The credential law, enforced. Every refusal below is a value the caller was
 * about to put in a record that gets logged, hashed, and replayed.
 */
function parseCredentialRef(value: unknown, productId: string): string {
	if (value === undefined || value === null) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			"credentialRef: required — a resolver is never called without a locator naming the credential the host will resolve",
			productId,
		);
	}
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`credentialRef: expected a non-empty locator string, received ${describe(value)}`,
			productId,
		);
	}
	const reason = credentialValueShape(value);
	if (reason !== undefined) {
		// The offending value is never echoed: this refusal exists precisely
		// because the value is material.
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			`credentialRef: ${reason} — pass a scheme://… locator the host resolves at call time, never the material itself`,
			productId,
		);
	}
	return value;
}

/** Returns why a string reads as material, or `undefined` if it is a locator. */
function credentialValueShape(value: string): string | undefined {
	if (value.length > MAX_CREDENTIAL_REF_LENGTH) {
		return `it is ${value.length} characters, past the ${MAX_CREDENTIAL_REF_LENGTH}-character locator bound`;
	}
	if (/\s/u.test(value)) {
		return "it contains whitespace, which no locator does";
	}
	if (PEM_PATTERN.test(value)) return "it looks like a PEM block";
	if (AUTH_SCHEME_PATTERN.test(value)) {
		return "it looks like an Authorization header value";
	}
	if (JWT_PATTERN.test(value)) return "it looks like a JWT";
	if (value.includes("@")) {
		return "it embeds userinfo, which is how a connection string carries a password";
	}
	if (!CREDENTIAL_LOCATOR_PATTERN.test(value)) {
		return "it is not a scheme://… locator";
	}
	const query = value.slice(value.indexOf("://") + 3).split("?")[1];
	if (query !== undefined) {
		for (const pair of query.split("&")) {
			const [name = "", inline = ""] = pair.split("=");
			if (CREDENTIAL_KEY_PATTERN.test(name) && inline.length > 0) {
				return `its query carries an inline ${name} parameter`;
			}
		}
	}
	return undefined;
}

function parseDiagnostics(value: unknown): readonly string[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`diagnostics: expected an array of strings, received ${describe(value)}`,
		);
	}
	const out: string[] = [];
	for (const [index, entry] of value.entries()) {
		if (typeof entry !== "string" || entry.trim().length === 0) {
			throw new ResolverError(
				"RESOLVER_OUTPUT_UNPARSEABLE",
				`diagnostics[${index}]: expected a non-empty string, received ${describe(entry)}`,
			);
		}
		out.push(entry);
	}
	// Order is preserved, not sorted: diagnostics narrate a sequence, and a
	// sorted narrative is a scrambled one.
	return Object.freeze(out);
}

/**
 * Canonicalize one property bag: JSON-safe values only, keys sorted by code
 * unit, credential-shaped keys refused at any depth. A secret nested one level
 * down is exactly as leaked as one at the root.
 */
function canonicalizeBag(
	value: unknown,
	field: string,
	productId: string | undefined,
	shapeCode: ResolverErrorCode,
): Readonly<Record<string, unknown>> {
	if (value === undefined) return {};
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new ResolverError(
			shapeCode,
			`${field}: expected a JSON object, received ${describe(value)}`,
			productId,
		);
	}
	return canonicalizeRecord(
		value as Record<string, unknown>,
		field,
		productId,
		shapeCode,
		new Set<object>(),
	);
}

function canonicalizeRecord(
	record: Readonly<Record<string, unknown>>,
	path: string,
	productId: string | undefined,
	shapeCode: ResolverErrorCode,
	seen: Set<object>,
): Readonly<Record<string, unknown>> {
	enterCycleGuard(record, path, productId, shapeCode, seen);
	const out: Record<string, unknown> = {};
	// Code-unit sort: locale-independent so two authorings agree byte for byte.
	for (const key of Object.keys(record).sort(compare)) {
		if (CREDENTIAL_KEY_PATTERN.test(key)) {
			throw new ResolverError(
				"RESOLVER_CREDENTIAL_NOT_A_REF",
				`${path}.${key}: a resolver property bag carries no credential material — name the secret with a scheme://… locator and let the host resolve it at call time`,
				productId,
			);
		}
		out[key] = canonicalizeValue(
			record[key],
			`${path}.${key}`,
			productId,
			shapeCode,
			seen,
		);
	}
	seen.delete(record);
	return out;
}

function canonicalizeValue(
	value: unknown,
	path: string,
	productId: string | undefined,
	shapeCode: ResolverErrorCode,
	seen: Set<object>,
): unknown {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new ResolverError(
				shapeCode,
				`${path}: ${String(value)} has no JSON representation`,
				productId,
			);
		}
		return value;
	}
	if (Array.isArray(value)) {
		enterCycleGuard(value, path, productId, shapeCode, seen);
		const out = value.map((entry, index) =>
			canonicalizeValue(entry, `${path}[${index}]`, productId, shapeCode, seen),
		);
		seen.delete(value);
		return out;
	}
	if (isPlainObject(value)) {
		return canonicalizeRecord(value, path, productId, shapeCode, seen);
	}
	throw new ResolverError(
		shapeCode,
		`${path}: expected a JSON-safe value (null, boolean, finite number, string, array, plain object), received ${describe(value)}`,
		productId,
	);
}

function enterCycleGuard(
	value: object,
	path: string,
	productId: string | undefined,
	shapeCode: ResolverErrorCode,
	seen: Set<object>,
): void {
	if (seen.has(value)) {
		throw new ResolverError(
			shapeCode,
			`${path}: the property bag contains a cycle, which has no JSON representation`,
			productId,
		);
	}
	seen.add(value);
}

function expectRecord(
	value: unknown,
	label: string,
	code: ResolverErrorCode,
): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new ResolverError(
			code,
			`${label}: expected an object, received ${describe(value)}`,
		);
	}
	return value as Record<string, unknown>;
}

/** Plain data only: a class instance carries behavior a record cannot serialize. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "object") {
		const name: unknown = value.constructor?.name;
		return typeof name === "string"
			? `a ${name} instance`
			: "a non-plain object";
	}
	return `a ${typeof value}`;
}

/** Code-unit comparison: locale-independent so ordering is reproducible. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
