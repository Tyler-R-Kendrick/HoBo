/**
 * Provider verification over real HTTP.
 *
 * `verifyPact` asks a `ProviderStub` to answer each interaction. The stubs a
 * package writes by hand answer in process; this one sends the interaction to
 * a running HTTP server and hands back what the server said, so the same pact
 * a consumer test checks against `createMockProviderFromPact` is verified
 * against a real implementation of the provider (an emulator started for the
 * run, or a provider package's own server).
 *
 * `exchangeHttp` is the one exchange underneath, exported because a client
 * under test needs exactly this to reach the same server: a provider's guarded
 * transport, rewritten to a loopback origin that keeps the request's `Host`.
 *
 * Node builtins only, so the package keeps its zero runtime dependencies.
 * Redirects are never followed (node:http does not), every exchange has a
 * deadline and a response cap, and no proxy from the environment is used
 * (`agent: false`), because the servers this reaches are on loopback.
 *
 * Parse, don't validate: `parseHttpProviderTarget` and `parseHttpEndpoint`
 * are the only way to the derived, frozen types the exchange runs on.
 * Records: `data-models/contract-harness.proto` (`HttpProviderTarget`,
 * `HttpExchangeRequest`, `HttpExchangeResponse`) and their CUE constraints.
 */
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import type { PactRequest, PactResponse } from "./pact.js";
import type { ProviderStub } from "./verify.js";

// public-contract: every refusal this module reports, each a prefix of its message.
export const HTTP_PROVIDER_ERROR_CODES = Object.freeze([
	"HTTP_PROVIDER_TARGET_INVALID",
	"HTTP_PROVIDER_UNREACHABLE",
	"HTTP_PROVIDER_TIMEOUT",
	"HTTP_PROVIDER_RESPONSE_TOO_LARGE",
] as const);
export type HttpProviderErrorCode = (typeof HTTP_PROVIDER_ERROR_CODES)[number];

export class HttpProviderError extends Error {
	readonly code: HttpProviderErrorCode;

	constructor(code: HttpProviderErrorCode, message: string, cause?: Error) {
		super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
		this.name = "HttpProviderError";
		this.code = code;
	}
}

/** What a caller writes; `parseHttpEndpoint` derives the checked form. */
export interface HttpEndpointInput {
	/** `http://` or `https://` origin, optionally with a path the request path is appended to. */
	readonly baseUrl: string;
	/** Sent as the `Host` header. TLS is verified against `baseUrl`'s host, not this. */
	readonly host?: string;
	/** PEM certificate(s) trusted for an https `baseUrl`, in place of the system roots. */
	readonly ca?: string;
	/** Deadline for the whole exchange. Default 15000. */
	readonly timeoutMs?: number;
	/** Largest response body read. Default 1 MiB. */
	readonly maxResponseBytes?: number;
}

declare const checked: unique symbol;

/** A checked endpoint: only `parseHttpEndpoint` makes one. */
export type HttpEndpoint = Readonly<HttpEndpointInput> & {
	readonly [checked]: "HttpEndpoint";
};

export interface HttpProviderTargetInput extends HttpEndpointInput {
	/** The pact's provider name (`^[A-Z][A-Za-z0-9]*$`, as `pact.ts` requires). */
	readonly name: string;
}

// domain-view: the parsed, frozen target (branded); data-models/contract-harness.proto HttpProviderTarget is its wire form.
export interface HttpProviderTarget extends HttpEndpointInput {
	readonly name: string;
	readonly [checked]: "HttpProviderTarget";
}

// domain-view: one request on the wire; data-models/contract-harness.proto HttpExchangeRequest is its wire form.
export interface HttpExchangeRequest {
	readonly method: string;
	/** Path and query, starting with `/`. */
	readonly path: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
}

// domain-view: one answer on the wire, headers lower-cased; data-models/contract-harness.proto HttpExchangeResponse is its wire form.
export interface HttpExchangeResponse {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
// The pact participant grammar (`pact.ts`), restated so this module does not
// widen pact.ts's exports for one regular expression.
const PARTICIPANT_NAME = /^[A-Z][A-Za-z0-9]*$/u;
const HOST =
	/^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/u;
const METHOD = /^[A-Z]+$/u;

function invalid(message: string): HttpProviderError {
	return new HttpProviderError("HTTP_PROVIDER_TARGET_INVALID", message);
}

function positiveInteger(
	value: number | undefined,
	field: string,
): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value) || value < 1) {
		throw invalid(`${field} must be a positive integer, got ${value}`);
	}
	return value;
}

function parseBaseUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw invalid(
			`baseUrl must be an absolute URL, got ${JSON.stringify(raw)}`,
		);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw invalid(`baseUrl must use http or https, got ${url.protocol}`);
	}
	if (url.username !== "" || url.password !== "") {
		throw invalid("baseUrl must not carry userinfo");
	}
	if (url.search !== "" || url.hash !== "") {
		throw invalid("baseUrl must not carry a query or a fragment");
	}
	return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

/** The checked, frozen endpoint, or `HTTP_PROVIDER_TARGET_INVALID` naming what is wrong. */
export function parseHttpEndpoint(input: HttpEndpointInput): HttpEndpoint {
	const baseUrl = parseBaseUrl(input.baseUrl);
	if (input.host !== undefined && !HOST.test(input.host)) {
		throw invalid(
			`host must be a host name with an optional port, got ${JSON.stringify(input.host)}`,
		);
	}
	if (
		input.ca !== undefined &&
		!input.ca.includes("-----BEGIN CERTIFICATE-----")
	) {
		throw invalid("ca must be PEM certificate text");
	}
	const timeoutMs = positiveInteger(input.timeoutMs, "timeoutMs");
	const maxResponseBytes = positiveInteger(
		input.maxResponseBytes,
		"maxResponseBytes",
	);
	// SAFETY: the brand is added only here, after every field above was checked.
	return Object.freeze({
		baseUrl,
		...(input.host === undefined ? undefined : { host: input.host }),
		...(input.ca === undefined ? undefined : { ca: input.ca }),
		...(timeoutMs === undefined ? undefined : { timeoutMs }),
		...(maxResponseBytes === undefined ? undefined : { maxResponseBytes }),
	}) as HttpEndpoint;
}

/** A checked provider target: a pact provider name and the endpoint that serves it. */
export function parseHttpProviderTarget(
	input: HttpProviderTargetInput,
): HttpProviderTarget {
	if (!PARTICIPANT_NAME.test(input.name)) {
		throw invalid(
			`name must match ${PARTICIPANT_NAME.source}, got ${JSON.stringify(input.name)}`,
		);
	}
	const endpoint = parseHttpEndpoint(input);
	const target: HttpProviderTargetInput = { name: input.name, ...endpoint };
	// SAFETY: name and endpoint are both checked above; the brand records that.
	return Object.freeze(target) as HttpProviderTarget;
}

function flattenHeaders(
	headers: IncomingHttpHeaders,
): Readonly<Record<string, string>> {
	const flat: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		flat[name] = Array.isArray(value) ? value.join(", ") : value;
	}
	return Object.freeze(flat);
}

function outgoingHeaders(
	request: HttpExchangeRequest,
	host: string | undefined,
): OutgoingHttpHeaders {
	const headers: OutgoingHttpHeaders = {};
	for (const [name, value] of Object.entries(request.headers ?? {})) {
		headers[name.toLowerCase()] = value;
	}
	if (host !== undefined) headers.host = host;
	if (request.body !== undefined) {
		headers["content-length"] = Buffer.byteLength(request.body, "utf8");
	}
	return headers;
}

/**
 * The TLS name to present and verify: the base URL's host, never the `Host`
 * header. A loopback emulator's certificate names the address it was reached
 * at (and, for mirror, `api.vercel.com`), not every provider host a rewritten
 * request carries (`s3.us-east-1.amazonaws.com`). An IP literal sends no SNI
 * and is verified against the certificate's IP addresses.
 */
function serverName(url: URL): string | undefined {
	const name = url.hostname.replace(/^\[|\]$/gu, "");
	return isIP(name) === 0 ? name : undefined;
}

function causeCode(error: Error): string {
	return "code" in error &&
		Object.prototype.toString.call(error.code) === "[object String]"
		? String(error.code)
		: error.name;
}

/**
 * Send one request to `endpoint` and read the whole answer. Rejects with
 * `HTTP_PROVIDER_UNREACHABLE` (the socket error's code in the message, such as
 * ECONNREFUSED), `HTTP_PROVIDER_TIMEOUT` or `HTTP_PROVIDER_RESPONSE_TOO_LARGE`;
 * any HTTP status, 5xx included, is an answer, not a rejection.
 */
export function exchangeHttp(
	endpoint: HttpEndpointInput,
	request: HttpExchangeRequest,
): Promise<HttpExchangeResponse> {
	const parsed = parseHttpEndpoint(endpoint);
	if (!METHOD.test(request.method)) {
		return Promise.reject(
			invalid(
				`method must be an upper-case token, got ${JSON.stringify(request.method)}`,
			),
		);
	}
	if (!request.path.startsWith("/")) {
		return Promise.reject(
			invalid(`path must start with /, got ${JSON.stringify(request.path)}`),
		);
	}
	const base = new URL(parsed.baseUrl);
	const where = `${request.method} ${parsed.baseUrl}${request.path}`;
	const timeoutMs = parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const cap = parsed.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
	const tls = base.protocol === "https:";
	const name = tls ? serverName(base) : undefined;
	const send = tls ? httpsRequest : httpRequest;

	return new Promise((resolve, reject) => {
		let settled = false;
		const settle = (outcome: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			outcome();
		};
		const outgoing = send(
			{
				protocol: base.protocol,
				hostname: base.hostname.replace(/^\[|\]$/gu, ""),
				port: base.port === "" ? undefined : Number(base.port),
				method: request.method,
				path: `${base.pathname.replace(/\/+$/u, "")}${request.path}`,
				headers: outgoingHeaders(request, parsed.host),
				agent: false,
				...(parsed.ca === undefined ? undefined : { ca: parsed.ca }),
				...(name === undefined ? undefined : { servername: name }),
			},
			(response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > cap) {
						settle(() =>
							reject(
								new HttpProviderError(
									"HTTP_PROVIDER_RESPONSE_TOO_LARGE",
									`${where} answered more than ${cap} bytes`,
								),
							),
						);
						outgoing.destroy();
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () =>
					settle(() =>
						resolve(
							Object.freeze({
								status: response.statusCode ?? 0,
								headers: flattenHeaders(response.headers),
								body: Buffer.concat(chunks).toString("utf8"),
							}),
						),
					),
				);
				response.on("error", (error: Error) =>
					settle(() =>
						reject(
							new HttpProviderError(
								"HTTP_PROVIDER_UNREACHABLE",
								`${where} failed while reading the answer: ${causeCode(error)}`,
								error,
							),
						),
					),
				);
			},
		);
		const timer = setTimeout(() => {
			settle(() =>
				reject(
					new HttpProviderError(
						"HTTP_PROVIDER_TIMEOUT",
						`${where} did not answer within ${timeoutMs} ms`,
					),
				),
			);
			outgoing.destroy();
		}, timeoutMs);
		outgoing.on("error", (error: Error) =>
			settle(() =>
				reject(
					new HttpProviderError(
						"HTTP_PROVIDER_UNREACHABLE",
						`${where} failed: ${causeCode(error)} ${error.message}`,
						error,
					),
				),
			),
		);
		outgoing.end(request.body);
	});
}

function readBody(text: string): PactResponse["body"] {
	if (text === "") return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * A `ProviderStub` whose answers come from a real server. A pact body is JSON,
 * so it is sent as JSON (with `content-type: application/json` unless the pact
 * names one); an answer that parses as JSON is compared as JSON, any other
 * answer as its text. A status the server sends, 501 included, is reported to
 * `verifyPact` as it is; a server that cannot be reached rejects.
 */
export function createHttpProviderStub(
	target: HttpProviderTarget,
): ProviderStub {
	return {
		name: target.name,
		async handle(request: PactRequest): Promise<PactResponse> {
			const body =
				request.body === undefined ? undefined : JSON.stringify(request.body);
			const named = Object.keys(request.headers ?? {}).some(
				(header) => header.toLowerCase() === "content-type",
			);
			const answer = await exchangeHttp(target, {
				method: request.method,
				path: request.path,
				headers: {
					...(body === undefined || named
						? undefined
						: { "content-type": "application/json" }),
					...request.headers,
				},
				...(body === undefined ? undefined : { body }),
			});
			return {
				status: answer.status,
				headers: answer.headers,
				body: readBody(answer.body),
			};
		},
	};
}
