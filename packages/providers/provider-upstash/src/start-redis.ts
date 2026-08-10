/**
 * Parse-don't-validate boundary for the `start-redis` markdown response.
 *
 * The provider hands back a human-readable markdown document with a live REST
 * token in it. That is a hostile shape to parse, because the obvious approach
 * — find something that looks like a URL, find something that looks like a
 * token — keeps "working" after the document is restructured, and hands the
 * caller the wrong string instead of an error.
 *
 * So there is no scraping here:
 *
 * - The document must open with the expected heading. An error page, a
 *   maintenance notice, and a captive portal all fail on the first line
 *   instead of being mined for fields.
 * - Exactly {@link EXPECTED_FIELD_LABELS} are understood, each required, each
 *   permitted once. A **new** labelled field is a rejection, not something to
 *   ignore: the one Upstash is most likely to add is another credential, and
 *   silently skipping it means a token this driver neither deposits nor
 *   redacts.
 * - Every value has an explicit charset and length bound.
 * - The console and metrics URLs must name the same database as the
 *   `Database ID` field. A console link pointing elsewhere is a claim
 *   hijack, and there is no benign reading of it.
 * - Anything unparseable fails closed with `PROVIDER_CONTRACT_CHANGED`. There
 *   is no partial success: a response missing the endpoint is not a database
 *   with an unknown endpoint, it is a document this driver does not
 *   understand.
 *
 * Prose between the fields is ignored on purpose — the quickstart changes
 * often and carries no contract — but the document as a whole stays bounded in
 * bytes, lines, and line length.
 *
 * Sources, checked 2026-08-08 (full list in the README):
 * - https://upstash.com/docs/redis/sdks/ts/getstarted
 * - https://upstash.com/start-redis
 */
import type { StartRedisDatabase as StartRedisDatabaseWire } from "./_generated/temporary_redis_pb.js";
import { redactProviderText, UpstashProviderError } from "./errors.js";
import type { DomainView } from "./wire.js";

/**
 * The response shape this parser understands.
 *
 * Bump it — do not widen the parser in place — when the provider changes the
 * document. The version is carried on every parse result so a receipt records
 * which contract produced it.
 */
// public-contract: parser contract id carried on every parse result.
export const UPSTASH_START_REDIS_CONTRACT =
	"upstash.start-redis.markdown/v1" as const;

/** The exact heading the document opens with. */
// public-contract: the heading whose change is the drift signal.
export const EXPECTED_HEADING = "# Your Redis is ready";

/** Every label this parser version understands. All are required. */
export const EXPECTED_FIELD_LABELS = [
	"Database ID",
	"Endpoint",
	"Token",
	"Metrics",
	"Expires",
] as const;

export type ExpectedFieldLabel = (typeof EXPECTED_FIELD_LABELS)[number];

export const MAX_PAYLOAD_BYTES = 16_384;
export const MAX_PAYLOAD_LINES = 200;
export const MAX_LINE_LENGTH = 1_024;

// domain-view: the wire message keeps `token_present` and no token; the parse
// result is the one place the plaintext token exists, for its single hop to
// custody, so that flag is dropped here and the credential is added.
export type StartRedisDatabase = DomainView<
	StartRedisDatabaseWire,
	{
		contract: typeof UPSTASH_START_REDIS_CONTRACT;
		/**
		 * Earliest instant consistent with the reported date.
		 *
		 * `int64` on the wire; epoch milliseconds are a JSON-safe `number`
		 * here, which is what every consumer in this package compares against
		 * a clock reading.
		 */
		expiresAtMs: number;
	},
	"tokenPresent"
> & {
	/**
	 * The bearer token, in plaintext.
	 *
	 * The only field in this package that holds credential material, and it
	 * exists for exactly one hop: the driver deposits it into secret custody
	 * and keeps a SecretRef. It is deliberately absent from the wire message
	 * and from every record, receipt, fact, binding, and error. If you are
	 * about to pass a `StartRedisDatabase` somewhere, pass
	 * {@link describeStartRedisDatabase} instead.
	 */
	readonly token: string;
};

/** Everything about a parsed response that is safe to log. */
export type StartRedisSummary = {
	readonly contract: typeof UPSTASH_START_REDIS_CONTRACT;
	readonly databaseId: string;
	readonly restEndpointHost: string;
	readonly expiresAtIso: string;
	readonly consoleUrl: string;
	readonly tokenBytes: number;
};

const UUID_V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FIELD_LINE = /^\*\*([A-Za-z][A-Za-z0-9 ]{0,39}):\*\*[ \t]+(.+?)[ \t]*$/u;
const CONSOLE_LINE =
	/^https:\/\/upstash\.com\/start-redis\/console\/([0-9a-f-]{36})$/u;
const ENDPOINT =
	/^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.upstash\.io)$/u;
const TOKEN = /^[A-Za-z0-9_=-]{20,1024}$/u;
const EXPIRES = /^(\d{4}-\d{2}-\d{2}) \((\d{1,3}) days? from creation\)\.?$/u;
const METRICS_PREFIX = "https://upstash.com/start-redis/metrics/";
// Detecting control characters in an untrusted document is the point. Tab, CR,
// and LF are excluded because the markdown legitimately contains them.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the purpose
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function contractError(
	message: string,
	detail?: Record<string, string | number>,
): never {
	throw new UpstashProviderError("PROVIDER_CONTRACT_CHANGED", message, {
		...(detail !== undefined ? { detail } : {}),
	});
}

function boundedLines(body: string): readonly string[] {
	if (typeof body !== "string" || body.length === 0) {
		contractError("start-redis response body was empty");
	}
	const bytes = Buffer.byteLength(body, "utf8");
	if (bytes > MAX_PAYLOAD_BYTES) {
		contractError(
			`start-redis response is ${bytes} bytes, above the ${MAX_PAYLOAD_BYTES} byte ceiling`,
		);
	}
	if (CONTROL_CHARS.test(body)) {
		contractError("start-redis response contains control characters");
	}
	const lines = body.split(/\r?\n/u);
	if (lines.length > MAX_PAYLOAD_LINES) {
		contractError(
			`start-redis response has ${lines.length} lines, above the ${MAX_PAYLOAD_LINES} line ceiling`,
		);
	}
	for (const line of lines) {
		if (line.length > MAX_LINE_LENGTH) {
			contractError(
				`start-redis response contains a line above the ${MAX_LINE_LENGTH} character ceiling`,
			);
		}
	}
	return lines;
}

function readFields(lines: readonly string[]): ReadonlyMap<string, string> {
	const fields = new Map<string, string>();
	for (const line of lines) {
		const match = FIELD_LINE.exec(line.trim());
		if (match === null) continue;
		const label = match[1] as string;
		const value = match[2] as string;
		if (!(EXPECTED_FIELD_LABELS as readonly string[]).includes(label)) {
			// The likeliest new field is another credential. Ignoring it would
			// mean one this driver never deposits and never redacts.
			contractError(
				`start-redis response carries an unreviewed ${JSON.stringify(label)} field`,
			);
		}
		if (fields.has(label)) {
			// Two `Token:` lines is not a document with a token, it is a
			// document whose meaning is ambiguous.
			contractError(`start-redis response repeats the ${label} field`);
		}
		fields.set(label, value);
	}
	return fields;
}

function requireField(
	fields: ReadonlyMap<string, string>,
	label: ExpectedFieldLabel,
	body: string,
): string {
	const value = fields.get(label);
	if (value === undefined) {
		contractError(`start-redis response is missing the ${label} field`, {
			preview: redactProviderText(body, 120),
		});
	}
	return value;
}

/**
 * Parse a `POST https://upstash.com/start-redis` response body.
 *
 * @param body the raw `text/markdown` document
 */
export function parseStartRedisResponse(body: string): StartRedisDatabase {
	const lines = boundedLines(body);

	const heading = lines.find((line) => line.trim().length > 0)?.trim();
	if (heading !== EXPECTED_HEADING) {
		contractError(
			`start-redis response does not open with ${JSON.stringify(EXPECTED_HEADING)}`,
		);
	}

	const fields = readFields(lines);

	const databaseId = requireField(fields, "Database ID", body);
	if (!UUID_V4.test(databaseId)) {
		contractError("start-redis Database ID is not a UUIDv4");
	}

	const endpointMatch = ENDPOINT.exec(requireField(fields, "Endpoint", body));
	if (endpointMatch === null) {
		// A database endpoint on someone else's domain is the whole attack.
		contractError("start-redis Endpoint is not an https host under upstash.io");
	}
	const restEndpointHost = endpointMatch[1] as string;

	const token = requireField(fields, "Token", body);
	if (!TOKEN.test(token)) {
		// Never echo the value: a token that failed a charset check is still
		// a token.
		contractError(
			"start-redis Token is outside the expected charset or length bounds",
			{
				length: token.length,
			},
		);
	}

	// The observed field is the URL followed by a parenthesised note about the
	// JSON it returns, so the prefix is checked and the note is discarded.
	const metrics = requireField(fields, "Metrics", body);
	const expectedMetricsUrl = `${METRICS_PREFIX}${databaseId}`;
	if (
		metrics !== expectedMetricsUrl &&
		!metrics.startsWith(`${expectedMetricsUrl} `)
	) {
		contractError(
			"start-redis Metrics URL does not address the returned database id",
			{
				databaseId,
			},
		);
	}

	const expiresRaw = requireField(fields, "Expires", body);
	const expiresMatch = EXPIRES.exec(expiresRaw);
	if (expiresMatch === null) {
		contractError(
			"start-redis Expires field does not match `<YYYY-MM-DD> (N days from creation)`",
		);
	}
	const expiresOn = expiresMatch[1] as string;
	const expiresAtMs = Date.parse(`${expiresOn}T00:00:00.000Z`);
	if (!Number.isFinite(expiresAtMs)) {
		contractError("start-redis Expires date is not a real date");
	}

	const consoleIds = new Set<string>();
	let consoleUrl: string | undefined;
	for (const line of lines) {
		const match = CONSOLE_LINE.exec(line.trim());
		if (match === null) continue;
		consoleIds.add(match[1] as string);
		consoleUrl = line.trim();
	}
	if (consoleUrl === undefined) {
		contractError(
			"start-redis response carries no console URL to claim the database with",
		);
	}
	if (consoleIds.size > 1) {
		contractError(
			"start-redis response carries console URLs for more than one database",
		);
	}
	if (!consoleIds.has(databaseId)) {
		contractError(
			"start-redis console URL does not address the returned database id",
			{
				databaseId,
			},
		);
	}

	return {
		contract: UPSTASH_START_REDIS_CONTRACT,
		databaseId,
		restEndpointHost,
		restEndpointUrl: `https://${restEndpointHost}`,
		token,
		expiresOn,
		expiresAtMs,
		expiresAtIso: new Date(expiresAtMs).toISOString(),
		expiresRaw,
		statedTtlDays: Number(expiresMatch[2]),
		consoleUrl,
		metricsUrl: expectedMetricsUrl,
	};
}

/** The only safe way to render a parsed response. */
export function describeStartRedisDatabase(
	database: StartRedisDatabase,
): StartRedisSummary {
	return {
		contract: database.contract,
		databaseId: database.databaseId,
		restEndpointHost: database.restEndpointHost,
		expiresAtIso: database.expiresAtIso,
		consoleUrl: database.consoleUrl,
		tokenBytes: Buffer.byteLength(database.token, "utf8"),
	};
}

/**
 * The metrics document, which is JSON rather than markdown.
 *
 * Every counter is optional: the announcement that documents them is not a
 * schema, and failing the whole read because a field was renamed would break
 * observation over something the driver only reports.
 */
export type StartRedisMetrics = {
	readonly databaseId: string;
	readonly uptimeSeconds?: number;
	readonly commandsTotal?: number;
	readonly keys?: number;
	readonly memoryBytes?: number;
	readonly bytesIn?: number;
	readonly bytesOut?: number;
};

function optionalCount(
	record: Readonly<Record<string, unknown>>,
	key: string,
): number | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		contractError(
			`start-redis metrics field ${key} is not a non-negative number`,
		);
	}
	return value;
}

export function parseStartRedisMetrics(
	body: string,
	databaseId: string,
): StartRedisMetrics {
	let decoded: unknown;
	try {
		decoded = JSON.parse(body) as unknown;
	} catch {
		return contractError("start-redis metrics response was not JSON", {
			preview: redactProviderText(body, 80),
		});
	}
	if (
		typeof decoded !== "object" ||
		decoded === null ||
		Array.isArray(decoded)
	) {
		contractError("start-redis metrics response was not a JSON object");
	}
	const record = decoded as Readonly<Record<string, unknown>>;
	const uptimeSeconds = optionalCount(record, "uptime_seconds");
	const commandsTotal = optionalCount(record, "commands_total");
	const keys = optionalCount(record, "keys");
	const memoryBytes = optionalCount(record, "memory_bytes");
	const bytesIn = optionalCount(record, "bytes_in");
	const bytesOut = optionalCount(record, "bytes_out");
	return {
		databaseId,
		...(uptimeSeconds !== undefined ? { uptimeSeconds } : {}),
		...(commandsTotal !== undefined ? { commandsTotal } : {}),
		...(keys !== undefined ? { keys } : {}),
		...(memoryBytes !== undefined ? { memoryBytes } : {}),
		...(bytesIn !== undefined ? { bytesIn } : {}),
		...(bytesOut !== undefined ? { bytesOut } : {}),
	};
}
