/**
 * Station-local SQLite store for hobo-code shell memory:
 * command history, aliases, and env vars. Occupancy-scoped, not Atuin.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	type CommandSensitivity,
	classifyCommand,
	redactCommand,
} from "./command-redaction.js";

// public-contract: Station shell-memory snapshot schema
export const SESSION_SHELL_SCHEMA = "hobo.code.shell-memory/v1" as const;

export type CommandActorKind = "human" | "agent" | "automation";
export type CommandTrust = "hobo-executed" | "externally-imported";
export type CommandSource = "hobo-pty" | "hobo-harness" | "hobo-cli";

export interface CommandActor {
	readonly kind: CommandActorKind;
	readonly name: string;
	readonly instanceId: string;
	readonly generation: number;
}

export interface CommandOutcome {
	readonly exitCode: number;
	readonly durationMs: number;
	readonly signal?: string;
}

export interface CommandEvent {
	readonly schemaVersion: typeof SESSION_SHELL_SCHEMA;
	readonly id: string;
	readonly recordedAt: string;
	readonly stationId: string;
	readonly environment: string;
	readonly sessionId: string;
	readonly paneId?: string;
	readonly actor: CommandActor;
	readonly cwd: string;
	readonly command: string;
	readonly outcome?: CommandOutcome;
	readonly hostname: string;
	readonly sensitivity: CommandSensitivity;
	readonly trust: CommandTrust;
	readonly source: CommandSource;
	readonly score?: number;
}

export interface ShellAlias {
	readonly name: string;
	readonly body: string;
	readonly updatedAt: string;
}

export interface ShellEnvVar {
	readonly name: string;
	readonly value: string;
	readonly updatedAt: string;
}

export interface RecordCommandInput {
	readonly sessionId: string;
	readonly paneId?: string;
	readonly actor: CommandActor;
	readonly cwd: string;
	readonly command: string;
	readonly outcome?: CommandOutcome;
	readonly recordedAt?: string;
	readonly source?: CommandSource;
	readonly hostname?: string;
}

export interface SearchCommandsInput {
	readonly q?: string;
	readonly cwd?: string;
	readonly failedOnly?: boolean;
	readonly authorKind?: CommandActorKind;
	readonly limit?: number;
}

function safeLabel(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function sessionShellStorePath(
	hoboHome: string,
	stationId: string,
): string {
	return join(
		hoboHome,
		"stations",
		safeLabel(stationId),
		"history",
		"store.sqlite",
	);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  station_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  session_id TEXT NOT NULL,
  pane_id TEXT,
  actor_kind TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_instance TEXT NOT NULL,
  actor_generation INTEGER NOT NULL,
  cwd TEXT NOT NULL,
  command TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  signal TEXT,
  hostname TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  trust TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS commands_recorded ON commands (recorded_at DESC);
CREATE INDEX IF NOT EXISTS commands_command ON commands (command);
CREATE TABLE IF NOT EXISTS aliases (
  name TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS env_vars (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const ALIAS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export interface SessionShellStore {
	readonly path: string;
	recordCommand(input: RecordCommandInput): CommandEvent;
	search(input?: SearchCommandsInput): readonly CommandEvent[];
	listAliases(): readonly ShellAlias[];
	setAlias(name: string, body: string): ShellAlias;
	removeAlias(name: string): void;
	listEnv(): readonly ShellEnvVar[];
	setEnv(name: string, value: string): ShellEnvVar;
	removeEnv(name: string): void;
	exportDotfiles(shell?: "bash" | "zsh"): string;
	close(): void;
}

export function openSessionShellStore(options: {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly environment: string;
	readonly path?: string;
}): SessionShellStore {
	const path =
		options.path ?? sessionShellStorePath(options.hoboHome, options.stationId);
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec(SCHEMA);
	const stationId = options.stationId;
	const environment = options.environment;

	const insert = db.prepare(`
    INSERT INTO commands (
      id, recorded_at, station_id, environment, session_id, pane_id,
      actor_kind, actor_name, actor_instance, actor_generation,
      cwd, command, exit_code, duration_ms, signal, hostname,
      sensitivity, trust, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
	const selectRecent = db.prepare(`
    SELECT * FROM commands
    WHERE station_id = ? AND environment = ?
    ORDER BY recorded_at DESC
    LIMIT 2000
  `);

	function rowToEvent(
		row: Record<string, unknown>,
		score?: number,
	): CommandEvent {
		const exit =
			typeof row.exit_code === "number"
				? {
						exitCode: row.exit_code,
						durationMs:
							typeof row.duration_ms === "number" ? row.duration_ms : 0,
						...(typeof row.signal === "string" ? { signal: row.signal } : {}),
					}
				: undefined;
		return {
			schemaVersion: SESSION_SHELL_SCHEMA,
			id: String(row.id),
			recordedAt: String(row.recorded_at),
			stationId: String(row.station_id),
			environment: String(row.environment),
			sessionId: String(row.session_id),
			...(typeof row.pane_id === "string" ? { paneId: row.pane_id } : {}),
			actor: {
				kind: row.actor_kind as CommandActorKind,
				name: String(row.actor_name),
				instanceId: String(row.actor_instance),
				generation: Number(row.actor_generation),
			},
			cwd: String(row.cwd),
			command: String(row.command),
			...(exit !== undefined ? { outcome: exit } : {}),
			hostname: String(row.hostname),
			sensitivity: row.sensitivity as CommandSensitivity,
			trust: row.trust as CommandTrust,
			source: row.source as CommandSource,
			...(score !== undefined ? { score } : {}),
		};
	}

	return {
		path,
		recordCommand(input) {
			const command = redactCommand(input.command.trim());
			if (command.length === 0) {
				throw Object.assign(new Error("command required"), {
					code: "shell-command-empty",
				});
			}
			const recordedAt = input.recordedAt ?? new Date().toISOString();
			const event: CommandEvent = {
				schemaVersion: SESSION_SHELL_SCHEMA,
				id: randomUUID(),
				recordedAt,
				stationId,
				environment,
				sessionId: input.sessionId,
				...(input.paneId !== undefined ? { paneId: input.paneId } : {}),
				actor: input.actor,
				cwd: input.cwd,
				command,
				...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
				hostname: input.hostname ?? hostname(),
				sensitivity: classifyCommand(input.command),
				trust: "hobo-executed",
				source: input.source ?? "hobo-cli",
			};
			insert.run(
				event.id,
				event.recordedAt,
				event.stationId,
				event.environment,
				event.sessionId,
				event.paneId ?? null,
				event.actor.kind,
				event.actor.name,
				event.actor.instanceId,
				event.actor.generation,
				event.cwd,
				event.command,
				event.outcome?.exitCode ?? null,
				event.outcome?.durationMs ?? null,
				event.outcome?.signal ?? null,
				event.hostname,
				event.sensitivity,
				event.trust,
				event.source,
			);
			return event;
		},
		search(input = {}) {
			const rows = selectRecent.all(stationId, environment) as Record<
				string,
				unknown
			>[];
			const q = input.q?.trim().toLowerCase() ?? "";
			const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
			const freq = new Map<string, number>();
			for (const row of rows) {
				const cmd = String(row.command);
				freq.set(cmd, (freq.get(cmd) ?? 0) + 1);
			}
			const now = Date.now();
			const scored = rows
				.filter((row) => {
					if (
						input.failedOnly === true &&
						row.exit_code !== 1 &&
						!(typeof row.exit_code === "number" && row.exit_code !== 0)
					) {
						return false;
					}
					if (
						input.authorKind !== undefined &&
						row.actor_kind !== input.authorKind
					) {
						return false;
					}
					if (q.length === 0) return true;
					return fuzzyMatch(String(row.command).toLowerCase(), q);
				})
				.map((row) => {
					const command = String(row.command);
					const recencyHours = Math.max(
						0,
						(now - Date.parse(String(row.recorded_at))) / 3_600_000,
					);
					const recency = 1 / (1 + recencyHours);
					const frequency = Math.log2(1 + (freq.get(command) ?? 1));
					const cwdBoost =
						input.cwd !== undefined && row.cwd === input.cwd ? 0.8 : 0;
					const exact = q.length > 0 && command.toLowerCase() === q ? 1.2 : 0;
					const prefix =
						q.length > 0 && command.toLowerCase().startsWith(q) ? 0.5 : 0;
					const score = exact + prefix + recency + frequency + cwdBoost;
					return rowToEvent(row, score);
				})
				.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
			return scored.slice(0, limit);
		},
		listAliases() {
			return (
				db
					.prepare("SELECT name, body, updated_at FROM aliases ORDER BY name")
					.all() as { name: string; body: string; updated_at: string }[]
			).map((row) => ({
				name: row.name,
				body: row.body,
				updatedAt: row.updated_at,
			}));
		},
		setAlias(name, body) {
			assertAlias(name, body);
			const updatedAt = new Date().toISOString();
			db.prepare(
				`INSERT INTO aliases (name, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
			).run(name, body, updatedAt);
			return { name, body, updatedAt };
		},
		removeAlias(name) {
			db.prepare("DELETE FROM aliases WHERE name = ?").run(name);
		},
		listEnv() {
			return (
				db
					.prepare("SELECT name, value, updated_at FROM env_vars ORDER BY name")
					.all() as { name: string; value: string; updated_at: string }[]
			).map((row) => ({
				name: row.name,
				value: row.value,
				updatedAt: row.updated_at,
			}));
		},
		setEnv(name, value) {
			assertEnv(name, value);
			const updatedAt = new Date().toISOString();
			db.prepare(
				`INSERT INTO env_vars (name, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			).run(name, value, updatedAt);
			return { name, value, updatedAt };
		},
		removeEnv(name) {
			db.prepare("DELETE FROM env_vars WHERE name = ?").run(name);
		},
		exportDotfiles() {
			const aliases = (
				db.prepare("SELECT name, body FROM aliases ORDER BY name").all() as {
					name: string;
					body: string;
				}[]
			)
				.map((row) => `alias ${row.name}='${shellQuote(row.body)}'`)
				.join("\n");
			const vars = (
				db.prepare("SELECT name, value FROM env_vars ORDER BY name").all() as {
					name: string;
					value: string;
				}[]
			)
				.map((row) => `export ${row.name}='${shellQuote(row.value)}'`)
				.join("\n");
			return [
				`# ${SESSION_SHELL_SCHEMA} ${stationId} ${environment}`,
				aliases,
				vars,
			]
				.filter((block) => block.length > 0)
				.join("\n");
		},
		close() {
			db.close();
		},
	};
}

function fuzzyMatch(haystack: string, needle: string): boolean {
	if (haystack.includes(needle)) return true;
	let i = 0;
	for (const ch of haystack) {
		if (ch === needle[i]) i += 1;
		if (i >= needle.length) return true;
	}
	return false;
}

function assertAlias(name: string, body: string): void {
	if (!ALIAS_NAME.test(name)) {
		throw Object.assign(new Error(`invalid alias name: ${name}`), {
			code: "shell-alias-invalid",
		});
	}
	if (classifyCommand(body) === "secret-suspected") {
		throw Object.assign(new Error("alias body looks like a secret"), {
			code: "shell-alias-secret",
		});
	}
}

function assertEnv(name: string, value: string): void {
	if (!ENV_NAME.test(name)) {
		throw Object.assign(new Error(`invalid env name: ${name}`), {
			code: "shell-env-invalid",
		});
	}
	if (classifyCommand(`${name}=${value}`) === "secret-suspected") {
		throw Object.assign(new Error("env value looks like a secret"), {
			code: "shell-env-secret",
		});
	}
}

function shellQuote(value: string): string {
	return value.replace(/'/g, `'\\''`);
}
