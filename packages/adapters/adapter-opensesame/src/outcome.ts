/**
 * How one `opensesame dev --agent run` ended, read from what it leaves: its
 * exit status and the lines it prints on stderr. This is the process boundary
 * the pact in contracts/ pins.
 *
 * What the binary really does (apps/cli/src/dev_run.rs, dev_supervise.rs,
 * dev_surrogate.rs, dev_credentials.rs, log_sink.rs), and where the status
 * alone is not enough:
 *
 * - the child's own status is passed through; a child killed by a signal is 1;
 * - a tripwire (`surrogate.misdirected`) exits 77, and so can a child, so 77
 *   counts as a tripwire only beside OpenSesame's own line;
 * - SIGTERM or SIGHUP to OpenSesame exits 143 or 129 after revoking the run,
 *   and so can a child, so the same rule applies;
 * - every refusal before the child starts (pin mismatch, an unreadable entry,
 *   a scope the plugin will not issue, a schema that does not parse) is a
 *   fatal error: `Error: <message>` on stderr, status 1;
 * - a run with no plugin, no entry or no brokerable connection starts anyway,
 *   exits as the child does, and hands the child a placeholder. Only a line
 *   on stderr says so, which is why that line is read at all: a green exit
 *   with a placeholder is the false pass this adapter exists to refuse.
 *
 * Only lines in the shape OpenSesame writes (column 0, `opensesame: ` or
 * `Error: `, then the closed set of sentences below) are read, and a refusal needs a
 * failing status beside it. The child shares stderr, so it can print one of those
 * shapes: that gains it a fail-closed kind (a tripwire, a refusal, a placeholder)
 * and never a pass, and nothing it wrote survives. A status of 77, 143 or 129 is
 * advisory beside its line, since a child can return them itself. The gate that
 * a surrogate was really delivered is the SecretsPort, which checks the child's
 * own variable and the run's markers.
 *
 * No text produced by the child, or by a line it could have forged, is ever
 * copied into a `ProxiedRunOutcome` or an error: the notice is a fixed sentence
 * chosen by the kind. Any other `Error:` line is the child's own failure
 * (every uncaught Node exception starts that way) and is reported as a
 * `child_exit` with the status and no words.
 */

import { constants } from "node:os";
import { create } from "@bufbuild/protobuf";

import {
	type ProxiedRunOutcome,
	ProxiedRunOutcomeSchema,
} from "./_generated/adapter_opensesame_pb.js";
import {
	OpenSesameAdapterError,
	type OpenSesameAdapterErrorCode,
} from "./errors.js";

export const OUTCOME_KINDS = [
	"child_exit",
	"tripwire",
	"signalled",
	"placeholders_only",
	"scope_unbounded",
	"schema_refused",
	"plugin_pin_mismatch",
	"store_unreadable",
	"bridge_missing",
] as const;

export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

const TRIPWIRE_EXIT = 77;

const TRIPWIRE = /^opensesame: surrogate\.misdirected: /u;
const SIGTERM_LINE = /^opensesame: SIGTERM: the run is ended/u;
const SIGHUP_LINE = /^opensesame: SIGHUP: the run is ended/u;
const PLACEHOLDER_LINES: readonly RegExp[] = [
	/^opensesame: .*delivering placeholders/u,
	/^opensesame: \S+ will keep its placeholder/u,
	/^opensesame: \S+ has no token to redeem/u,
];
const PIN =
	/^Error: the surrogate-proxy plugin no longer matches its install pin/u;
const STORE =
	/^Error: the sealed entry \S+ \(for [A-Z][A-Z0-9_]*\) (?:cannot be read|is empty)/u;
const SCOPE =
	/^Error: the surrogate-proxy plugin refused the run and issued nothing: \S+ has no bounded scope/u;
const BRIDGE_SCOPE = /^Error: env-spec parse failed: /u;
const BRIDGE_NOT_FOUND =
	/Cannot find (?:package|module)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|No such file or directory|os error 2|ENOENT/u;
const SCHEMA = /^Error: (?:env-spec parse failed|resolve failed): /u;
/** Every other fatal sentence OpenSesame writes about its plugin before the command starts. */
const PLUGIN_REFUSAL = /^Error: the surrogate-proxy plugin /u;

/**
 * The only words a notice ever holds: one fixed sentence per kind. None is
 * built from a line of output, so none can carry what a child printed.
 */
const NOTICE = {
	child_exit: "",
	tripwire:
		"OpenSesame revoked the run: a surrogate was sent to a host that is not its provider's, and the command was stopped",
	signalled:
		"OpenSesame was told to stop: the run was revoked and the command stopped",
	placeholders_only:
		"OpenSesame gave the command a placeholder, not a surrogate",
	scope_unbounded:
		"the surrogate-proxy plugin would not issue a surrogate with no bounded scope",
	schema_refused:
		"OpenSesame or its plugin refused the schema or the run before the command started",
	plugin_pin_mismatch: "the surrogate-proxy plugin changed since it was pinned",
	store_unreadable: "the sealed entry for the connection cannot be read",
	bridge_missing:
		"OpenSesame could not run the env-spec bridge (node, or @env-spec/parser)",
} as const satisfies Readonly<Record<OutcomeKind, string>>;

function outcome(
	kind: OutcomeKind,
	exitCode: number,
	notice: string,
): ProxiedRunOutcome {
	return Object.freeze(
		create(ProxiedRunOutcomeSchema, { kind, exitCode, notice }),
	);
}

function isOwnLine(line: string): boolean {
	return line.startsWith("opensesame: ") || line.startsWith("Error: ");
}

/** The fatal error is the last thing OpenSesame prints: its line and what follows. */
function errorBlock(lines: readonly string[]): string[] {
	const start = lines
		.map((line) => line.startsWith("Error: "))
		.lastIndexOf(true);
	return start < 0 ? [] : lines.slice(start);
}

function classifyError(block: readonly string[]): OutcomeKind | undefined {
	const first = block[0] ?? "";
	const whole = block.join("\n");
	if (PIN.test(first)) return "plugin_pin_mismatch";
	if (STORE.test(first)) return "store_unreadable";
	if (SCOPE.test(first)) return "scope_unbounded";
	if (BRIDGE_SCOPE.test(first) && BRIDGE_NOT_FOUND.test(whole)) {
		return "bridge_missing";
	}
	if (SCHEMA.test(first) || PLUGIN_REFUSAL.test(first)) return "schema_refused";
	return undefined;
}

/**
 * Read a finished run. `exitCode` is null when OpenSesame itself was ended by
 * `signal`; `stderr` is what it and its child wrote there.
 */
export function parseOutcome(
	exitCode: number | null,
	signal: NodeJS.Signals | null,
	stderr: string,
): ProxiedRunOutcome {
	if (signal !== null) {
		const number = constants.signals[signal];
		const name = number === undefined ? "a signal" : signal;
		return outcome(
			"signalled",
			128 + (number ?? 0),
			`OpenSesame was ended by ${name}; the command it started may still be running with a live surrogate`,
		);
	}
	const status = exitCode ?? 1;
	const own = stderr.split("\n").filter(isOwnLine);

	if (status === TRIPWIRE_EXIT && own.some((line) => TRIPWIRE.test(line))) {
		return outcome("tripwire", status, NOTICE.tripwire);
	}
	if (
		(status === 143 && own.some((line) => SIGTERM_LINE.test(line))) ||
		(status === 129 && own.some((line) => SIGHUP_LINE.test(line)))
	) {
		const name = status === 143 ? "SIGTERM" : "SIGHUP";
		return outcome("signalled", status, `${name}: ${NOTICE.signalled}`);
	}
	if (status !== 0) {
		const kind = classifyError(errorBlock(stderr.split("\n")));
		if (kind !== undefined) return outcome(kind, status, NOTICE[kind]);
	}
	if (
		own.some((line) => PLACEHOLDER_LINES.some((pattern) => pattern.test(line)))
	) {
		return outcome("placeholders_only", status, NOTICE.placeholders_only);
	}
	return outcome("child_exit", status, NOTICE.child_exit);
}

const ERROR_FOR = {
	child_exit: "child_exit",
	tripwire: "tripwire_misdirected",
	signalled: "signalled",
	placeholders_only: "placeholders_only",
	scope_unbounded: "scope_unbounded",
	schema_refused: "launch_invalid",
	plugin_pin_mismatch: "plugin_pin_mismatch",
	store_unreadable: "store_unreadable",
	bridge_missing: "bridge_missing",
} as const satisfies Readonly<Record<OutcomeKind, OpenSesameAdapterErrorCode>>;

const WHAT_HAPPENED = {
	child_exit: "the proxied command exited with a failing status",
	tripwire:
		"a surrogate was sent to a host that is not its provider's; the run was revoked and the child stopped",
	// What happened to the command is in the notice, which differs: asked to stop, OpenSesame revoked and stopped it; killed, it may still run.
	signalled: "OpenSesame was ended by a signal",
	placeholders_only:
		"the proxied command holds a placeholder, not a surrogate: install and enable the surrogate-proxy plugin and seal the token with `opensesame pass insert`",
	scope_unbounded:
		"the plugin would not issue a surrogate with no bounded scope",
	schema_refused: "OpenSesame refused the generated .env.schema",
	plugin_pin_mismatch:
		"the surrogate-proxy plugin changed since it was pinned; reinstall it (there is no fallback to placeholders)",
	store_unreadable: "the sealed entry for the connection cannot be read",
	bridge_missing:
		"OpenSesame cannot read the schema: it needs node and the env-spec bridge with @env-spec/parser (OPENSESAME_ENV_PARSE)",
} as const satisfies Readonly<Record<OutcomeKind, string>>;

function kindOf(run: ProxiedRunOutcome): OutcomeKind {
	const kind = OUTCOME_KINDS.find((known) => known === run.kind);
	if (kind === undefined) {
		throw new OpenSesameAdapterError("launch_invalid", "unknown outcome kind");
	}
	return kind;
}

/** The typed refusal for a run, or `undefined` for a child that exited 0. */
export function outcomeError(
	run: ProxiedRunOutcome,
): OpenSesameAdapterError | undefined {
	const kind = kindOf(run);
	if (kind === "child_exit" && run.exitCode === 0) return undefined;
	// Every part is a fixed sentence or a number: none is the child's text.
	const detail =
		kind === "signalled"
			? ` (${run.notice})`
			: kind === "child_exit"
				? ` (status ${run.exitCode})`
				: "";
	return new OpenSesameAdapterError(
		ERROR_FOR[kind],
		`${WHAT_HAPPENED[kind]}${detail}`,
	);
}

/**
 * The status a process relaunched under OpenSesame should exit with: the
 * child's own, a tripwire's 77 or a signal's 128+n as OpenSesame returned it,
 * and 1 for anything that left placeholders or never started the child. When
 * OpenSesame itself was killed by a signal the status is 128+n of that signal,
 * and the command it started may still be running with its surrogate: the
 * notice says so, and nothing here can stop it.
 */
export function exitCodeOf(run: ProxiedRunOutcome): number {
	const kind = kindOf(run);
	if (kind === "child_exit" || kind === "tripwire" || kind === "signalled") {
		return run.exitCode;
	}
	return 1;
}
