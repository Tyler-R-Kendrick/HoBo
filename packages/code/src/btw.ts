/**
 * Temporary side-chat (Claude/Grok/Codex "btw"): borrow a snapshot of the
 * current session to ask what is going on, without joining the main transcript.
 */

export interface BtwTurn {
	readonly role: "user" | "assistant";
	readonly text: string;
	readonly at: number;
}

export interface BtwSnapshot {
	readonly focus: string;
	readonly agentState: string;
	readonly stationLabel: string;
	readonly envLabel: string;
	readonly modelLabel: string;
	readonly usageLabel: string;
	readonly messageCount: number;
	readonly lastUser?: string;
	readonly lastAssistant?: string;
	readonly lastProduct?: string;
	readonly pendingApproval?: {
		readonly runId: string;
		readonly changeCount: number;
	};
	readonly slashOpen: boolean;
}

export interface BtwSession {
	readonly snapshot: BtwSnapshot;
	readonly turns: readonly BtwTurn[];
	/** Parent message count when the aside opened. Used for the +N live badge. */
	readonly originMessageCount: number;
}

const BTW_PREFIX = /^(?:\/)?btw(?:\s+|$)/iu;
const DISMISS = /^(done|exit|close|quit|nevermind|never mind|cancel)$/iu;

export function matchBtwInput(
	text: string,
): { readonly question: string } | undefined {
	const trimmed = text.trim();
	const match = BTW_PREFIX.exec(trimmed);
	if (!match) return undefined;
	return { question: trimmed.slice(match[0].length).trim() };
}

export function isBtwDismiss(question: string): boolean {
	return DISMISS.test(question.trim());
}

export function captureBtwSnapshot(input: {
	readonly focus: string;
	readonly agentState: string;
	readonly stationLabel: string;
	readonly envLabel: string;
	readonly modelLabel: string;
	readonly usageLabel: string;
	readonly messages: readonly {
		readonly role: string;
		readonly text: string;
	}[];
	readonly pendingApproval?: {
		readonly runId: string;
		readonly changeCount: number;
	};
	readonly slashOpen: boolean;
}): BtwSnapshot {
	const lastOf = (role: string): string | undefined => {
		for (let i = input.messages.length - 1; i >= 0; i -= 1) {
			const message = input.messages[i];
			if (message?.role === role && message.text.trim().length > 0) {
				return clip(message.text, 280);
			}
		}
		return undefined;
	};
	const lastUser = lastOf("user");
	const lastAssistant = lastOf("assistant");
	const lastProduct = lastOf("product");
	return {
		focus: input.focus,
		agentState: input.agentState,
		stationLabel: input.stationLabel,
		envLabel: input.envLabel,
		modelLabel: input.modelLabel,
		usageLabel: input.usageLabel,
		messageCount: input.messages.length,
		...(lastUser !== undefined ? { lastUser } : undefined),
		...(lastAssistant !== undefined ? { lastAssistant } : undefined),
		...(lastProduct !== undefined ? { lastProduct } : undefined),
		...(input.pendingApproval !== undefined
			? { pendingApproval: input.pendingApproval }
			: undefined),
		slashOpen: input.slashOpen,
	};
}

export function answerBtw(
	snapshot: BtwSnapshot,
	question: string,
	_prior: readonly BtwTurn[] = [],
): string {
	const asked = question.trim();
	if (asked.length === 0 || isStatusQuestion(asked)) {
		return describeMoment(snapshot);
	}
	if (/\b(last|just)\b.*\b(say|said|ask)/iu.test(asked)) {
		return snapshot.lastUser
			? `You last said: ${snapshot.lastUser}`
			: "Nothing from you is in this snapshot yet.";
	}
	if (/\b(you|bo|agent)\b.*\b(do|doing|working|said|reply)/iu.test(asked)) {
		if (snapshot.agentState === "working") {
			return snapshot.lastAssistant
				? `Bo is still working. Latest: ${snapshot.lastAssistant}`
				: "Bo is still working on the previous turn.";
		}
		return snapshot.lastAssistant
			? `Latest from Bo: ${snapshot.lastAssistant}`
			: "Bo has not answered in this snapshot.";
	}
	if (/\bapprov|promot|sandbox/iu.test(asked)) {
		return snapshot.pendingApproval
			? `Promotion gate is up for ${snapshot.pendingApproval.runId} (${snapshot.pendingApproval.changeCount} file(s)). y promotes · n keeps sandboxed.`
			: "No promotion gate is open right now.";
	}
	return [
		describeMoment(snapshot),
		"",
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		`This aside tracks the live parent thread — it will not run "${asked}" as a main-chat turn. Esc dismisses.`,
	].join("\n");
}

export function parentDelta(session: BtwSession): number {
	return Math.max(
		0,
		session.snapshot.messageCount - session.originMessageCount,
	);
}

export function refreshBtwSnapshot(
	session: BtwSession,
	snapshot: BtwSnapshot,
): BtwSession {
	return { ...session, snapshot };
}

function isStatusQuestion(asked: string): boolean {
	return /^(what('?s| is) going on|what is this|status|where am i|huh|explain)$/iu.test(
		asked,
	);
}

function describeMoment(snapshot: BtwSnapshot): string {
	const lines = [
		`btw · ${snapshot.agentState} · focus ${snapshot.focus}`,
		`station ${snapshot.stationLabel || "—"} · env ${snapshot.envLabel || "—"} · ${snapshot.modelLabel}`,
	];
	if (snapshot.usageLabel) lines.push(`usage ${snapshot.usageLabel}`);
	if (snapshot.pendingApproval) {
		lines.push(
			`gate ${snapshot.pendingApproval.runId} · ${snapshot.pendingApproval.changeCount} file(s)`,
		);
	}
	if (snapshot.slashOpen) lines.push("slash palette is open");
	if (snapshot.lastUser) lines.push(`you · ${snapshot.lastUser}`);
	if (snapshot.lastAssistant) lines.push(`Bo · ${snapshot.lastAssistant}`);
	if (snapshot.lastProduct) lines.push(`shell · ${snapshot.lastProduct}`);
	lines.push(
		`${snapshot.messageCount} main-chat message(s) borrowed. Esc dismisses.`,
	);
	return lines.join("\n");
}

function clip(text: string, maximum: number): string {
	const oneLine = text.replace(/\s+/gu, " ").trim();
	if (oneLine.length <= maximum) return oneLine;
	return `${oneLine.slice(0, Math.max(0, maximum - 1))}…`;
}
