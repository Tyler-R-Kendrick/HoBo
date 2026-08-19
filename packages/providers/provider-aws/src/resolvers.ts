/**
 * Direct AWS service-API resource resolvers — the default deployment path.
 *
 * Why this module exists: this package used to publish an allocatable AWS
 * catalog and ship no `ResourceResolver`, so a deploy against an AWS Yard
 * failed closed. These resolvers close that gap the same way the Cloudflare
 * and Vercel ones do: a `ResourceResolver` per product talks to the AWS
 * service API over an injected, guarded transport and reconciles one resource
 * at a time. There is no IaC engine, no state file, and no plan/apply round
 * trip between "what the Yard says can be allocated" and "what exists in the
 * account".
 *
 * The property that makes that safe is **convergence**. Every `reconcile()`
 * here is read-or-create: it asks AWS whether the deterministically-named
 * resource already exists — by a direct describe where the API offers one, by
 * a bounded paged list where it does not — *before* it creates anything, then
 * applies only the mutable deltas. Running it twice produces the same
 * `physicalId`, exactly one resource, and exactly one create call, which is
 * what makes a crashed half-apply safe to re-run instead of something an
 * operator reconciles by hand. `delete()` treats "already gone" as success for
 * the same reason. `"replace"` is never emitted: replacing a bucket or a table
 * destroys data, so drift on an immutable field is reported as a diagnostic
 * and left for a human.
 *
 * A product with no convergent path ships **no resolver** rather than a
 * plausible one — see {@link AWS_UNRESOLVED_PRODUCT_IDS}, which names each one
 * and why. A resolver that duplicates a resource on every retry is worse than
 * an absent one.
 *
 * AWS does not take a bearer token. Every request is signed with SigV4 by
 * `@hobo/core/aws-sigv4`, whose signer is pinned against the official
 * `aws-sig-v4-test-suite` vectors in `@hobo/core`'s tests — the only proof of
 * a signer available to a repo that cannot reach the live API. Credentials are
 * *locators*: a resolver is constructed with an injected
 * `resolveCredential(ref)`, `ResolveRequest.credentialRef` must match core's
 * `scheme://path` grammar, and material appears in exactly one place — the
 * `authorization` request header — never in an outcome, a diagnostic, or a
 * message. Provider error text is redacted before it reaches any of those,
 * because AWS echoes request context (including the access key id) in error
 * bodies.
 *
 * Three wire shapes, handled honestly rather than pretended into one:
 *   - **REST-XML** (S3): the operation is the HTTP method plus a subresource
 *     query; responses are XML.
 *   - **REST-JSON with a target header** (DynamoDB, Secrets Manager, SSM):
 *     `POST /` with `x-amz-target` naming the operation and a JSON body.
 *   - **Query protocol** (SQS, SNS): `POST /` with an `Action=…` form body and
 *     an XML response.
 *
 * Determinism: no clock and no randomness in request formation. SigV4 does
 * genuinely need a timestamp, so it is injected (`AwsResolverOptions.nowMs`)
 * and never read from `Date.now()` here, which is what makes a signed request
 * byte-stable in a test.
 *
 * HONEST SCOPE (also in the README):
 *   - These resolvers are exercised against an *injected fake* transport
 *     modelling an AWS account. Nothing in this package proves a live deploy:
 *     that additionally needs real credentials, real network egress, and a
 *     real AWS account, none of which a unit test supplies.
 *   - The `productId` strings are read off the `./slots.js` factories, so the
 *     resolver registry and the Yard catalog cannot drift apart. Whether a
 *     matching Resource Definition is registered in the catalog is still
 *     checked at resolution time (`YARD_BINDING_PRODUCT_UNKNOWN`), not here.
 *   - Coverage is a slice of each service's API — enough to allocate, observe,
 *     converge, and remove the resource — and explicitly not the whole
 *     surface. The exact endpoints are named in the README.
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

import { AWS_PROVIDER_TARGET } from "./options.js";
import {
	dynamodb,
	s3,
	secretsManager,
	sns,
	sqs,
	sqsFifo,
	ssmParameterStore,
} from "./slots.js";
import {
	AWS_MAX_RESPONSE_BYTES,
	AWS_MAX_TIMEOUT_MS,
	type AwsResolverService,
	awsServiceUrl,
	parseAwsRegion,
} from "./transport.js";

// ---------------------------------------------------------------------------
// Product ids
// ---------------------------------------------------------------------------

/**
 * Product ids are read off the slot factories rather than retyped, so the
 * registry cannot silently stop covering a product the Yard still offers.
 */
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

export const AWS_S3_PRODUCT_ID = productIdOf(s3(), "s3");
export const AWS_DYNAMODB_PRODUCT_ID = productIdOf(dynamodb(), "dynamodb");
export const AWS_SQS_PRODUCT_ID = productIdOf(sqs(), "sqs");
export const AWS_SQS_FIFO_PRODUCT_ID = productIdOf(sqsFifo(), "sqsFifo");
export const AWS_SNS_PRODUCT_ID = productIdOf(sns(), "sns");
export const AWS_SECRETS_MANAGER_PRODUCT_ID = productIdOf(
	secretsManager(),
	"secretsManager",
);
export const AWS_SSM_PARAMETER_PRODUCT_ID = productIdOf(
	ssmParameterStore(),
	"ssmParameterStore",
);

/** Every product this module resolves, id-sorted for a deterministic registry. */
export const AWS_RESOLVED_PRODUCT_IDS = Object.freeze(
	[
		AWS_DYNAMODB_PRODUCT_ID,
		AWS_S3_PRODUCT_ID,
		AWS_SECRETS_MANAGER_PRODUCT_ID,
		AWS_SNS_PRODUCT_ID,
		AWS_SQS_FIFO_PRODUCT_ID,
		AWS_SQS_PRODUCT_ID,
		AWS_SSM_PARAMETER_PRODUCT_ID,
	].sort(compareStrings),
);

/**
 * Product ids this package catalogs but deliberately cannot resolve
 * convergently. Each entry is a decision, not a backlog item:
 *
 * `aws.rds-postgres/v1`, `aws.rds-mysql/v1`,
 * `aws.aurora-serverless-postgres/v1`: `CreateDBInstance`/`CreateDBCluster`
 * take a `MasterUserPassword`. That value would have to travel in
 * `ResolveRequest.desired` — the record that reaches the event log, the plan
 * digest, and every diagnostic printed from them — which is exactly what the
 * credential law forbids. The managed-master-password alternative needs a KMS
 * key and a Secrets Manager attachment this package cannot derive, and both
 * paths additionally need a DB subnet group and a security group that a Yard
 * binding does not name. Refused rather than half-built.
 * `aws.elasticache-redis/v1`: `CreateCacheCluster` places the cluster in a
 * cache subnet group and a security group that no binding names; omitting them
 * silently lands the cluster in the default VPC, which is a network decision
 * this resolver is not entitled to take.
 * `aws.lambda/v1`: `CreateFunction` requires deployment-package bytes and an
 * execution-role ARN. The binding carries neither, and a function with no code
 * is not a function.
 * `aws.ecs-service/v1`, `aws.ecs-task/v1`, `aws.eks-deployment/v1`: every one
 * needs a cluster, a task-execution role, and a network configuration that
 * exist outside the binding; and an EKS Deployment is a Kubernetes API object,
 * not an AWS API one, so it is not reachable over this transport at all.
 * `aws.app-runner/v1`, `aws.amplify-hosting/v1`: creation is
 * source-connection-scoped (an ECR image or a connected repository) and
 * returns a new service ARN per call, with no documented list-by-name filter
 * to converge against.
 * `aws.api-gateway/v1`: `CreateRestApi`/`CreateApi` assign a fresh random API
 * id on every call and there is no name-unique constraint, so a retry after a
 * lost response creates a second API.
 * `aws.cloudfront-site/v1`: `CreateDistribution` returns a new distribution id
 * per call; the only name-ish handle is a caller reference AWS uses for
 * *deduplication windows*, not for identity, so it cannot carry convergence.
 */
export const AWS_UNRESOLVED_PRODUCT_IDS = Object.freeze(
	[
		"aws.amplify-hosting/v1",
		"aws.api-gateway/v1",
		"aws.app-runner/v1",
		"aws.aurora-serverless-postgres/v1",
		"aws.cloudfront-site/v1",
		"aws.ecs-service/v1",
		"aws.ecs-task/v1",
		"aws.eks-deployment/v1",
		"aws.elasticache-redis/v1",
		"aws.lambda/v1",
		"aws.rds-mysql/v1",
		"aws.rds-postgres/v1",
	].sort(compareStrings),
);

// ---------------------------------------------------------------------------
// Options, credentials, redaction
// ---------------------------------------------------------------------------

/** What a host must supply to build the resolvers. */
export interface AwsResolverOptions {
	/** The region every endpoint is scoped to. Parsed, never interpolated raw. */
	readonly region: string;
	/**
	 * Resolves a credential *locator* to material. Injected so the resolver
	 * never holds a secret and never decides where secrets live. Returning the
	 * structured credentials rather than a string means this package never
	 * parses material and never has a reason to hold it as text.
	 */
	readonly resolveCredential: (ref: string) => Promise<AwsCredentials>;
	/**
	 * The signing clock. SigV4 genuinely needs a timestamp; injecting it is
	 * what keeps a signed request byte-stable in a test. A function is the
	 * honest shape for a long deploy — a frozen number would eventually fall
	 * outside AWS's signature validity window — but a number is accepted for
	 * the single-shot case.
	 */
	readonly nowMs: number | (() => number);
}

/**
 * A credential locator, using the same grammar core's `parseResolveRequest`
 * enforces (`scheme://path`, no userinfo). Restated here rather than imported
 * because a resolver must refuse a bad ref even when a caller skipped the
 * parse boundary — and a second grammar would be a second answer.
 */
const CREDENTIAL_REF_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s@]+$/u;

/**
 * What an AWS access key id looks like when someone pastes the value into the
 * `credentialRef` field by mistake: `AKIA…`/`ASIA…` and friends, or any long
 * unbroken token-shaped run.
 */
const RAW_CREDENTIAL_PATTERN = /^(?:[A-Z0-9]{16,}|[A-Za-z0-9/+=_-]{32,})$/u;

/** Anything long and token-shaped is scrubbed out of provider error text. */
const TOKEN_SHAPED_PATTERN = /[A-Za-z0-9/+=_-]{20,}/gu;

/**
 * Redact provider text before it reaches a message, a diagnostic, or a log.
 * The resolved material is removed by exact match first — that is the part
 * that must never survive — and anything else token-shaped after it, because
 * AWS error bodies echo request context and have carried an access key id.
 */
export function redactAwsText(
	text: string,
	credentials: AwsCredentials | undefined,
	limit = 400,
): string {
	let scrubbed = text;
	for (const material of [
		credentials?.secretAccessKey,
		credentials?.sessionToken,
		credentials?.accessKeyId,
	]) {
		if (typeof material === "string" && material.length >= 4) {
			scrubbed = scrubbed.split(material).join("[redacted]");
		}
	}
	scrubbed = scrubbed.replace(TOKEN_SHAPED_PATTERN, "[redacted]");
	return scrubbed.length > limit ? `${scrubbed.slice(0, limit)}…` : scrubbed;
}

/**
 * The credential parse boundary.
 *
 * A blank ref is `RESOLVER_CREDENTIAL_MISSING`, a value-shaped one is
 * `RESOLVER_CREDENTIAL_NOT_A_REF` — a raw key in a request record has already
 * leaked by the time it is used — and a resolver that hands back nothing
 * usable is missing, never "carry on unauthenticated".
 */
async function resolveAwsCredentials(
	request: ResolveRequest,
	resolve: (ref: string) => Promise<AwsCredentials>,
): Promise<AwsCredentials> {
	const ref = request.credentialRef;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			'aws resolver: credentialRef is empty. Supply a locator such as "env://AWS_DEPLOY_CREDENTIALS" or "secret://camp/aws-deploy" and register it with the host credential resolver; the resolver never accepts inline credential material',
		);
	}
	const trimmed = ref.trim();
	if (RAW_CREDENTIAL_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			"aws resolver: credentialRef looks like credential material rather than a locator. Store the access key with the host secret custody and pass its reference (scheme://path); a raw key in a ResolveRequest is a key in the event log",
		);
	}
	if (!CREDENTIAL_REF_PATTERN.test(trimmed)) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_NOT_A_REF",
			`aws resolver: credentialRef ${JSON.stringify(redactAwsText(trimmed, undefined, 60))} is not a locator. Expected "<scheme>://<path>", for example "secret://camp/aws-deploy"`,
		);
	}
	let material: AwsCredentials;
	try {
		material = await resolve(trimmed);
	} catch (cause) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`aws resolver: the host could not resolve credentialRef ${JSON.stringify(trimmed)}: ${redactAwsText(
				cause instanceof Error ? cause.message : String(cause),
				undefined,
				160,
			)}. Register the reference with the credential resolver before deploying`,
		);
	}
	if (
		material === null ||
		typeof material !== "object" ||
		typeof material.accessKeyId !== "string" ||
		material.accessKeyId.trim().length === 0 ||
		typeof material.secretAccessKey !== "string" ||
		material.secretAccessKey.trim().length === 0
	) {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			`aws resolver: credentialRef ${JSON.stringify(trimmed)} did not resolve to an access key id and secret access key. A missing credential is refused rather than retried unsigned, which would look like a permissions error at the provider`,
		);
	}
	return material;
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
): Record<string, unknown> | undefined {
	const value = record[key];
	return isPlainObject(value) ? value : undefined;
}

/**
 * RFC 3986 percent-encoding, used for both path segments and the query-protocol
 * form bodies. `encodeURIComponent` leaves `!'()*` alone and AWS does not, and
 * a form parameter that encodes differently than it was signed is a signature
 * mismatch rather than a friendly error.
 */
function encodeComponent(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/gu,
		(character) =>
			`%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
	);
}

function formBody(parameters: readonly (readonly [string, string])[]): string {
	return parameters
		.map(
			([name, value]) => `${encodeComponent(name)}=${encodeComponent(value)}`,
		)
		.join("&");
}

// ---------------------------------------------------------------------------
// XML reading
// ---------------------------------------------------------------------------

/**
 * Pull the text of an XML element by name.
 *
 * This is a **bounded forward scan built on `indexOf`** — no regex, so no
 * catastrophic backtracking on a hostile body, and no recursion, so no stack
 * growth with nesting depth. It reads only the elements these resolvers
 * actually need (`QueueUrl`, `TopicArn`, `Code`, `Message`, and friends), and
 * it is deliberately *not* a general XML parser: it does not understand
 * namespaces, CDATA, comments, or attributes, and a body that needs any of
 * those is a body this module has no business interpreting. Response size is
 * already bounded by the transport guard.
 */
function xmlBlocks(xml: string, tag: string): readonly string[] {
	const open = `<${tag}`;
	const close = `</${tag}>`;
	const found: string[] = [];
	let cursor = 0;
	while (cursor < xml.length) {
		const start = xml.indexOf(open, cursor);
		if (start < 0) break;
		const boundary = xml.charAt(start + open.length);
		// `<Code` must not match `<CodeSigningConfig`: the next character has to
		// end the name.
		if (
			boundary !== ">" &&
			boundary !== " " &&
			boundary !== "\t" &&
			boundary !== "\n" &&
			boundary !== "\r" &&
			boundary !== "/"
		) {
			cursor = start + open.length;
			continue;
		}
		const openEnd = xml.indexOf(">", start);
		if (openEnd < 0) break;
		if (xml.charAt(openEnd - 1) === "/") {
			// Self-closing element: present, empty.
			found.push("");
			cursor = openEnd + 1;
			continue;
		}
		const closeStart = xml.indexOf(close, openEnd + 1);
		if (closeStart < 0) break;
		found.push(xml.slice(openEnd + 1, closeStart));
		cursor = closeStart + close.length;
	}
	return found;
}

/** The five predefined XML entities; nothing else is decoded. */
function decodeXmlText(value: string): string {
	return value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
}

function xmlText(xml: string, tag: string): string | undefined {
	const first = xmlBlocks(xml, tag)[0];
	if (first === undefined) return undefined;
	const decoded = decodeXmlText(first).trim();
	return decoded.length > 0 ? decoded : undefined;
}

function xmlTexts(xml: string, tag: string): readonly string[] {
	return xmlBlocks(xml, tag).map((block) => decodeXmlText(block).trim());
}

// ---------------------------------------------------------------------------
// The call boundary
// ---------------------------------------------------------------------------

interface AwsCall {
	readonly service: AwsResolverService;
	readonly method: TransportMethod;
	/** Already-encoded path, optionally with a query string. */
	readonly path: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
}

/** Everything a resolver body needs, with the credential already resolved. */
interface AwsResolverContext {
	readonly request: ResolveRequest;
	readonly transport: HttpTransport;
	readonly credentials: AwsCredentials;
	readonly region: string;
	readonly nowMs: () => number;
	/** The deterministic resource name: `desired.name`, else the logical id. */
	readonly name: string;
	readonly desired: Readonly<Record<string, unknown>>;
	/** True when the caller already knows the physical id (adopt vs noop). */
	readonly knownPhysicalId: string | undefined;
	redact(text: string, limit?: number): string;
}

/**
 * Sign one request and hand it to the guarded transport.
 *
 * The signed headers are folded to lower case so credential material lands in
 * exactly one place a reader has to check — `authorization` — and never in a
 * second casing of the same header.
 */
async function send(
	context: AwsResolverContext,
	call: AwsCall,
): Promise<TransportResponse> {
	const url = awsServiceUrl(call.service, context.region, call.path);
	const signed = signAwsRequest({
		method: call.method,
		url,
		headers: { ...(call.headers ?? {}) },
		...(call.body === undefined ? {} : { body: call.body }),
		region: context.region,
		service: call.service,
		credentials: context.credentials,
		now: new Date(context.nowMs()),
	});
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(signed.headers)) {
		headers[name.toLowerCase()] = value;
	}
	return context.transport({
		method: call.method,
		url,
		headers,
		...(call.body === undefined ? {} : { body: call.body }),
		timeoutMs: AWS_MAX_TIMEOUT_MS,
		maxResponseBytes: AWS_MAX_RESPONSE_BYTES,
	});
}

function isSuccess(response: TransportResponse): boolean {
	return response.status >= 200 && response.status < 300;
}

function tryJson(body: string): unknown {
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return undefined;
	}
}

/**
 * AWS JSON errors name their type in `__type` as
 * `com.amazonaws.dynamodb.v20120810#ResourceNotFoundException`. Only the last
 * segment identifies the error; the prefix is a package path that changes
 * between services and API versions.
 */
function jsonErrorCode(body: string): string | undefined {
	const parsed = tryJson(body);
	if (!isPlainObject(parsed)) return undefined;
	const declared =
		optionalString(parsed, "__type") ?? optionalString(parsed, "code");
	if (declared === undefined) return undefined;
	const hash = declared.lastIndexOf("#");
	const withoutPackage = hash < 0 ? declared : declared.slice(hash + 1);
	const colon = withoutPackage.indexOf(":");
	return colon < 0 ? withoutPackage : withoutPackage.slice(0, colon);
}

function jsonErrorMessage(body: string): string | undefined {
	const parsed = tryJson(body);
	if (!isPlainObject(parsed)) return undefined;
	return optionalString(parsed, "message") ?? optionalString(parsed, "Message");
}

/** The JSON body of a successful call, or a typed refusal. */
function jsonResult(
	context: AwsResolverContext,
	response: TransportResponse,
	label: string,
): Record<string, unknown> {
	if (!isSuccess(response)) rejectJson(context, response, label);
	const parsed = tryJson(response.body);
	if (!isPlainObject(parsed)) {
		throw new ResolverError(
			"RESOLVER_OUTPUT_UNPARSEABLE",
			`${label}: AWS returned a status ${response.status} body that is not a JSON object, so the outcome of the call is unknown and it is refused rather than assumed; retry, and if it repeats the API contract has changed`,
		);
	}
	return parsed;
}

function rejectJson(
	context: AwsResolverContext,
	response: TransportResponse,
	label: string,
): never {
	const code = jsonErrorCode(response.body);
	const detail = jsonErrorMessage(response.body) ?? response.body;
	throw new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`${label}: AWS refused the call with status ${response.status}${
			code === undefined ? "" : ` (${code})`
		}: ${context.redact(detail, 240)}`,
	);
}

/** The XML body of a successful call, or a typed refusal. */
function xmlResult(
	context: AwsResolverContext,
	response: TransportResponse,
	label: string,
): string {
	if (!isSuccess(response)) rejectXml(context, response, label);
	return response.body;
}

function xmlErrorCode(body: string): string | undefined {
	return xmlText(body, "Code");
}

function rejectXml(
	context: AwsResolverContext,
	response: TransportResponse,
	label: string,
): never {
	const code = xmlErrorCode(response.body);
	const detail = xmlText(response.body, "Message") ?? response.body;
	throw new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`${label}: AWS refused the call with status ${response.status}${
			code === undefined ? "" : ` (${code})`
		}: ${context.redact(detail, 240)}`,
	);
}

function unparseable(label: string, why: string): ResolverError {
	return new ResolverError("RESOLVER_OUTPUT_UNPARSEABLE", `${label}: ${why}`);
}

// ---------------------------------------------------------------------------
// Outcome helpers
// ---------------------------------------------------------------------------

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
 * Existing resource, no delta: `noop` when the caller already named it,
 * `adopt` when the resolver found something the request did not know about.
 * The distinction is the audit record — adoption of an unmanaged resource is a
 * fact an operator should be able to see, not something folded into "nothing
 * happened".
 */
function settledAction(context: AwsResolverContext): ResolverAction {
	return context.knownPhysicalId === undefined ? "adopt" : "noop";
}

function resourceName(request: ResolveRequest, productId: string): string {
	const desiredName = optionalString(request.desired, "name");
	if (desiredName !== undefined) return desiredName;
	const { logicalId } = request.ref;
	if (typeof logicalId === "string" && logicalId.trim().length > 0) {
		return logicalId;
	}
	throw new ResolverError(
		"RESOLVER_PRODUCT_UNSUPPORTED",
		`${productId}: the request names no resource — set desired.name or ref.logicalId. The name is what makes reconcile convergent, so it is never generated here`,
		productId,
	);
}

function knownPhysicalId(request: ResolveRequest): string | undefined {
	const value = request.ref.physicalId;
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

// ---------------------------------------------------------------------------
// S3 buckets — REST-XML on s3.{region}.amazonaws.com
// ---------------------------------------------------------------------------

/**
 * Path-style addressing (`/{bucket}`) rather than virtual-hosted
 * (`{bucket}.s3.…`). Both are valid for the bucket-level operations here, and
 * path-style keeps the transport allowlist to one reviewable host per region
 * instead of one host per bucket name a caller happens to pass.
 */
const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u;

const S3_XMLNS = "http://s3.amazonaws.com/doc/2006-03-01/";

function s3Bucket(context: AwsResolverContext): string {
	if (!S3_BUCKET_PATTERN.test(context.name)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${AWS_S3_PRODUCT_ID}: bucket name ${JSON.stringify(context.name)} does not match S3's DNS-safe grammar ${S3_BUCKET_PATTERN.source}; S3 would refuse it, so it is refused here where the message can say why`,
			AWS_S3_PRODUCT_ID,
		);
	}
	return context.name;
}

function s3Path(context: AwsResolverContext, subresource = ""): string {
	return `/${encodeComponent(s3Bucket(context))}${subresource}`;
}

interface S3Observed {
	readonly location: string;
	readonly versioning: string | undefined;
	readonly publicAccessBlocked: boolean;
}

/**
 * GetBucketLocation is the existence probe: it is a cheap GET that answers 404
 * `NoSuchBucket` when the bucket is not there and 200 with the constraint when
 * it is. HEAD would be the obvious call and is not available — the transport
 * method vocabulary is GET/POST/PUT/PATCH/DELETE.
 */
async function readS3(
	context: AwsResolverContext,
): Promise<S3Observed | undefined> {
	const label = `s3 get bucket location ${context.name}`;
	const located = await send(context, {
		service: "s3",
		method: "GET",
		path: s3Path(context, "?location"),
	});
	if (located.status === 404) return undefined;
	const locationBody = xmlResult(context, located, label);
	// An empty LocationConstraint is us-east-1; S3 has always reported it that
	// way and a caller comparing regions needs the real name, not "".
	const location = xmlText(locationBody, "LocationConstraint") ?? "us-east-1";

	const versioningResponse = await send(context, {
		service: "s3",
		method: "GET",
		path: s3Path(context, "?versioning"),
	});
	const versioningBody = xmlResult(
		context,
		versioningResponse,
		`s3 get bucket versioning ${context.name}`,
	);
	const versioning = xmlText(versioningBody, "Status");

	const blockResponse = await send(context, {
		service: "s3",
		method: "GET",
		path: s3Path(context, "?publicAccessBlock"),
	});
	// 404 NoSuchPublicAccessBlockConfiguration is the documented "not
	// configured" answer, not a failure.
	const publicAccessBlocked =
		blockResponse.status === 404
			? false
			: xmlText(
					xmlResult(
						context,
						blockResponse,
						`s3 get public access block ${context.name}`,
					),
					"BlockPublicAcls",
				) === "true";

	return {
		location,
		...(versioning === undefined ? { versioning: undefined } : { versioning }),
		publicAccessBlocked,
	};
}

function s3Outputs(
	name: string,
	observed: S3Observed,
): Readonly<Record<string, unknown>> {
	return {
		bucketName: name,
		region: observed.location,
		publicAccessBlocked: observed.publicAccessBlocked,
		...(observed.versioning === undefined
			? {}
			: { versioning: observed.versioning }),
	};
}

function s3Diagnostics(
	context: AwsResolverContext,
	observed: S3Observed,
): readonly string[] {
	const diagnostics: string[] = [];
	if (optionalString(context.desired, "storageClass") !== undefined) {
		diagnostics.push(
			"storageClass is declared but not applied: S3 has no bucket-level storage class — it is a per-object property or a lifecycle rule, neither of which this resolver manages",
		);
	}
	if (observed.location !== context.region) {
		diagnostics.push(
			`bucket is in ${observed.location} but this resolver is scoped to ${context.region}; a bucket's region is immutable and this resolver never replaces a bucket, so the drift is reported rather than corrected`,
		);
	}
	return diagnostics;
}

const S3_SPEC: Omit<AwsResolverSpec, "productId"> = {
	async read(context) {
		const observed = await readS3(context);
		if (observed === undefined) return undefined;
		return outcome(
			settledAction(context),
			s3Bucket(context),
			s3Outputs(context.name, observed),
			s3Diagnostics(context, observed),
		);
	},
	async reconcile(context) {
		const bucket = s3Bucket(context);
		let observed = await readS3(context);
		let action: ResolverAction = settledAction(context);

		if (observed === undefined) {
			// us-east-1 is the only region CreateBucket refuses a
			// LocationConstraint for; everywhere else it is required.
			const body =
				context.region === "us-east-1"
					? undefined
					: `<CreateBucketConfiguration xmlns="${S3_XMLNS}"><LocationConstraint>${context.region}</LocationConstraint></CreateBucketConfiguration>`;
			const created = await send(context, {
				service: "s3",
				method: "PUT",
				path: s3Path(context),
				headers: body === undefined ? {} : { "content-type": "text/xml" },
				...(body === undefined ? {} : { body }),
			});
			xmlResult(context, created, `s3 create bucket ${context.name}`);
			action = "create";
			observed = {
				location: context.region,
				versioning: undefined,
				publicAccessBlocked: false,
			};
		}

		const wantVersioning = optionalBoolean(context.desired, "versioning");
		if (wantVersioning !== undefined) {
			const wanted = wantVersioning ? "Enabled" : "Suspended";
			const current = observed.versioning ?? "Suspended";
			if (current !== wanted) {
				const response = await send(context, {
					service: "s3",
					method: "PUT",
					path: s3Path(context, "?versioning"),
					headers: { "content-type": "text/xml" },
					body: `<VersioningConfiguration xmlns="${S3_XMLNS}"><Status>${wanted}</Status></VersioningConfiguration>`,
				});
				xmlResult(
					context,
					response,
					`s3 put bucket versioning ${context.name}`,
				);
				observed = { ...observed, versioning: wanted };
				if (action !== "create") action = "update";
			}
		}

		const wantBlocked = optionalBoolean(context.desired, "publicAccessBlocked");
		if (wantBlocked === true && !observed.publicAccessBlocked) {
			const response = await send(context, {
				service: "s3",
				method: "PUT",
				path: s3Path(context, "?publicAccessBlock"),
				headers: { "content-type": "text/xml" },
				body: `<PublicAccessBlockConfiguration xmlns="${S3_XMLNS}"><BlockPublicAcls>true</BlockPublicAcls><IgnorePublicAcls>true</IgnorePublicAcls><BlockPublicPolicy>true</BlockPublicPolicy><RestrictPublicBuckets>true</RestrictPublicBuckets></PublicAccessBlockConfiguration>`,
			});
			xmlResult(
				context,
				response,
				`s3 put public access block ${context.name}`,
			);
			observed = { ...observed, publicAccessBlocked: true };
			if (action !== "create") action = "update";
		}

		return outcome(
			action,
			bucket,
			s3Outputs(context.name, observed),
			s3Diagnostics(context, observed),
		);
	},
	async remove(context) {
		const response = await send(context, {
			service: "s3",
			method: "DELETE",
			path: s3Path(context),
		});
		if (response.status === 404) return;
		xmlResult(context, response, `s3 delete bucket ${context.name}`);
	},
};

// ---------------------------------------------------------------------------
// DynamoDB tables — REST-JSON with an x-amz-target header
// ---------------------------------------------------------------------------

const DYNAMODB_TARGET_PREFIX = "DynamoDB_20120810";
const DYNAMODB_CONTENT_TYPE = "application/x-amz-json-1.0";
const DYNAMODB_KEY_TYPES = Object.freeze(["S", "N", "B"] as const);

async function dynamoCall(
	context: AwsResolverContext,
	operation: string,
	payload: Readonly<Record<string, unknown>>,
): Promise<TransportResponse> {
	return send(context, {
		service: "dynamodb",
		method: "POST",
		path: "/",
		headers: {
			"content-type": DYNAMODB_CONTENT_TYPE,
			"x-amz-target": `${DYNAMODB_TARGET_PREFIX}.${operation}`,
		},
		body: JSON.stringify(payload),
	});
}

function dynamoKeyType(
	context: AwsResolverContext,
	key: string,
): "S" | "N" | "B" {
	const declared = optionalString(context.desired, key);
	if (declared === undefined) return "S";
	if (!(DYNAMODB_KEY_TYPES as readonly string[]).includes(declared)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${AWS_DYNAMODB_PRODUCT_ID}: desired.${key} must be one of ${DYNAMODB_KEY_TYPES.join(" | ")}, received ${JSON.stringify(declared)}`,
			AWS_DYNAMODB_PRODUCT_ID,
		);
	}
	return declared as "S" | "N" | "B";
}

interface DynamoBilling {
	readonly mode: "PAY_PER_REQUEST" | "PROVISIONED";
	readonly readCapacity: number | undefined;
	readonly writeCapacity: number | undefined;
	readonly defaulted: boolean;
}

function dynamoBilling(context: AwsResolverContext): DynamoBilling {
	const declared = optionalString(context.desired, "billingMode");
	if (declared === undefined) {
		return {
			mode: "PAY_PER_REQUEST",
			readCapacity: undefined,
			writeCapacity: undefined,
			defaulted: true,
		};
	}
	if (declared === "on-demand") {
		return {
			mode: "PAY_PER_REQUEST",
			readCapacity: undefined,
			writeCapacity: undefined,
			defaulted: false,
		};
	}
	if (declared !== "provisioned") {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${AWS_DYNAMODB_PRODUCT_ID}: desired.billingMode must be "on-demand" or "provisioned", received ${JSON.stringify(declared)}`,
			AWS_DYNAMODB_PRODUCT_ID,
		);
	}
	const readCapacity = optionalInteger(context.desired, "readCapacity");
	const writeCapacity = optionalInteger(context.desired, "writeCapacity");
	if (
		readCapacity === undefined ||
		writeCapacity === undefined ||
		readCapacity <= 0 ||
		writeCapacity <= 0
	) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${AWS_DYNAMODB_PRODUCT_ID}: provisioned billing needs positive desired.readCapacity and desired.writeCapacity. Inventing a capacity would bill the account for a number nobody chose, so it is refused`,
			AWS_DYNAMODB_PRODUCT_ID,
		);
	}
	return { mode: "PROVISIONED", readCapacity, writeCapacity, defaulted: false };
}

async function readDynamoTable(
	context: AwsResolverContext,
): Promise<Record<string, unknown> | undefined> {
	const label = `dynamodb describe table ${context.name}`;
	const response = await dynamoCall(context, "DescribeTable", {
		TableName: context.name,
	});
	if (
		!isSuccess(response) &&
		jsonErrorCode(response.body) === "ResourceNotFoundException"
	) {
		return undefined;
	}
	const body = jsonResult(context, response, label);
	const table = nestedRecord(body, "Table");
	if (table === undefined) {
		throw unparseable(
			label,
			'AWS returned a successful DescribeTable with no "Table" object, so the table cannot be identified',
		);
	}
	return table;
}

function dynamoTableArn(
	table: Readonly<Record<string, unknown>>,
	label: string,
): string {
	const arn = optionalString(table, "TableArn");
	if (arn === undefined) {
		throw unparseable(
			label,
			'AWS returned a table description without a "TableArn", so the table cannot be addressed',
		);
	}
	return arn;
}

function dynamoObservedMode(
	table: Readonly<Record<string, unknown>>,
): string | undefined {
	const summary = nestedRecord(table, "BillingModeSummary");
	return summary === undefined
		? undefined
		: optionalString(summary, "BillingMode");
}

function dynamoOutputs(
	table: Readonly<Record<string, unknown>>,
	name: string,
): Readonly<Record<string, unknown>> {
	const status = optionalString(table, "TableStatus");
	const mode = dynamoObservedMode(table);
	return {
		tableName: name,
		tableArn: optionalString(table, "TableArn") ?? "",
		...(status === undefined ? {} : { tableStatus: status }),
		...(mode === undefined ? {} : { billingMode: mode }),
	};
}

function dynamoKeyDiagnostics(
	context: AwsResolverContext,
	table: Readonly<Record<string, unknown>>,
): readonly string[] {
	const wanted = optionalString(context.desired, "partitionKey") ?? "pk";
	const schema = table.KeySchema;
	if (!Array.isArray(schema)) return [];
	const hash: unknown = schema.find(
		(entry) => isPlainObject(entry) && entry.KeyType === "HASH",
	);
	const actual = isPlainObject(hash)
		? optionalString(hash, "AttributeName")
		: undefined;
	if (actual !== undefined && actual !== wanted) {
		return [
			`table partition key is ${actual} but the request asks for ${wanted}; a DynamoDB key schema is immutable and this resolver never replaces a table, so the drift is reported rather than corrected`,
		];
	}
	return [];
}

const DYNAMODB_SPEC: Omit<AwsResolverSpec, "productId"> = {
	async read(context) {
		const table = await readDynamoTable(context);
		if (table === undefined) return undefined;
		return outcome(
			settledAction(context),
			dynamoTableArn(table, `dynamodb describe table ${context.name}`),
			dynamoOutputs(table, context.name),
			dynamoKeyDiagnostics(context, table),
		);
	},
	async reconcile(context) {
		const billing = dynamoBilling(context);
		const diagnostics: string[] = [];
		const existing = await readDynamoTable(context);

		if (existing === undefined) {
			const partitionKey =
				optionalString(context.desired, "partitionKey") ?? "pk";
			if (optionalString(context.desired, "partitionKey") === undefined) {
				diagnostics.push(
					'no desired.partitionKey was declared, so the table was created with the attribute "pk" as its partition key; a DynamoDB table cannot exist without one and the key schema is immutable afterwards',
				);
			}
			if (billing.defaulted) {
				diagnostics.push(
					"no desired.billingMode was declared, so the table was created on-demand (PAY_PER_REQUEST), which bills per request rather than reserving capacity nobody asked for",
				);
			}
			const sortKey = optionalString(context.desired, "sortKey");
			const label = `dynamodb create table ${context.name}`;
			const created = jsonResult(
				context,
				await dynamoCall(context, "CreateTable", {
					TableName: context.name,
					AttributeDefinitions: [
						{
							AttributeName: partitionKey,
							AttributeType: dynamoKeyType(context, "partitionKeyType"),
						},
						...(sortKey === undefined
							? []
							: [
									{
										AttributeName: sortKey,
										AttributeType: dynamoKeyType(context, "sortKeyType"),
									},
								]),
					],
					KeySchema: [
						{ AttributeName: partitionKey, KeyType: "HASH" },
						...(sortKey === undefined
							? []
							: [{ AttributeName: sortKey, KeyType: "RANGE" }]),
					],
					BillingMode: billing.mode,
					...(billing.mode === "PROVISIONED"
						? {
								ProvisionedThroughput: {
									ReadCapacityUnits: billing.readCapacity,
									WriteCapacityUnits: billing.writeCapacity,
								},
							}
						: {}),
				}),
				label,
			);
			const description = nestedRecord(created, "TableDescription");
			if (description === undefined) {
				throw unparseable(
					label,
					'AWS returned a successful CreateTable with no "TableDescription", so the created table cannot be identified',
				);
			}
			return outcome(
				"create",
				dynamoTableArn(description, label),
				dynamoOutputs(description, context.name),
				diagnostics,
			);
		}

		diagnostics.push(...dynamoKeyDiagnostics(context, existing));
		const observedMode = dynamoObservedMode(existing);
		if (!billing.defaulted && observedMode !== billing.mode) {
			const label = `dynamodb update table ${context.name}`;
			const updated = jsonResult(
				context,
				await dynamoCall(context, "UpdateTable", {
					TableName: context.name,
					BillingMode: billing.mode,
					...(billing.mode === "PROVISIONED"
						? {
								ProvisionedThroughput: {
									ReadCapacityUnits: billing.readCapacity,
									WriteCapacityUnits: billing.writeCapacity,
								},
							}
						: {}),
				}),
				label,
			);
			const description = nestedRecord(updated, "TableDescription") ?? existing;
			return outcome(
				"update",
				dynamoTableArn(description, label),
				dynamoOutputs(description, context.name),
				diagnostics,
			);
		}

		return outcome(
			settledAction(context),
			dynamoTableArn(existing, `dynamodb describe table ${context.name}`),
			dynamoOutputs(existing, context.name),
			diagnostics,
		);
	},
	async remove(context) {
		const response = await dynamoCall(context, "DeleteTable", {
			TableName: context.name,
		});
		if (
			!isSuccess(response) &&
			jsonErrorCode(response.body) === "ResourceNotFoundException"
		) {
			return;
		}
		jsonResult(context, response, `dynamodb delete table ${context.name}`);
	},
};

// ---------------------------------------------------------------------------
// SQS queues — query protocol on sqs.{region}.amazonaws.com
// ---------------------------------------------------------------------------

// public-contract: the SQS query-protocol API version every request declares.
export const SQS_API_VERSION = "2012-11-05";

const QUERY_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8";

const SQS_QUEUE_MISSING_CODE = "AWS.SimpleQueueService.NonExistentQueue";

/**
 * The query protocol numbers its attribute parameters from 1. Building the
 * list here rather than at each call site is what stops an off-by-one from
 * silently dropping the attribute that makes a queue FIFO.
 */
function sqsAttributeParameters(
	pairs: readonly (readonly [string, string])[],
): readonly (readonly [string, string])[] {
	const out: (readonly [string, string])[] = [];
	for (const [position, [name, value]] of pairs.entries()) {
		out.push(
			[`Attribute.${position + 1}.Name`, name],
			[`Attribute.${position + 1}.Value`, value],
		);
	}
	return out;
}

async function sqsCall(
	context: AwsResolverContext,
	parameters: readonly (readonly [string, string])[],
): Promise<TransportResponse> {
	return send(context, {
		service: "sqs",
		method: "POST",
		path: "/",
		headers: { "content-type": QUERY_CONTENT_TYPE },
		body: formBody([...parameters, ["Version", SQS_API_VERSION]]),
	});
}

/** FIFO queues must be named `*.fifo`; the suffix is part of the identity. */
function sqsQueueName(context: AwsResolverContext, fifo: boolean): string {
	if (!fifo) return context.name;
	return context.name.endsWith(".fifo") ? context.name : `${context.name}.fifo`;
}

function sqsIsFifo(context: AwsResolverContext, productId: string): boolean {
	return (
		productId === AWS_SQS_FIFO_PRODUCT_ID ||
		optionalBoolean(context.desired, "fifo") === true
	);
}

async function readSqsQueueUrl(
	context: AwsResolverContext,
	name: string,
): Promise<string | undefined> {
	const label = `sqs get queue url ${name}`;
	const response = await sqsCall(context, [
		["Action", "GetQueueUrl"],
		["QueueName", name],
	]);
	if (
		!isSuccess(response) &&
		xmlErrorCode(response.body) === SQS_QUEUE_MISSING_CODE
	) {
		return undefined;
	}
	const body = xmlResult(context, response, label);
	const url = xmlText(body, "QueueUrl");
	if (url === undefined) {
		throw unparseable(
			label,
			"AWS returned a successful GetQueueUrl with no <QueueUrl>, so the queue cannot be addressed",
		);
	}
	return url;
}

async function readSqsAttributes(
	context: AwsResolverContext,
	queueUrl: string,
): Promise<Readonly<Record<string, string>>> {
	const label = `sqs get queue attributes ${context.name}`;
	const body = xmlResult(
		context,
		await sqsCall(context, [
			["Action", "GetQueueAttributes"],
			["QueueUrl", queueUrl],
			["AttributeName.1", "All"],
		]),
		label,
	);
	const attributes: Record<string, string> = {};
	for (const block of xmlBlocks(body, "Attribute")) {
		const name = xmlText(block, "Name");
		const value = xmlText(block, "Value");
		if (name !== undefined && value !== undefined) attributes[name] = value;
	}
	return attributes;
}

function sqsOutputs(
	name: string,
	queueUrl: string,
	attributes: Readonly<Record<string, string>>,
	fifo: boolean,
): Readonly<Record<string, unknown>> {
	const arn = attributes.QueueArn;
	const visibility = attributes.VisibilityTimeout;
	return {
		queueName: name,
		queueUrl,
		fifo,
		...(arn === undefined ? {} : { queueArn: arn }),
		...(visibility === undefined
			? {}
			: { visibilityTimeoutSeconds: Number(visibility) }),
	};
}

function sqsDiagnostics(context: AwsResolverContext): readonly string[] {
	return optionalInteger(context.desired, "maxReceiveCount") === undefined
		? []
		: [
				"maxReceiveCount is declared but not applied: a redrive policy names a dead-letter queue ARN, and this resolver neither creates that queue nor guesses which one was meant",
			];
}

function sqsSpec(productId: string): Omit<AwsResolverSpec, "productId"> {
	return {
		async read(context) {
			const fifo = sqsIsFifo(context, productId);
			const name = sqsQueueName(context, fifo);
			const queueUrl = await readSqsQueueUrl(context, name);
			if (queueUrl === undefined) return undefined;
			const attributes = await readSqsAttributes(context, queueUrl);
			return outcome(
				settledAction(context),
				queueUrl,
				sqsOutputs(name, queueUrl, attributes, fifo),
				sqsDiagnostics(context),
			);
		},
		async reconcile(context) {
			const fifo = sqsIsFifo(context, productId);
			const name = sqsQueueName(context, fifo);
			const visibility = optionalInteger(
				context.desired,
				"visibilityTimeoutSeconds",
			);
			let queueUrl = await readSqsQueueUrl(context, name);
			let action: ResolverAction = settledAction(context);

			if (queueUrl === undefined) {
				const label = `sqs create queue ${name}`;
				const attributeParameters = sqsAttributeParameters([
					...(fifo ? ([["FifoQueue", "true"]] as const) : []),
					...(visibility === undefined
						? []
						: ([["VisibilityTimeout", String(visibility)]] as const)),
				]);
				const body = xmlResult(
					context,
					await sqsCall(context, [
						["Action", "CreateQueue"],
						["QueueName", name],
						...attributeParameters,
					]),
					label,
				);
				const created = xmlText(body, "QueueUrl");
				if (created === undefined) {
					throw unparseable(
						label,
						"AWS returned a successful CreateQueue with no <QueueUrl>, so the created queue cannot be addressed",
					);
				}
				queueUrl = created;
				action = "create";
			} else if (visibility !== undefined) {
				const attributes = await readSqsAttributes(context, queueUrl);
				if (attributes.VisibilityTimeout !== String(visibility)) {
					xmlResult(
						context,
						await sqsCall(context, [
							["Action", "SetQueueAttributes"],
							["QueueUrl", queueUrl],
							["Attribute.1.Name", "VisibilityTimeout"],
							["Attribute.1.Value", String(visibility)],
						]),
						`sqs set queue attributes ${name}`,
					);
					action = "update";
				}
			}

			const attributes = await readSqsAttributes(context, queueUrl);
			return outcome(
				action,
				queueUrl,
				sqsOutputs(name, queueUrl, attributes, fifo),
				sqsDiagnostics(context),
			);
		},
		async remove(context) {
			const fifo = sqsIsFifo(context, productId);
			const name = sqsQueueName(context, fifo);
			const queueUrl = await readSqsQueueUrl(context, name);
			if (queueUrl === undefined) return;
			const response = await sqsCall(context, [
				["Action", "DeleteQueue"],
				["QueueUrl", queueUrl],
			]);
			if (
				!isSuccess(response) &&
				xmlErrorCode(response.body) === SQS_QUEUE_MISSING_CODE
			) {
				return;
			}
			xmlResult(context, response, `sqs delete queue ${name}`);
		},
	};
}

// ---------------------------------------------------------------------------
// SNS topics — query protocol on sns.{region}.amazonaws.com
// ---------------------------------------------------------------------------

// public-contract: the SNS query-protocol API version every request declares.
export const SNS_API_VERSION = "2010-03-31";

/** A listing that will not terminate is refused rather than half-read. */
const MAX_LIST_PAGES = 25;

/** SNS spells its attribute map `Attributes.entry.N.key` / `.value`. */
function snsAttributeParameters(
	pairs: readonly (readonly [string, string])[],
): readonly (readonly [string, string])[] {
	const out: (readonly [string, string])[] = [];
	for (const [position, [name, value]] of pairs.entries()) {
		out.push(
			[`Attributes.entry.${position + 1}.key`, name],
			[`Attributes.entry.${position + 1}.value`, value],
		);
	}
	return out;
}

async function snsCall(
	context: AwsResolverContext,
	parameters: readonly (readonly [string, string])[],
): Promise<TransportResponse> {
	return send(context, {
		service: "sns",
		method: "POST",
		path: "/",
		headers: { "content-type": QUERY_CONTENT_TYPE },
		body: formBody([...parameters, ["Version", SNS_API_VERSION]]),
	});
}

function snsTopicName(context: AwsResolverContext, fifo: boolean): string {
	if (!fifo) return context.name;
	return context.name.endsWith(".fifo") ? context.name : `${context.name}.fifo`;
}

/**
 * SNS has no get-topic-by-name, so convergence rides on a bounded paged
 * `ListTopics` matched on the last ARN segment. Stopping at page one would
 * mean creating a duplicate of a topic that already exists on page two, which
 * is precisely the failure convergence is supposed to rule out — so a listing
 * that does not terminate is a refusal, not a "probably fine".
 */
async function findSnsTopicArn(
	context: AwsResolverContext,
	name: string,
): Promise<string | undefined> {
	const label = `sns list topics for ${name}`;
	let nextToken: string | undefined;
	for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
		const parameters: (readonly [string, string])[] = [
			["Action", "ListTopics"],
		];
		if (nextToken !== undefined) parameters.push(["NextToken", nextToken]);
		const body = xmlResult(context, await snsCall(context, parameters), label);
		for (const arn of xmlTexts(body, "TopicArn")) {
			if (arn.slice(arn.lastIndexOf(":") + 1) === name) return arn;
		}
		nextToken = xmlText(body, "NextToken");
		if (nextToken === undefined) return undefined;
	}
	throw new ResolverError(
		"RESOLVER_PROVIDER_REJECTED",
		`${label}: the SNS topic listing did not terminate within ${MAX_LIST_PAGES} pages, so an existing topic cannot be ruled out and creating one would risk a duplicate`,
	);
}

async function readSnsAttributes(
	context: AwsResolverContext,
	topicArn: string,
): Promise<Readonly<Record<string, string>>> {
	const body = xmlResult(
		context,
		await snsCall(context, [
			["Action", "GetTopicAttributes"],
			["TopicArn", topicArn],
		]),
		`sns get topic attributes ${context.name}`,
	);
	const attributes: Record<string, string> = {};
	for (const entry of xmlBlocks(body, "entry")) {
		const key = xmlText(entry, "key");
		const value = xmlText(entry, "value");
		if (key !== undefined && value !== undefined) attributes[key] = value;
	}
	return attributes;
}

function snsOutputs(
	name: string,
	topicArn: string,
	attributes: Readonly<Record<string, string>>,
	fifo: boolean,
): Readonly<Record<string, unknown>> {
	const dedupe = attributes.ContentBasedDeduplication;
	return {
		topicName: name,
		topicArn,
		fifo,
		...(dedupe === undefined ? {} : { contentBasedDeduplication: dedupe }),
	};
}

const SNS_SPEC: Omit<AwsResolverSpec, "productId"> = {
	async read(context) {
		const fifo = optionalBoolean(context.desired, "fifo") === true;
		const name = snsTopicName(context, fifo);
		const topicArn = await findSnsTopicArn(context, name);
		if (topicArn === undefined) return undefined;
		const attributes = await readSnsAttributes(context, topicArn);
		return outcome(
			settledAction(context),
			topicArn,
			snsOutputs(name, topicArn, attributes, fifo),
			[],
		);
	},
	async reconcile(context) {
		const fifo = optionalBoolean(context.desired, "fifo") === true;
		const name = snsTopicName(context, fifo);
		const dedupe = optionalBoolean(
			context.desired,
			"contentBasedDeduplication",
		);
		let topicArn = await findSnsTopicArn(context, name);
		let action: ResolverAction = settledAction(context);

		if (topicArn === undefined) {
			const label = `sns create topic ${name}`;
			const attributeParameters = snsAttributeParameters([
				...(fifo ? ([["FifoTopic", "true"]] as const) : []),
				...(dedupe === undefined
					? []
					: ([["ContentBasedDeduplication", String(dedupe)]] as const)),
			]);
			const body = xmlResult(
				context,
				await snsCall(context, [
					["Action", "CreateTopic"],
					["Name", name],
					...attributeParameters,
				]),
				label,
			);
			const created = xmlText(body, "TopicArn");
			if (created === undefined) {
				throw unparseable(
					label,
					"AWS returned a successful CreateTopic with no <TopicArn>, so the created topic cannot be addressed",
				);
			}
			topicArn = created;
			action = "create";
		} else if (dedupe !== undefined) {
			const attributes = await readSnsAttributes(context, topicArn);
			if (attributes.ContentBasedDeduplication !== String(dedupe)) {
				xmlResult(
					context,
					await snsCall(context, [
						["Action", "SetTopicAttributes"],
						["TopicArn", topicArn],
						["AttributeName", "ContentBasedDeduplication"],
						["AttributeValue", String(dedupe)],
					]),
					`sns set topic attributes ${name}`,
				);
				action = "update";
			}
		}

		const attributes = await readSnsAttributes(context, topicArn);
		return outcome(
			action,
			topicArn,
			snsOutputs(name, topicArn, attributes, fifo),
			[],
		);
	},
	async remove(context) {
		const fifo = optionalBoolean(context.desired, "fifo") === true;
		const name = snsTopicName(context, fifo);
		const topicArn = await findSnsTopicArn(context, name);
		if (topicArn === undefined) return;
		const response = await snsCall(context, [
			["Action", "DeleteTopic"],
			["TopicArn", topicArn],
		]);
		if (!isSuccess(response) && xmlErrorCode(response.body) === "NotFound") {
			return;
		}
		xmlResult(context, response, `sns delete topic ${name}`);
	},
};

// ---------------------------------------------------------------------------
// Secrets Manager — REST-JSON with an x-amz-target header
// ---------------------------------------------------------------------------

const JSON_1_1_CONTENT_TYPE = "application/x-amz-json-1.1";
const SECRETS_TARGET_PREFIX = "secretsmanager";

async function secretsCall(
	context: AwsResolverContext,
	operation: string,
	payload: Readonly<Record<string, unknown>>,
): Promise<TransportResponse> {
	return send(context, {
		service: "secretsmanager",
		method: "POST",
		path: "/",
		headers: {
			"content-type": JSON_1_1_CONTENT_TYPE,
			"x-amz-target": `${SECRETS_TARGET_PREFIX}.${operation}`,
		},
		body: JSON.stringify(payload),
	});
}

async function readSecret(
	context: AwsResolverContext,
): Promise<Record<string, unknown> | undefined> {
	const response = await secretsCall(context, "DescribeSecret", {
		SecretId: context.name,
	});
	if (
		!isSuccess(response) &&
		jsonErrorCode(response.body) === "ResourceNotFoundException"
	) {
		return undefined;
	}
	return jsonResult(
		context,
		response,
		`secretsmanager describe ${context.name}`,
	);
}

function secretArn(
	record: Readonly<Record<string, unknown>>,
	label: string,
): string {
	const arn = optionalString(record, "ARN");
	if (arn === undefined) {
		throw unparseable(
			label,
			'AWS returned a secret record without an "ARN", so the secret cannot be addressed',
		);
	}
	return arn;
}

function secretOutputs(
	name: string,
	record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const description = optionalString(record, "Description");
	const kmsKeyId = optionalString(record, "KmsKeyId");
	// The keys are `name`/`arn` rather than `secretName`/`secretArn`: core's
	// outcome parse boundary refuses any property key matching /secret/, because
	// a bag key that reads like a secret is exactly where material hides. The
	// bag belongs to a Secrets Manager outcome, so the plain names are
	// unambiguous without the prefix.
	return {
		name,
		arn: optionalString(record, "ARN") ?? "",
		...(description === undefined ? {} : { description }),
		// A KMS key id is a locator for a key, not key material, so it belongs in
		// outputs the way a bucket name does.
		...(kmsKeyId === undefined ? {} : { kmsKeyId }),
	};
}

function secretDiagnostics(context: AwsResolverContext): readonly string[] {
	const diagnostics: string[] = [];
	if (optionalInteger(context.desired, "rotationDays") !== undefined) {
		diagnostics.push(
			"rotationDays is declared but not applied: RotateSecret needs a rotation Lambda this resolver neither creates nor selects",
		);
	}
	return diagnostics;
}

const SECRETS_MANAGER_SPEC: Omit<AwsResolverSpec, "productId"> = {
	async read(context) {
		const existing = await readSecret(context);
		if (existing === undefined) return undefined;
		return outcome(
			settledAction(context),
			secretArn(existing, `secretsmanager describe ${context.name}`),
			secretOutputs(context.name, existing),
			secretDiagnostics(context),
		);
	},
	async reconcile(context) {
		const description = optionalString(context.desired, "description");
		const kmsKeyRef = optionalString(context.desired, "kmsKeyRef");
		const diagnostics = [...secretDiagnostics(context)];
		const existing = await readSecret(context);

		if (existing === undefined) {
			const label = `secretsmanager create ${context.name}`;
			// Deliberately no SecretString/SecretBinary: this resolver creates the
			// container and never carries the value. Writing a version is a
			// separate, host-side act with the material in hand.
			const created = jsonResult(
				context,
				await secretsCall(context, "CreateSecret", {
					Name: context.name,
					...(description === undefined ? {} : { Description: description }),
					...(kmsKeyRef === undefined ? {} : { KmsKeyId: kmsKeyRef }),
				}),
				label,
			);
			diagnostics.push(
				"the secret was created with no version: this resolver never holds credential material, so the value is written out of band by whoever has it",
			);
			return outcome(
				"create",
				secretArn(created, label),
				secretOutputs(context.name, created),
				diagnostics,
			);
		}

		const descriptionDrift =
			description !== undefined &&
			description !== optionalString(existing, "Description");
		const keyDrift =
			kmsKeyRef !== undefined &&
			kmsKeyRef !== optionalString(existing, "KmsKeyId");
		if (descriptionDrift || keyDrift) {
			const label = `secretsmanager update ${context.name}`;
			jsonResult(
				context,
				await secretsCall(context, "UpdateSecret", {
					SecretId: context.name,
					...(descriptionDrift ? { Description: description } : {}),
					...(keyDrift ? { KmsKeyId: kmsKeyRef } : {}),
				}),
				label,
			);
			const refreshed = (await readSecret(context)) ?? existing;
			return outcome(
				"update",
				secretArn(refreshed, label),
				secretOutputs(context.name, refreshed),
				diagnostics,
			);
		}

		return outcome(
			settledAction(context),
			secretArn(existing, `secretsmanager describe ${context.name}`),
			secretOutputs(context.name, existing),
			diagnostics,
		);
	},
	async remove(context) {
		const response = await secretsCall(context, "DeleteSecret", {
			SecretId: context.name,
			...(optionalBoolean(context.desired, "forceDelete") === true
				? { ForceDeleteWithoutRecovery: true }
				: {}),
		});
		if (
			!isSuccess(response) &&
			jsonErrorCode(response.body) === "ResourceNotFoundException"
		) {
			return;
		}
		jsonResult(context, response, `secretsmanager delete ${context.name}`);
	},
};

// ---------------------------------------------------------------------------
// SSM Parameter Store — REST-JSON with an x-amz-target header
// ---------------------------------------------------------------------------

const SSM_TARGET_PREFIX = "AmazonSSM";
const SSM_PARAMETER_TYPES = Object.freeze(["String", "StringList"] as const);

async function ssmCall(
	context: AwsResolverContext,
	operation: string,
	payload: Readonly<Record<string, unknown>>,
): Promise<TransportResponse> {
	return send(context, {
		service: "ssm",
		method: "POST",
		path: "/",
		headers: {
			"content-type": JSON_1_1_CONTENT_TYPE,
			"x-amz-target": `${SSM_TARGET_PREFIX}.${operation}`,
		},
		body: JSON.stringify(payload),
	});
}

/**
 * `SecureString` is refused, not supported.
 *
 * A SecureString parameter's value *is* the secret, and `PutParameter` takes
 * it inline — which would mean the material travelled in
 * `ResolveRequest.desired`, the record that reaches the event log and the plan
 * digest. This resolver therefore manages only non-secret parameters, and says
 * so rather than quietly downgrading the type.
 */
function ssmParameterType(
	context: AwsResolverContext,
): "String" | "StringList" {
	const declared = optionalString(context.desired, "type") ?? "String";
	if (!(SSM_PARAMETER_TYPES as readonly string[]).includes(declared)) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			declared === "SecureString"
				? `${AWS_SSM_PARAMETER_PRODUCT_ID}: desired.type "SecureString" is refused. Its value is the secret, and PutParameter takes that value inline — it would travel in the request record, the event log, and the plan digest. Write SecureString parameters out of band with the material in hand and let this resolver manage only non-secret parameters`
				: `${AWS_SSM_PARAMETER_PRODUCT_ID}: desired.type must be one of ${SSM_PARAMETER_TYPES.join(" | ")}, received ${JSON.stringify(declared)}`,
			AWS_SSM_PARAMETER_PRODUCT_ID,
		);
	}
	return declared as "String" | "StringList";
}

function ssmParameterValue(context: AwsResolverContext): string {
	const value = context.desired.value;
	if (typeof value !== "string" || value.length === 0) {
		throw new ResolverError(
			"RESOLVER_PRODUCT_UNSUPPORTED",
			`${AWS_SSM_PARAMETER_PRODUCT_ID}: desired.value is required and must be a non-empty string. A parameter cannot exist without a value, and inventing a placeholder would write a fact into the account that nobody stated`,
			AWS_SSM_PARAMETER_PRODUCT_ID,
		);
	}
	return value;
}

async function readSsmParameter(
	context: AwsResolverContext,
): Promise<Record<string, unknown> | undefined> {
	const label = `ssm get parameter ${context.name}`;
	const response = await ssmCall(context, "GetParameter", {
		Name: context.name,
		WithDecryption: false,
	});
	if (
		!isSuccess(response) &&
		jsonErrorCode(response.body) === "ParameterNotFound"
	) {
		return undefined;
	}
	const body = jsonResult(context, response, label);
	const parameter = nestedRecord(body, "Parameter");
	if (parameter === undefined) {
		throw unparseable(
			label,
			'AWS returned a successful GetParameter with no "Parameter" object, so the parameter cannot be identified',
		);
	}
	return parameter;
}

function ssmOutputs(
	name: string,
	parameter: Readonly<Record<string, unknown>> | undefined,
	tier: string | undefined,
): Readonly<Record<string, unknown>> {
	const arn =
		parameter === undefined ? undefined : optionalString(parameter, "ARN");
	const type =
		parameter === undefined ? undefined : optionalString(parameter, "Type");
	return {
		parameterName: name,
		...(arn === undefined ? {} : { parameterArn: arn }),
		...(type === undefined ? {} : { parameterType: type }),
		...(tier === undefined ? {} : { parameterTier: tier }),
	};
}

function ssmDiagnostics(context: AwsResolverContext): readonly string[] {
	return optionalString(context.desired, "kmsKeyRef") === undefined
		? []
		: [
				"kmsKeyRef is declared but not applied: a KMS key only encrypts a SecureString parameter, and this resolver refuses SecureString because its value would travel in the request record",
			];
}

const SSM_PARAMETER_SPEC: Omit<AwsResolverSpec, "productId"> = {
	async read(context) {
		const parameter = await readSsmParameter(context);
		if (parameter === undefined) return undefined;
		return outcome(
			settledAction(context),
			context.name,
			ssmOutputs(context.name, parameter, undefined),
			ssmDiagnostics(context),
		);
	},
	async reconcile(context) {
		const type = ssmParameterType(context);
		const value = ssmParameterValue(context);
		const tier = optionalString(context.desired, "tier");
		const awsTier =
			tier === undefined
				? undefined
				: tier === "advanced"
					? "Advanced"
					: "Standard";
		const existing = await readSsmParameter(context);

		if (existing !== undefined) {
			const diagnostics = [...ssmDiagnostics(context)];
			const observedType = optionalString(existing, "Type");
			if (observedType !== undefined && observedType !== type) {
				diagnostics.push(
					`parameter type is ${observedType} but the request asks for ${type}; SSM does not allow a type change on overwrite, so the drift is reported rather than forced`,
				);
			}
			if (optionalString(existing, "Value") === value) {
				return outcome(
					settledAction(context),
					context.name,
					ssmOutputs(context.name, existing, awsTier),
					diagnostics,
				);
			}
			jsonResult(
				context,
				await ssmCall(context, "PutParameter", {
					Name: context.name,
					Value: value,
					Type: type,
					Overwrite: true,
					...(awsTier === undefined ? {} : { Tier: awsTier }),
				}),
				`ssm put parameter ${context.name}`,
			);
			const refreshed = (await readSsmParameter(context)) ?? existing;
			return outcome(
				"update",
				context.name,
				ssmOutputs(context.name, refreshed, awsTier),
				diagnostics,
			);
		}

		jsonResult(
			context,
			await ssmCall(context, "PutParameter", {
				Name: context.name,
				Value: value,
				Type: type,
				Overwrite: false,
				...(awsTier === undefined ? {} : { Tier: awsTier }),
			}),
			`ssm put parameter ${context.name}`,
		);
		// PutParameter answers with a version, not an ARN. Reading back is what
		// makes the outputs of a create identical to the outputs of the reconcile
		// that follows it.
		const created = await readSsmParameter(context);
		return outcome(
			"create",
			context.name,
			ssmOutputs(context.name, created, awsTier),
			ssmDiagnostics(context),
		);
	},
	async remove(context) {
		const response = await ssmCall(context, "DeleteParameter", {
			Name: context.name,
		});
		if (
			!isSuccess(response) &&
			jsonErrorCode(response.body) === "ParameterNotFound"
		) {
			return;
		}
		jsonResult(context, response, `ssm delete parameter ${context.name}`);
	},
};

// ---------------------------------------------------------------------------
// Wrapper and registry
// ---------------------------------------------------------------------------

/** Per-product behaviour; the wrapper owns credentials, naming, and refusals. */
interface AwsResolverSpec {
	readonly productId: string;
	reconcile(context: AwsResolverContext): Promise<ResolveOutcome>;
	read(context: AwsResolverContext): Promise<ResolveOutcome | undefined>;
	remove(context: AwsResolverContext): Promise<void>;
}

function clockOf(nowMs: AwsResolverOptions["nowMs"]): () => number {
	if (typeof nowMs === "function") return nowMs;
	if (typeof nowMs === "number" && Number.isFinite(nowMs)) return () => nowMs;
	throw new ResolverError(
		"RESOLVER_PRODUCT_UNSUPPORTED",
		"aws resolvers need an injected nowMs (a number or a () => number). SigV4 signs a timestamp, and reading the clock inside the resolver would make a signed request untestable",
	);
}

function createResolver(
	spec: AwsResolverSpec,
	options: AwsResolverOptions,
): ResourceResolver {
	const region = parseAwsRegion(options.region);
	const nowMs = clockOf(options.nowMs);
	if (typeof options.resolveCredential !== "function") {
		throw new ResolverError(
			"RESOLVER_CREDENTIAL_MISSING",
			"aws resolvers need an injected resolveCredential(ref): the resolver never reads an environment variable or a credential file itself",
		);
	}

	async function contextFor(
		request: ResolveRequest,
		transport: HttpTransport,
	): Promise<AwsResolverContext> {
		if (request.ref.productId !== spec.productId) {
			throw new ResolverError(
				"RESOLVER_PRODUCT_UNSUPPORTED",
				`aws resolver for ${spec.productId} was handed a request for ${JSON.stringify(request.ref.productId)}; route the request through the registry rather than picking a resolver by hand`,
				spec.productId,
			);
		}
		const credentials = await resolveAwsCredentials(
			request,
			options.resolveCredential,
		);
		return {
			request,
			transport,
			credentials,
			region,
			nowMs,
			name: resourceName(request, spec.productId),
			desired: request.desired,
			knownPhysicalId: knownPhysicalId(request),
			redact(text: string, limit = 400): string {
				return redactAwsText(text, credentials, limit);
			},
		};
	}

	return {
		providerId: AWS_PROVIDER_TARGET,
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
 * Every AWS resolver, id-sorted so the list is a function of the code rather
 * than of construction order. Products named in
 * {@link AWS_UNRESOLVED_PRODUCT_IDS} are deliberately absent.
 */
export function awsResolvers(
	options: AwsResolverOptions,
): readonly ResourceResolver[] {
	const specs: readonly AwsResolverSpec[] = [
		{ productId: AWS_DYNAMODB_PRODUCT_ID, ...DYNAMODB_SPEC },
		{ productId: AWS_S3_PRODUCT_ID, ...S3_SPEC },
		{ productId: AWS_SECRETS_MANAGER_PRODUCT_ID, ...SECRETS_MANAGER_SPEC },
		{ productId: AWS_SNS_PRODUCT_ID, ...SNS_SPEC },
		{
			productId: AWS_SQS_FIFO_PRODUCT_ID,
			...sqsSpec(AWS_SQS_FIFO_PRODUCT_ID),
		},
		{ productId: AWS_SQS_PRODUCT_ID, ...sqsSpec(AWS_SQS_PRODUCT_ID) },
		{ productId: AWS_SSM_PARAMETER_PRODUCT_ID, ...SSM_PARAMETER_SPEC },
	];
	return Object.freeze(
		[...specs]
			.sort((left, right) => compareStrings(left.productId, right.productId))
			.map((spec) => createResolver(spec, options)),
	);
}

/** The same resolvers, behind core's product-id lookup. */
export function awsResolverRegistry(options: AwsResolverOptions): {
	get(productId: string): ResourceResolver | undefined;
	list(): readonly ResourceResolver[];
} {
	return createResolverRegistry(awsResolvers(options));
}
