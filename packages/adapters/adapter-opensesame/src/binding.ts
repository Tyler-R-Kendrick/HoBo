/**
 * Parse, don't validate: the bindings file crosses this boundary once and
 * becomes frozen `ParsedCredentialBinding`s. Everything downstream (the
 * `.env.schema` renderer, the launch, the SecretsPort) takes the parsed type,
 * so no later function re-checks a string.
 *
 * A binding is a reference: where a credential lives (an OpenSesame
 * connection) and how far a surrogate for it may reach (paths and methods).
 * It never holds a token, and an unbounded scope cannot be written down.
 * The regular expressions below are the ones adapter_opensesame.cue carries;
 * test/binding.test.ts reads them out of that file and compares.
 */

import { parseSecretRef } from "@hobo/bindings";

import type { CredentialBinding } from "./_generated/adapter_opensesame_pb.js";
import { OpenSesameAdapterError } from "./errors.js";
import {
	isJsonArray,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
} from "./json.js";

// public-contract: the CUE's locator pattern; test/binding.test.ts compares it with adapter_opensesame.cue.
export const LOCATOR_PATTERN = "^hobo-token://[a-z0-9-]+/[a-z0-9-]+$";
// public-contract: the CUE's connection pattern.
export const CONNECTION_PATTERN = "^conn://[a-z0-9-]+(/[a-z0-9-]+){1,2}$";
// public-contract: the CUE's variable-name pattern.
export const ENV_NAME_PATTERN = "^[A-Z][A-Z0-9_]*$";
// public-contract: the CUE's path-prefix pattern.
export const PATH_PATTERN = "^/[A-Za-z0-9._~%/-]+$";
// public-contract: the CUE's refusal of an empty path segment (`//` bounds nothing).
export const PATH_NO_EMPTY_SEGMENT_PATTERN = "//";
// public-contract: the CUE's refusal of a `.` or `..` segment, which walks out of the prefix it was granted.
export const PATH_NO_DOT_SEGMENT_PATTERN = "/\\.{1,2}(/|$)";

/**
 * The verbs a binding may grant. OpenSesame's plugin checks seven; HEAD and
 * OPTIONS are left out because no HoBo client sends them, and a surrogate
 * never gets a verb nobody asked for.
 */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

const locatorRe = new RegExp(LOCATOR_PATTERN, "u");
const connectionRe = new RegExp(CONNECTION_PATTERN, "u");
const envNameRe = new RegExp(ENV_NAME_PATTERN, "u");
const pathRe = new RegExp(PATH_PATTERN, "u");
const emptySegmentRe = new RegExp(PATH_NO_EMPTY_SEGMENT_PATTERN, "u");
const dotSegmentRe = new RegExp(PATH_NO_DOT_SEGMENT_PATTERN, "u");

const parsed: unique symbol = Symbol("ParsedCredentialBinding");

/**
 * A binding that passed `parseCredentialBindings`. The brand is a module-local
 * symbol, so a value can only be made here; the shape is the generated
 * `CredentialBinding` narrowed to what the CUE allows.
 */
export type ParsedCredentialBinding = Readonly<
	Omit<CredentialBinding, "$typeName" | "paths" | "methods" | "provider"> & {
		provider: "vercel";
		paths: readonly string[];
		methods: readonly HttpMethod[];
	}
> & { readonly [parsed]: true };

const FIELDS = [
	"locator",
	"connection",
	"provider",
	"env_name",
	"paths",
	"methods",
	"projection",
] as const;

const SAFE_KEY = /^[a-z_]{1,32}$/u;

function invalid(where: string, rule: string): OpenSesameAdapterError {
	return new OpenSesameAdapterError("binding_invalid", `${where}: ${rule}`);
}

function str(record: JsonObject, key: string, where: string): string {
	const value = record[key];
	if (!isJsonString(value)) {
		throw invalid(where, `${key} must be a string`);
	}
	return value;
}

function strings(record: JsonObject, key: string, where: string): string[] {
	const value = record[key];
	if (!isJsonArray(value) || value.length === 0) {
		throw invalid(
			where,
			`${key} must be a non-empty list; a surrogate with no declared scope cannot be issued`,
		);
	}
	const out: string[] = [];
	for (const item of value) {
		if (!isJsonString(item)) {
			throw invalid(where, `${key} must hold only strings`);
		}
		out.push(item);
	}
	return out;
}

function notBrokered(provider: string, where: string): OpenSesameAdapterError {
	if (provider === "aws") {
		return new OpenSesameAdapterError(
			"provider_not_brokered",
			`${where}: aws cannot be brokered by a surrogate. AWS requests are signed with SigV4 in process from a live secret key, which header substitution cannot serve, and OpenSesame's AWS helper fails closed until its STS mint exists. Use a bound-resource or federated identity for AWS in the meantime.`,
		);
	}
	return new OpenSesameAdapterError(
		"provider_not_brokered",
		`${where}: this adapter brokers vercel only`,
	);
}

function checkLocator(locator: string, where: string): void {
	if (!locatorRe.test(locator)) {
		throw invalid(where, `locator must match ${LOCATOR_PATTERN}`);
	}
	try {
		if (parseSecretRef(locator).scheme !== "hobo-token") {
			throw invalid(where, "locator must use the hobo-token scheme");
		}
	} catch (error) {
		if (error instanceof OpenSesameAdapterError) throw error;
		throw invalid(where, "locator is not a registered secret reference");
	}
}

function checkPath(path: string, where: string): void {
	if (
		!pathRe.test(path) ||
		emptySegmentRe.test(path) ||
		dotSegmentRe.test(path)
	) {
		throw invalid(
			where,
			"paths must be absolute prefixes of named segments (no empty or dot segment, no query, no list separator)",
		);
	}
}

function isHttpMethod(value: string): value is HttpMethod {
	return HTTP_METHODS.some((method) => method === value);
}

function parseOne(input: JsonValue, index: number): ParsedCredentialBinding {
	const where = `binding[${index}]`;
	if (!isJsonObject(input)) throw invalid(where, "must be an object");
	for (const key of Object.keys(input)) {
		if (!FIELDS.some((field) => field === key)) {
			throw invalid(
				where,
				SAFE_KEY.test(key)
					? `unknown field ${key}; a binding holds references, never a credential`
					: "unknown field; a binding holds references, never a credential",
			);
		}
	}
	const provider = str(input, "provider", where);
	if (provider !== "vercel") throw notBrokered(provider, where);

	const locator = str(input, "locator", where);
	checkLocator(locator, where);
	const connection = str(input, "connection", where);
	if (!connectionRe.test(connection)) {
		throw invalid(where, `connection must match ${CONNECTION_PATTERN}`);
	}
	if (connection.split("/").pop() !== provider) {
		throw invalid(
			where,
			"the last segment of connection names its provider and must equal provider",
		);
	}
	const envName = str(input, "env_name", where);
	if (!envNameRe.test(envName)) {
		throw invalid(where, `env_name must match ${ENV_NAME_PATTERN}`);
	}
	if (str(input, "projection", where) !== "legacy-token") {
		throw invalid(where, "projection must be legacy-token");
	}
	const paths = strings(input, "paths", where);
	for (const path of paths) checkPath(path, where);
	const methods: HttpMethod[] = [];
	for (const method of strings(input, "methods", where)) {
		if (!isHttpMethod(method)) {
			throw invalid(where, `methods must be among ${HTTP_METHODS.join(", ")}`);
		}
		methods.push(method);
	}
	return Object.freeze({
		locator,
		connection,
		provider,
		envName,
		paths: Object.freeze([...paths]),
		methods: Object.freeze(methods),
		projection: "legacy-token",
		[parsed]: true,
	} as const);
}

/**
 * Parse a `hobo.credentials.json` document: `{ "bindings": [ ... ] }`, each
 * binding a snake_case `CredentialBinding` record. Fails closed on the first
 * problem, and never echoes a rejected value.
 */
export function parseCredentialBindings(
	document: JsonValue,
): readonly ParsedCredentialBinding[] {
	if (!isJsonObject(document)) {
		throw invalid("bindings", "must be an object with a bindings list");
	}
	if (Object.keys(document).some((key) => key !== "bindings")) {
		throw invalid("bindings", "only a bindings list is allowed");
	}
	const list = document.bindings;
	if (!isJsonArray(list)) throw invalid("bindings", "bindings must be a list");
	const out: ParsedCredentialBinding[] = [];
	for (const [index, item] of list.entries()) {
		const binding = parseOne(item, index);
		for (const seen of out) {
			if (seen.locator === binding.locator) {
				throw invalid(`binding[${index}]`, "locator is already bound");
			}
			if (seen.envName === binding.envName) {
				throw invalid(`binding[${index}]`, "env_name is already bound");
			}
		}
		out.push(binding);
	}
	return Object.freeze(out);
}
