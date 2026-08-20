/**
 * Durable interactive-chat transcripts for `hobo-code resume [session_id]`.
 * Stored under $HOBO_HOME/durable/code/chats — not resident tmux sessions.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	isJsonNumber,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonValue,
} from "./json.js";

const SCHEMA = "hobo.code.chat-session/v1";

export type ChatTurnRole = "system" | "user" | "assistant" | "product";

export interface ChatTurn {
	readonly role: ChatTurnRole;
	readonly text: string;
	readonly at: number;
}

export interface ChatSessionRecord {
	readonly id: string;
	readonly cwd: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly messages: readonly ChatTurn[];
	readonly workingMessages?: readonly ChatTurn[];
	readonly stationLabel?: string;
	readonly envLabel?: string;
	readonly modelLabel?: string;
}

export interface ChatSessionInput {
	readonly id?: string;
	readonly cwd: string;
	readonly messages: readonly ChatTurn[];
	readonly workingMessages?: readonly ChatTurn[];
	readonly createdAt?: number;
	readonly updatedAt?: number;
	readonly stationLabel?: string;
	readonly envLabel?: string;
	readonly modelLabel?: string;
}

const ROLES = new Set<ChatTurnRole>(["system", "user", "assistant", "product"]);

export function chatSessionsDir(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "chats");
}

export function newChatSessionId(): string {
	return `chat-${randomBytes(6).toString("hex")}`;
}

/** One-line closeout printed after the TUI leaves the alternate screen. */
export function formatShellCloseout(sessionId: string): string {
	return `hobo-code resume ${sessionId}`;
}

export function saveChatSession(
	hoboHome: string,
	input: ChatSessionInput,
): ChatSessionRecord {
	const previous = input.id ? loadChatSession(hoboHome, input.id) : undefined;
	const now = Date.now();
	const record: ChatSessionRecord = {
		id: input.id ?? previous?.id ?? newChatSessionId(),
		cwd: input.cwd,
		createdAt: previous?.createdAt ?? input.createdAt ?? now,
		updatedAt: input.updatedAt ?? now,
		messages: input.messages.map((message) => ({
			role: message.role,
			text: message.text,
			at: message.at,
		})),
		...(input.workingMessages !== undefined
			? {
					workingMessages: input.workingMessages.map((message) => ({
						role: message.role,
						text: message.text,
						at: message.at,
					})),
				}
			: undefined),
		...(input.stationLabel !== undefined
			? { stationLabel: input.stationLabel }
			: undefined),
		...(input.envLabel !== undefined
			? { envLabel: input.envLabel }
			: undefined),
		...(input.modelLabel !== undefined
			? { modelLabel: input.modelLabel }
			: undefined),
	};
	const dir = chatSessionsDir(hoboHome);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${record.id}.json`),
		`${JSON.stringify({ schemaVersion: SCHEMA, ...record }, null, 2)}\n`,
		"utf8",
	);
	return record;
}

export function loadChatSession(
	hoboHome: string,
	id: string,
): ChatSessionRecord | undefined {
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const raw = parseJsonValue(
			readFileSync(join(chatSessionsDir(hoboHome), `${id}.json`), "utf8"),
		);
		return parseChatSession(raw);
	} catch {
		return undefined;
	}
}

export function listChatSessions(hoboHome: string): ChatSessionRecord[] {
	let names: string[] = [];
	try {
		names = readdirSync(chatSessionsDir(hoboHome));
	} catch {
		return [];
	}
	const rows: ChatSessionRecord[] = [];
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const row = loadChatSession(hoboHome, name.slice(0, -5));
		if (row) rows.push(row);
	}
	rows.sort((left, right) => right.updatedAt - left.updatedAt);
	return rows;
}

export function resolveChatSession(
	hoboHome: string,
	query: { readonly id?: string; readonly cwd?: string } = {},
): ChatSessionRecord | undefined {
	const wanted = query.id?.trim();
	if (wanted) {
		const exact = loadChatSession(hoboHome, wanted);
		if (exact) return exact;
		const hits = listChatSessions(hoboHome).filter((row) =>
			row.id.startsWith(wanted),
		);
		return hits.length === 1 ? hits[0] : undefined;
	}
	const rows = listChatSessions(hoboHome);
	if (query.cwd) {
		const here = rows.find((row) => row.cwd === query.cwd);
		if (here) return here;
	}
	return rows[0];
}

function parseChatSession(
	raw: JsonValue | undefined,
): ChatSessionRecord | undefined {
	if (!raw || !isJsonObject(raw) || Array.isArray(raw)) return undefined;
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const row = raw as JsonObject;
	if (row.schemaVersion !== SCHEMA) return undefined;
	if (!isJsonString(row.id) || row.id.length === 0) return undefined;
	if (!isJsonString(row.cwd)) return undefined;
	if (!isJsonNumber(row.createdAt) || !isJsonNumber(row.updatedAt)) {
		return undefined;
	}
	if (!Array.isArray(row.messages)) return undefined;
	const messages = parseTurns(row.messages);
	if (!messages) return undefined;
	const workingMessages = Array.isArray(row.workingMessages)
		? parseTurns(row.workingMessages)
		: undefined;
	if (row.workingMessages !== undefined && !workingMessages) return undefined;
	return {
		id: row.id,
		cwd: row.cwd,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		messages,
		...(workingMessages !== undefined ? { workingMessages } : undefined),
		...(isJsonString(row.stationLabel)
			? { stationLabel: row.stationLabel }
			: undefined),
		...(isJsonString(row.envLabel) ? { envLabel: row.envLabel } : undefined),
		...(isJsonString(row.modelLabel)
			? { modelLabel: row.modelLabel }
			: undefined),
	};
}

function parseTurns(raw: readonly unknown[]): ChatTurn[] | undefined {
	const messages: ChatTurn[] = [];
	for (const item of raw) {
		if (!item || !isJsonObject(item) || Array.isArray(item)) return undefined;
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const turn = item as JsonObject;
		if (
			!isJsonString(turn.role) ||
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			!ROLES.has(turn.role as ChatTurnRole)
		) {
			return undefined;
		}
		if (!isJsonString(turn.text) || !isJsonNumber(turn.at)) {
			return undefined;
		}
		messages.push({
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			role: turn.role as ChatTurnRole,
			text: turn.text,
			at: turn.at,
		});
	}
	return messages;
}
