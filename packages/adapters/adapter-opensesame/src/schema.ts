/**
 * The `.env.schema` a proxied run reads: references only. One entry per
 * binding, in the form OpenSesame's `dev run` documents,
 *
 *     VERCEL_TOKEN=opensesameConnection(conn://acme/vercel,
 *       projection=legacy-token, paths="/v9/projects", methods="GET")
 *
 * The entry names a connection and bounds a scope; the token it stands for is
 * sealed in the person's store and never appears here. The renderer takes
 * parsed bindings, and still re-checks every value it interpolates: a binding
 * forged past the parser must not be able to add an entry, close a quote or
 * start a comment, so the failure is `schema_injection`, not a surprising file.
 */

import {
	CONNECTION_PATTERN,
	ENV_NAME_PATTERN,
	HTTP_METHODS,
	PATH_NO_DOT_SEGMENT_PATTERN,
	PATH_NO_EMPTY_SEGMENT_PATTERN,
	PATH_PATTERN,
	type ParsedCredentialBinding,
} from "./binding.js";
import { OpenSesameAdapterError } from "./errors.js";

const HEADER = "# @defaultSensitive=false\n# ---\n";

const connectionRe = new RegExp(CONNECTION_PATTERN, "u");
const envNameRe = new RegExp(ENV_NAME_PATTERN, "u");
const pathRe = new RegExp(PATH_PATTERN, "u");
const emptyRe = new RegExp(PATH_NO_EMPTY_SEGMENT_PATTERN, "u");
const dotRe = new RegExp(PATH_NO_DOT_SEGMENT_PATTERN, "u");

function refuse(field: string): never {
	throw new OpenSesameAdapterError(
		"schema_injection",
		`${field} would not stay inside its .env.schema entry; the schema was not written`,
	);
}

function assertRenderable(binding: ParsedCredentialBinding): void {
	if (!envNameRe.test(binding.envName)) refuse("env_name");
	if (!connectionRe.test(binding.connection)) refuse("connection");
	for (const path of binding.paths) {
		if (!pathRe.test(path) || emptyRe.test(path) || dotRe.test(path)) {
			refuse("paths");
		}
	}
	for (const method of binding.methods) {
		if (!HTTP_METHODS.some((known) => known === method)) refuse("methods");
	}
	if (binding.projection !== "legacy-token") refuse("projection");
}

function entry(binding: ParsedCredentialBinding): string {
	assertRenderable(binding);
	return [
		"# @required @sensitive",
		`${binding.envName}=opensesameConnection(${binding.connection}, projection=${binding.projection}, paths="${binding.paths.join(",")}", methods="${binding.methods.join(",")}")`,
	].join("\n");
}

/** The schema text for `bindings`, entries ordered by variable name. */
export function renderEnvSchema(
	bindings: readonly ParsedCredentialBinding[],
): string {
	const entries = [...bindings]
		.sort((left, right) => left.envName.localeCompare(right.envName))
		.map(entry);
	if (entries.length === 0) return HEADER;
	return `${HEADER}\n${entries.join("\n\n")}\n`;
}
