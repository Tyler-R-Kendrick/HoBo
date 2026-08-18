/**
 * hobo-code history + alias/dotfiles verbs. Station SQLite, not Atuin.
 */

import {
	type CommandActorKind,
	openSessionShellStore,
	type SessionShellStore,
} from "./session-shell-store.js";
import {
	type AuthedStationView,
	describeAuthedStationSession,
} from "./station-session.js";

export interface HistoryCliResult {
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly data: unknown;
}

function scope(hoboHome: string, env: NodeJS.ProcessEnv): AuthedStationView {
	return describeAuthedStationSession({
		hoboHome,
		env,
		ensureLocalLogin: false,
	});
}

function open(
	hoboHome: string,
	env: NodeJS.ProcessEnv,
): { store: SessionShellStore; view: AuthedStationView } | HistoryCliResult {
	const view = scope(hoboHome, env);
	if (!view.loggedIn || view.stationId.length === 0) {
		return {
			ok: false,
			code: "HOBO_AUTH_REQUIRED",
			message: view.message || "Not logged in — run: hobo-code auth login",
			data: { events: [], aliases: [], env: [] },
		};
	}
	return {
		store: openSessionShellStore({
			hoboHome,
			stationId: view.stationId,
			environment: view.environment,
		}),
		view,
	};
}

export function runHistoryCli(input: {
	readonly hoboHome: string;
	readonly env: NodeJS.ProcessEnv;
	readonly args: readonly string[];
	readonly flags: Record<string, string | boolean>;
	readonly cwd: string;
}): HistoryCliResult {
	const opened = open(input.hoboHome, input.env);
	if (!("store" in opened)) return opened;
	const { store } = opened;
	try {
		const [sub, ...rest] = input.args;
		if (sub === "record") {
			const command = rest.join(" ").trim();
			if (command.length === 0) {
				return {
					ok: false,
					code: "HOBO_CODE_HISTORY_EMPTY",
					message: "usage: hobo-code history record <command>",
					data: {},
				};
			}
			const recorded = store.recordCommand({
				sessionId: "cli",
				cwd: input.cwd,
				command,
				actor: {
					kind: "human",
					name: "cli",
					instanceId: "cli",
					generation: 1,
				},
				...(typeof input.flags.exit === "string"
					? {
							outcome: {
								exitCode: Number(input.flags.exit),
								durationMs: 0,
							},
						}
					: {}),
			});
			return {
				ok: true,
				code: "HOBO_CODE_HISTORY",
				message: recorded.command,
				data: { recorded },
			};
		}
		const q = (sub === "search" ? rest.join(" ") : input.args.join(" ")).trim();
		const author =
			typeof input.flags.author === "string" ? input.flags.author : "";
		const events = store.search({
			...(q.length > 0 ? { q } : {}),
			cwd: input.cwd,
			failedOnly: input.flags.failed === true,
			...(author === "human" || author === "agent" || author === "automation"
				? { authorKind: author as CommandActorKind }
				: {}),
		});
		const lines =
			events.length === 0
				? ["(empty)"]
				: events.map((row) => {
						const exit =
							row.outcome === undefined ? "·" : String(row.outcome.exitCode);
						return `${row.recordedAt.slice(11, 19)}  ${row.actor.kind[0]}  ${exit}  ${row.command}`;
					});
		return {
			ok: true,
			code: "HOBO_CODE_HISTORY",
			message: ["▣ history", ...lines].join("\n"),
			data: { events },
		};
	} finally {
		store.close();
	}
}

export function runAliasCli(input: {
	readonly hoboHome: string;
	readonly env: NodeJS.ProcessEnv;
	readonly args: readonly string[];
}): HistoryCliResult {
	const opened = open(input.hoboHome, input.env);
	if (!("store" in opened)) return opened;
	const { store } = opened;
	try {
		const [sub, name, ...rest] = input.args;
		if (sub === "set" && name) {
			const alias = store.setAlias(name, rest.join(" ").trim());
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message: `alias ${alias.name}='${alias.body}'`,
				data: { alias },
			};
		}
		if ((sub === "rm" || sub === "remove") && name) {
			store.removeAlias(name);
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message: `removed ${name}`,
				data: { removed: name },
			};
		}
		if (sub === "env" && name === "set" && rest[0]) {
			const envVar = store.setEnv(rest[0], rest.slice(1).join(" ").trim());
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message: `export ${envVar.name}='${envVar.value}'`,
				data: { env: envVar },
			};
		}
		if (sub === "env" && (name === "rm" || name === "remove") && rest[0]) {
			store.removeEnv(rest[0]);
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message: `removed ${rest[0]}`,
				data: { removed: rest[0] },
			};
		}
		if (sub === "env") {
			const envVars = store.listEnv();
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message:
					envVars.length === 0
						? "▣ env\n (empty)"
						: [
								"▣ env",
								...envVars.map((row) => ` ${row.name}=${row.value}`),
							].join("\n"),
				data: { env: envVars },
			};
		}
		if (sub === "export") {
			const script = store.exportDotfiles("bash");
			return {
				ok: true,
				code: "HOBO_CODE_ALIAS",
				message: script,
				data: {
					script,
					aliases: store.listAliases(),
					env: store.listEnv(),
				},
			};
		}
		const aliases = store.listAliases();
		return {
			ok: true,
			code: "HOBO_CODE_ALIAS",
			message:
				aliases.length === 0
					? "▣ alias\n (empty)"
					: [
							"▣ alias",
							...aliases.map((row) => ` ${row.name}='${row.body}'`),
						].join("\n"),
			data: { aliases, env: store.listEnv() },
		};
	} catch (error) {
		return {
			ok: false,
			code: "HOBO_CODE_ALIAS",
			message: error instanceof Error ? error.message : String(error),
			data: {},
		};
	} finally {
		store.close();
	}
}
