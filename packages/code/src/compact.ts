/**
 * Journal-preserving compact (Pi /compact, improved).
 *
 * Pi (Earendil 2026-08-13): LLM recap of old turns, keep ~20k recent tokens,
 * auto-compact at threshold / overflow. That is lossy, model-gated, and can
 * stall after auto-compact. HoBo instead:
 *   - deterministic extract (works with engine:none)
 *   - cut only on user-turn boundaries
 *   - never rewrite the durable journal
 *   - manual `/compact` first — no mid-turn auto
 */

export type CompactRole = "system" | "user" | "assistant" | "product";

export interface CompactTurn {
	readonly role: CompactRole;
	readonly text: string;
	readonly at: number;
}

export interface CompactFacts {
	readonly goal?: string;
	readonly files: readonly string[];
	readonly errors: readonly string[];
	readonly done: readonly string[];
	readonly focus?: string;
	readonly stationLabel?: string;
	readonly envLabel?: string;
}

export interface CompactPlan {
	readonly briefing: string;
	readonly working: readonly CompactTurn[];
	readonly journal: readonly CompactTurn[];
	readonly droppedCount: number;
	readonly tokensBefore: number;
	readonly tokensAfter: number;
	readonly keptFromIndex: number;
}

export interface CompactInput {
	readonly messages: readonly CompactTurn[];
	readonly keepUserTurns?: number;
	readonly focus?: string;
	readonly stationLabel?: string;
	readonly envLabel?: string;
	readonly sessionId?: string;
}

const FILE_RE =
	/(?<![A-Za-z0-9_])(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|mjs|mts|json|md|cue|proto|css)(?![A-Za-z0-9_])/gu;
const ERROR_RE =
	/\b(?:error|fail(?:ed|ure)?|enoent|not_implemented|refused|blocked|denied)\b/iu;

export function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTranscriptTokens(
	messages: readonly CompactTurn[],
): number {
	let total = 0;
	for (const message of messages) {
		total += estimateTokens(message.text);
	}
	return total;
}

export function cutAtUserTurns(
	messages: readonly CompactTurn[],
	keepUserTurns = 2,
): number {
	const keep = Math.max(1, Math.trunc(keepUserTurns));
	let seen = 0;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]?.role !== "user") continue;
		seen += 1;
		if (seen >= keep) return i;
	}
	return 0;
}

export function extractCompactFacts(
	messages: readonly CompactTurn[],
	options: {
		readonly focus?: string;
		readonly stationLabel?: string;
		readonly envLabel?: string;
	} = {},
): CompactFacts {
	const files = new Set<string>();
	const errors: string[] = [];
	const done: string[] = [];
	let goal: string | undefined;
	for (const message of messages) {
		for (const match of message.text.matchAll(FILE_RE)) {
			if (match[0]) files.add(match[0]);
		}
		if (message.role === "user" && message.text.trim() && goal === undefined) {
			goal = clip(message.text, 180);
		}
		if (message.role === "assistant" && message.text.trim()) {
			done.push(clip(message.text, 140));
		}
		if (
			(message.role === "assistant" || message.role === "product") &&
			ERROR_RE.test(message.text)
		) {
			errors.push(clip(message.text, 160));
		}
	}
	return {
		...(goal !== undefined ? { goal } : {}),
		files: [...files].slice(0, 16),
		errors: errors.slice(-6),
		done: done.slice(-6),
		...(options.focus?.trim() ? { focus: options.focus.trim() } : {}),
		...(options.stationLabel ? { stationLabel: options.stationLabel } : {}),
		...(options.envLabel ? { envLabel: options.envLabel } : {}),
	};
}

export function formatCompactBriefing(
	facts: CompactFacts,
	meta: {
		readonly droppedCount: number;
		readonly keptCount: number;
		readonly tokensBefore: number;
		readonly tokensAfter: number;
		readonly sessionId?: string;
	},
): string {
	if (meta.droppedCount === 0) {
		return "compact · nothing to drop — journal already short.";
	}
	const lines = [
		`compact · ${meta.droppedCount + meta.keptCount}→${meta.keptCount + 1} · ~${meta.tokensBefore}→${meta.tokensAfter} tok · journal intact`,
		facts.goal ? `Goal · ${facts.goal}` : undefined,
		facts.focus ? `Focus · ${facts.focus}` : undefined,
		facts.stationLabel || facts.envLabel
			? `Where · ${[facts.stationLabel, facts.envLabel].filter(Boolean).join(" · ")}`
			: undefined,
		facts.files.length > 0 ? `Files · ${facts.files.join(" · ")}` : undefined,
		facts.errors.length > 0
			? `Errors · ${facts.errors.join(" · ")}`
			: undefined,
		facts.done.length > 0 ? `Latest · ${facts.done.at(-1)}` : undefined,
		meta.sessionId
			? `journal · hobo-code resume ${meta.sessionId}`
			: "journal · durable chat file is unchanged",
	];
	return lines.filter((line): line is string => line !== undefined).join("\n");
}

export function compactTranscript(input: CompactInput): CompactPlan {
	const journal = input.messages;
	const tokensBefore = estimateTranscriptTokens(journal);
	const keepUserTurns = input.keepUserTurns ?? 2;
	const userTurns = journal.filter((row) => row.role === "user").length;
	if (userTurns <= keepUserTurns || journal.length < 4) {
		return {
			briefing: formatCompactBriefing(extractCompactFacts(journal, input), {
				droppedCount: 0,
				keptCount: journal.length,
				tokensBefore,
				tokensAfter: tokensBefore,
				...(input.sessionId !== undefined
					? { sessionId: input.sessionId }
					: {}),
			}),
			working: journal,
			journal,
			droppedCount: 0,
			tokensBefore,
			tokensAfter: tokensBefore,
			keptFromIndex: 0,
		};
	}
	const keptFromIndex = cutAtUserTurns(journal, keepUserTurns);
	const kept = journal.slice(keptFromIndex);
	const facts = extractCompactFacts(journal, input);
	const meta = {
		droppedCount: keptFromIndex,
		keptCount: kept.length,
		tokensBefore,
		tokensAfter: estimateTranscriptTokens(kept),
		...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
	};
	let briefing = formatCompactBriefing(facts, meta);
	const headerAt = (journal.at(-1)?.at ?? 0) + 1;
	let working: CompactTurn[] = [
		{ role: "product", text: briefing, at: headerAt },
		...kept,
	];
	const tokensAfter = estimateTranscriptTokens(working);
	briefing = formatCompactBriefing(facts, { ...meta, tokensAfter });
	working = [{ role: "product", text: briefing, at: headerAt }, ...kept];
	return {
		briefing,
		working,
		journal,
		droppedCount: keptFromIndex,
		tokensBefore,
		tokensAfter,
		keptFromIndex,
	};
}

function clip(text: string, maximum: number): string {
	const oneLine = text.replace(/\s+/gu, " ").trim();
	if (oneLine.length <= maximum) return oneLine;
	return `${oneLine.slice(0, Math.max(0, maximum - 1))}…`;
}
