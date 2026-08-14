/**
 * Durable interactive-chat transcripts for `hobo-code resume [session_id]`.
 * Stored under $HOBO_HOME/durable/code/chats — not resident tmux sessions.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
			: {}),
		...(input.stationLabel !== undefined
			? { stationLabel: input.stationLabel }
			: {}),
		...(input.envLabel !== undefined ? { envLabel: input.envLabel } : {}),
		...(input.modelLabel !== undefined ? { modelLabel: input.modelLabel } : {}),
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
		const raw = JSON.parse(
			readFileSync(join(chatSessionsDir(hoboHome), `${id}.json`), "utf8"),
		) as unknown;
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

function parseChatSession(raw: unknown): ChatSessionRecord | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const row = raw as Record<string, unknown>;
	if (row.schemaVersion !== SCHEMA) return undefined;
	if (typeof row.id !== "string" || row.id.length === 0) return undefined;
	if (typeof row.cwd !== "string") return undefined;
	if (typeof row.createdAt !== "number" || typeof row.updatedAt !== "number") {
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
		...(workingMessages !== undefined ? { workingMessages } : {}),
		...(typeof row.stationLabel === "string"
			? { stationLabel: row.stationLabel }
			: {}),
		...(typeof row.envLabel === "string" ? { envLabel: row.envLabel } : {}),
		...(typeof row.modelLabel === "string"
			? { modelLabel: row.modelLabel }
			: {}),
	};
}

function parseTurns(raw: readonly unknown[]): ChatTurn[] | undefined {
	const messages: ChatTurn[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item))
			return undefined;
		const turn = item as Record<string, unknown>;
		if (
			typeof turn.role !== "string" ||
			!ROLES.has(turn.role as ChatTurnRole)
		) {
			return undefined;
		}
		if (typeof turn.text !== "string" || typeof turn.at !== "number") {
			return undefined;
		}
		messages.push({
			role: turn.role as ChatTurnRole,
			text: turn.text,
			at: turn.at,
		});
	}
	return messages;
}
