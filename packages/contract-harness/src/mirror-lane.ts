/**
 * The test side of the mirror lane (ADR-0174): what a `*.mirror.test.ts`
 * needs to reach the mirror.cloud emulator `pnpm run test:mirror` started.
 *
 * - `mirrorLaneEndpoint(env)` reads `HOBO_MIRROR_URL` (and `HOBO_MIRROR_CA`,
 *   the PEM file of the emulator's throwaway CA when it serves TLS). Unset is
 *   `MIRROR_URL_REQUIRED`: the lane fails rather than skips when it is selected
 *   and there is nothing to run against.
 * - `createMirrorTransport(endpoint)` is a transport with the shape of
 *   `@hobo/core`'s `HttpTransport`. It sends a request that a provider's guard
 *   has already checked (`https://api.vercel.com/...`, `https://s3.<region>.amazonaws.com/...`)
 *   to the emulator instead, keeping path, query, headers, body and the
 *   original `Host`. The guard is not touched: the rewrite happens after it.
 * - `readMirrorJournal` parses `GET /_mirror/journal` into frozen entries, and
 *   `mirrorControl` reaches the emulator's own `/_mirror/*` routes.
 * - `recordMirrorLaneReport` leaves a pact verification report where the
 *   runner prints it (`HOBO_MIRROR_REPORTS`), so the lane's output carries the
 *   report whatever the test reporter shows of a passing test.
 *
 * Parse, don't validate: a journal answer becomes `MirrorJournalEntry`
 * values (`data-models/contract-harness.proto` `MirrorJournalEntry`) or a
 * refusal naming what is missing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	exchangeHttp,
	type HttpEndpoint,
	type HttpExchangeResponse,
	parseHttpEndpoint,
} from "./http-provider.js";
import type { InteractionFailure } from "./verify.js";

// public-contract: the variables `scripts/run-mirror-lane.mts` sets for every mirror test.
export const MIRROR_URL_ENV = "HOBO_MIRROR_URL";
// public-contract: the PEM file of the emulator's CA, set only when the lane serves TLS.
export const MIRROR_CA_ENV = "HOBO_MIRROR_CA";
// public-contract: a directory the runner reads verification reports from and prints after the lane.
export const MIRROR_REPORTS_ENV = "HOBO_MIRROR_REPORTS";

export type MirrorLaneErrorCode =
	| "MIRROR_URL_REQUIRED"
	| "MIRROR_JOURNAL_UNREADABLE"
	| "MIRROR_REPORT_NAME_INVALID";

export class MirrorLaneError extends Error {
	readonly code: MirrorLaneErrorCode;

	constructor(code: MirrorLaneErrorCode, message: string) {
		super(`${code}: ${message}`);
		this.name = "MirrorLaneError";
		this.code = code;
	}
}

/** The emulator the lane started, or `MIRROR_URL_REQUIRED` with the way to start one. */
export function mirrorLaneEndpoint(
	env: Readonly<Record<string, string | undefined>>,
): HttpEndpoint {
	const url = env[MIRROR_URL_ENV];
	if (url === undefined || url === "") {
		throw new MirrorLaneError(
			"MIRROR_URL_REQUIRED",
			`${MIRROR_URL_ENV} is not set. The mirror lane runs against a started emulator: run \`pnpm run test:mirror\` (it starts mirror, sets ${MIRROR_URL_ENV} and runs every package's test:mirror), or start one yourself and set ${MIRROR_URL_ENV} to its URL`,
		);
	}
	const caFile = env[MIRROR_CA_ENV];
	return parseHttpEndpoint({
		baseUrl: url,
		...(caFile === undefined || caFile === ""
			? undefined
			: { ca: readFileSync(caFile, "utf8") }),
	});
}

/** What a provider transport sends; structurally `@hobo/core`'s `TransportRequest`. */
export interface MirrorTransportRequest {
	readonly method: string;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly timeoutMs: number;
	readonly maxResponseBytes: number;
}

/**
 * Send each request to the emulator, keeping its path, query and `Host`.
 * Assignable to `@hobo/core`'s `HttpTransport`; hand it to a resolver, which
 * wraps it in its own guard as it would any transport.
 */
export function createMirrorTransport(
	endpoint: HttpEndpoint,
): (request: MirrorTransportRequest) => Promise<HttpExchangeResponse> {
	return async (request) => {
		const url = new URL(request.url);
		return exchangeHttp(
			{
				...endpoint,
				host: url.host,
				timeoutMs: request.timeoutMs,
				maxResponseBytes: request.maxResponseBytes,
			},
			{
				method: request.method,
				path: `${url.pathname}${url.search}`,
				headers: request.headers,
				...(request.body === undefined ? undefined : { body: request.body }),
			},
		);
	};
}

/** One of the emulator's own routes (`/_mirror/...`), answered as it is. */
export function mirrorControl(
	endpoint: HttpEndpoint,
	method: "GET" | "POST" | "DELETE",
	path: `/_mirror/${string}`,
	body?: string,
): Promise<HttpExchangeResponse> {
	return exchangeHttp(endpoint, {
		method,
		path,
		...(body === undefined
			? undefined
			: { headers: { "content-type": "application/json" }, body }),
	});
}

// domain-view: a parsed, frozen journal entry; data-models/contract-harness.proto MirrorJournalEntry is its wire form.
export interface MirrorJournalEntry {
	readonly requestId: string;
	readonly serviceId: string;
	readonly operation: string;
	readonly tier: string;
	readonly status: number;
	readonly errorCode: string;
}

export interface MirrorJournalFilter {
	readonly service?: string;
	readonly operation?: string;
	/** How many of the newest entries to ask for; an emulator older than `?limit=` answers 100 at most. */
	readonly limit?: number;
}

type JsonText = string | number | boolean | null | JsonText[] | JsonRecord;
interface JsonRecord {
	readonly [key: string]: JsonText;
}

const tagOf = Object.prototype.toString;

function field(
	record: JsonRecord,
	key: string,
	kind: "[object String]" | "[object Number]",
): string | number {
	const value = record[key];
	if (tagOf.call(value) !== kind) {
		throw new MirrorLaneError(
			"MIRROR_JOURNAL_UNREADABLE",
			`a journal entry has no ${kind === "[object String]" ? "string" : "number"} ${key}`,
		);
	}
	return kind === "[object String]" ? String(value) : Number(value);
}

/** Newest first, as the emulator keeps them. */
export async function readMirrorJournal(
	endpoint: HttpEndpoint,
	filter: MirrorJournalFilter = {},
): Promise<readonly MirrorJournalEntry[]> {
	const query = new URLSearchParams();
	if (filter.service !== undefined) query.set("service", filter.service);
	if (filter.operation !== undefined) query.set("operation", filter.operation);
	if (filter.limit !== undefined) query.set("limit", String(filter.limit));
	const text = query.toString();
	const answer = await mirrorControl(
		endpoint,
		"GET",
		`/_mirror/journal${text === "" ? "" : `?${text}`}`,
	);
	if (answer.status !== 200) {
		throw new MirrorLaneError(
			"MIRROR_JOURNAL_UNREADABLE",
			`GET /_mirror/journal answered ${answer.status}: ${answer.body.slice(0, 200)}`,
		);
	}
	let parsed: JsonText;
	try {
		// SAFETY: JSON.parse yields a JSON value at this document boundary.
		parsed = JSON.parse(answer.body) as JsonText;
	} catch {
		throw new MirrorLaneError(
			"MIRROR_JOURNAL_UNREADABLE",
			"GET /_mirror/journal did not answer JSON",
		);
	}
	// Mirror encodes an empty journal as `null`, a Go nil slice.
	if (parsed === null) return Object.freeze([]);
	if (!Array.isArray(parsed)) {
		throw new MirrorLaneError(
			"MIRROR_JOURNAL_UNREADABLE",
			"GET /_mirror/journal did not answer a list",
		);
	}
	return Object.freeze(
		parsed.map((entry) => {
			if (tagOf.call(entry) !== "[object Object]") {
				throw new MirrorLaneError(
					"MIRROR_JOURNAL_UNREADABLE",
					"a journal entry is not an object",
				);
			}
			// SAFETY: the tag check above proves this JSON value is an object.
			const record = entry as JsonRecord;
			return Object.freeze({
				requestId: String(field(record, "RequestID", "[object String]")),
				serviceId: String(field(record, "ServiceID", "[object String]")),
				operation: String(field(record, "Operation", "[object String]")),
				tier: String(field(record, "Tier", "[object String]")),
				status: Number(field(record, "Status", "[object Number]")),
				errorCode: String(field(record, "ErrorCode", "[object String]")),
			});
		}),
	);
}

// domain-view: a provider verification as the lane prints it; data-models/contract-harness.proto MirrorLaneReport is its wire form.
export interface MirrorLaneReport {
	readonly consumer: string;
	readonly provider: string;
	readonly interactions: number;
	readonly ok: boolean;
	readonly failures: readonly InteractionFailure[];
}

/**
 * Write `report` as `<name>.json` into the directory `HOBO_MIRROR_REPORTS`
 * names; nothing when it is unset (a file run on its own). The name is one
 * path segment.
 */
export function recordMirrorLaneReport(
	env: Readonly<Record<string, string | undefined>>,
	name: string,
	report: MirrorLaneReport,
): void {
	const dir = env[MIRROR_REPORTS_ENV];
	if (dir === undefined || dir === "") return;
	if (!/^[A-Za-z0-9._-]+$/u.test(name) || name.startsWith(".")) {
		throw new MirrorLaneError(
			"MIRROR_REPORT_NAME_INVALID",
			`report name ${JSON.stringify(name)} must be one plain path segment`,
		);
	}
	writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(report)}\n`);
}
