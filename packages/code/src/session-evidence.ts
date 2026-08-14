/**
 * Bind the Evidence SPA to the running hobo-code interactive session
 * and project a chronological journal of asks, decisions, and looks.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type ChatTurn, loadChatSession } from "./chat-sessions.js";
import {
	createEvidencePort,
	type StoredEvidenceRecord,
} from "./evidence-port.js";
import type { EvidenceArtifact, EvidenceState } from "./evidence-report.js";
import type { EvidenceKind } from "./types.js";

// public-contract: Evidence SPA binds to this session pointer schema.
export const CURRENT_SESSION_SCHEMA = "hobo.code.current-session/v1" as const;
// public-contract: Evidence journal records use this schema id.
export const EVIDENCE_JOURNAL_SCHEMA = "hobo.code.evidence-journal/v1" as const;

export type EvidenceJournalKind =
	| "ask"
	| "decision"
	| "look"
	| "impact"
	| "status";

export interface CurrentSessionContext {
	readonly schemaVersion: typeof CURRENT_SESSION_SCHEMA;
	readonly sessionId: string;
	readonly cwd: string;
	readonly updatedAt: string;
	readonly stationLabel?: string;
	readonly envLabel?: string;
	readonly modelLabel?: string;
}

export interface CurrentSessionInput {
	readonly sessionId: string;
	readonly cwd: string;
	readonly stationLabel?: string;
	readonly envLabel?: string;
	readonly modelLabel?: string;
	readonly updatedAt?: string;
}

export interface EvidenceJournalEvent {
	readonly id: string;
	readonly at: string;
	readonly kind: EvidenceJournalKind;
	readonly title: string;
	readonly reason: string;
	readonly actor: string;
	readonly state: EvidenceState;
	readonly artifacts: readonly EvidenceArtifact[];
	readonly sourceKind?: EvidenceKind;
}

export interface EvidenceJournal {
	readonly schemaVersion: typeof EVIDENCE_JOURNAL_SCHEMA;
	readonly sessionId: string | null;
	readonly cwd: string | null;
	readonly occupancy: string | null;
	readonly generatedAt: string;
	readonly events: readonly EvidenceJournalEvent[];
}

export function currentSessionPath(hoboHome: string): string {
	return join(hoboHome, "runtime", "code", "current-session.json");
}

export function writeCurrentSessionContext(
	hoboHome: string,
	input: CurrentSessionInput,
): CurrentSessionContext {
	const context: CurrentSessionContext = {
		schemaVersion: CURRENT_SESSION_SCHEMA,
		sessionId: input.sessionId,
		cwd: input.cwd,
		updatedAt: input.updatedAt ?? new Date().toISOString(),
		...(input.stationLabel ? { stationLabel: input.stationLabel } : {}),
		...(input.envLabel ? { envLabel: input.envLabel } : {}),
		...(input.modelLabel ? { modelLabel: input.modelLabel } : {}),
	};
	const path = currentSessionPath(hoboHome);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	return context;
}

export function readCurrentSessionContext(
	hoboHome: string,
): CurrentSessionContext | undefined {
	try {
		const raw = JSON.parse(
			readFileSync(currentSessionPath(hoboHome), "utf8"),
		) as Partial<CurrentSessionContext>;
		if (raw.schemaVersion !== CURRENT_SESSION_SCHEMA) return undefined;
		if (typeof raw.sessionId !== "string" || raw.sessionId.length === 0) {
			return undefined;
		}
		if (typeof raw.cwd !== "string") return undefined;
		if (typeof raw.updatedAt !== "string") return undefined;
		return {
			schemaVersion: CURRENT_SESSION_SCHEMA,
			sessionId: raw.sessionId,
			cwd: raw.cwd,
			updatedAt: raw.updatedAt,
			...(typeof raw.stationLabel === "string"
				? { stationLabel: raw.stationLabel }
				: {}),
			...(typeof raw.envLabel === "string" ? { envLabel: raw.envLabel } : {}),
			...(typeof raw.modelLabel === "string"
				? { modelLabel: raw.modelLabel }
				: {}),
		};
	} catch {
		return undefined;
	}
}

export function sessionEvidenceSubject(sessionId: string): string {
	return `session:${sessionId}`;
}

export function openSessionEvidencePort(
	hoboHome: string,
	now?: () => string,
): ReturnType<typeof createEvidencePort> {
	return createEvidencePort({
		root: join(hoboHome, "durable", "code", "evidence"),
		actor: "hobo-code:shell",
		origin: "hobo-code:interactive-shell",
		signingKey: "hobo-code:shell",
		...(now ? { now } : {}),
	});
}

export function recordSessionDecision(
	hoboHome: string,
	input: {
		readonly sessionId: string;
		readonly title: string;
		readonly reason: string;
		readonly now?: () => string;
	},
): string {
	return openSessionEvidencePort(hoboHome, input.now).submit({
		kind: "decision",
		title: input.title,
		summary: input.reason,
		subject: sessionEvidenceSubject(input.sessionId),
		artifactRefs: [],
	});
}

export function projectSessionEvidenceJournal(options: {
	readonly hoboHome: string;
	readonly evidence: {
		readonly records: (kind?: EvidenceKind) => readonly StoredEvidenceRecord[];
		readonly artifact: (id: string) =>
			| {
					readonly id: string;
					readonly title: string;
					readonly mediaType: string;
					readonly path: string;
					readonly sha256: string;
			  }
			| undefined;
	};
	readonly generatedAt?: string;
}): EvidenceJournal {
	const generatedAt = options.generatedAt ?? new Date().toISOString();
	const current = readCurrentSessionContext(options.hoboHome);
	const chat = current
		? loadChatSession(options.hoboHome, current.sessionId)
		: undefined;
	const events: EvidenceJournalEvent[] = [];
	if (chat) {
		for (const [index, turn] of chat.messages.entries()) {
			events.push(eventFromChat(chat.id, turn, index));
		}
	}
	const sessionId = current?.sessionId;
	for (const record of options.evidence.records()) {
		if (
			sessionId &&
			!recordBelongsToSession(record, sessionId, chat?.createdAt)
		) {
			continue;
		}
		events.push(eventFromRecord(record, options.evidence.artifact));
	}
	events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	return {
		schemaVersion: EVIDENCE_JOURNAL_SCHEMA,
		sessionId: current?.sessionId ?? chat?.id ?? null,
		cwd: current?.cwd ?? chat?.cwd ?? null,
		occupancy: current
			? [current.stationLabel, current.envLabel].filter(Boolean).join(" · ") ||
				null
			: null,
		generatedAt,
		events,
	};
}

function eventFromChat(
	sessionId: string,
	turn: ChatTurn,
	index: number,
): EvidenceJournalEvent {
	const kind =
		turn.role === "user"
			? "ask"
			: turn.role === "assistant"
				? "decision"
				: "status";
	const title =
		turn.role === "user"
			? "You asked"
			: turn.role === "assistant"
				? "Agent decided"
				: "Session note";
	return {
		id: `chat:${sessionId}:${index}:${turn.at}`,
		at: new Date(turn.at).toISOString(),
		kind,
		title,
		reason: turn.text,
		actor: turn.role === "user" ? "you" : "hobo-code",
		state: "captured",
		artifacts: [],
	};
}

function eventFromRecord(
	record: StoredEvidenceRecord,
	artifact: (id: string) =>
		| {
				readonly id: string;
				readonly title: string;
				readonly mediaType: string;
				readonly path: string;
				readonly sha256: string;
		  }
		| undefined,
): EvidenceJournalEvent {
	const artifacts = record.artifactRefs.flatMap((ref) => {
		const value = artifact(ref);
		return value
			? [
					{
						id: value.id,
						label: value.title,
						mediaType: value.mediaType,
						path: value.path,
						sha256: value.sha256,
					},
				]
			: [];
	});
	const kind = journalKindFor(record.kind);
	return {
		id: `evidence:${record.id}`,
		at: record.recordedAt,
		kind,
		title: record.title,
		reason: record.summary,
		actor: record.actor,
		state: record.verification === "claimed" ? "claimed" : "captured",
		artifacts,
		sourceKind: record.kind,
	};
}

function journalKindFor(kind: EvidenceKind): EvidenceJournalKind {
	if (kind === "screenshot" || kind === "recording" || kind === "annotation") {
		return "look";
	}
	if (kind === "decision") return "decision";
	if (kind === "status" || kind === "note") return "status";
	return "impact";
}

function recordBelongsToSession(
	record: StoredEvidenceRecord,
	sessionId: string,
	createdAt?: number,
): boolean {
	const subject = sessionEvidenceSubject(sessionId);
	if (record.subject === subject || record.subject.startsWith(`${subject}:`)) {
		return true;
	}
	if (record.origin === `session:${sessionId}`) return true;
	if (createdAt === undefined) return false;
	const at = Date.parse(record.recordedAt);
	return Number.isFinite(at) && at >= createdAt;
}
