import type { JsonObject } from "../json.js";
// domain-view: parsed CLI-facing type (string unions, branded ids, literal fields); the package's data-models/*.proto is its wire contract (technical-standards.md).
export interface CliClients {
	readonly readApi: string;
	readonly runtime: string;
}

// domain-view: parsed CLI-facing type (string unions, branded ids, literal fields); the package's data-models/*.proto is its wire contract (technical-standards.md).
export interface CliContext {
	readonly cwd: string;
	readonly projectDir: string | null;
	readonly identity: string | null;
	readonly clients: CliClients;
}

// domain-view: parsed CLI-facing type (string unions, branded ids, literal fields); the package's data-models/*.proto is its wire contract (technical-standards.md).
export interface CliEnvelope {
	readonly ok: boolean;
	readonly verb: string;
	readonly status: string;
	readonly code: string;
	readonly message: string;
	readonly remediation: readonly string[];
	readonly context: CliContext;
	// See `CommandResult.data` below for why this is a record of `unknown`
	// rather than a `JsonObject`.
	readonly data: CommandData;
}

/**
 * A command's structured payload.
 *
 * `Readonly<Record<string, unknown>>`, not `JsonObject`: this is *carried* --
 * `buildEnvelope` puts it on the envelope and the renderer serializes it. No
 * code in this package reads a field off it. Commands legitimately put domain
 * records in here (`readonly BuildArtifact[]`, a `TargetRuntime`), none of which
 * are `JsonValue`, so demanding one made every command's return type stop
 * matching the interface it implements -- a promise about the leaves that
 * nothing checks and everything pays for.
 */
export type CommandData = Readonly<Record<string, unknown>>;

export interface CommandResult {
	readonly ok?: boolean;
	readonly status?: string;
	readonly code?: string;
	readonly message?: string;
	readonly remediation?: readonly string[];
	readonly data?: CommandData;
}

export function publicContext(context: CliContext): CliContext {
	return {
		cwd: context.cwd,
		projectDir: context.projectDir,
		identity: context.identity ?? null,
		clients: context.clients,
	};
}

export function buildEnvelope(input: {
	verb: string;
	context: CliContext;
	result: CommandResult;
}): CliEnvelope {
	const ok = input.result.ok !== false;
	return {
		ok,
		verb: input.verb,
		status: input.result.status ?? (ok ? "ok" : "error"),
		code: input.result.code ?? (ok ? "HOBO_OK" : "HOBO_CLI_ERROR"),
		message: input.result.message ?? "",
		remediation: input.result.remediation ?? [],
		context: publicContext(input.context),
		data: input.result.data ?? {},
	};
}
