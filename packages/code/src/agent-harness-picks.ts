/**
 * Interactive checklist + write policy for `hobo-code agents init`.
 */

import type { HarnessKind } from "./agent-harness-adapters.js";
import {
	isHostSpec,
	loadHarnessCatalog,
	pickKindFromSpec,
	specEvidence,
} from "./agent-harness-catalog.js";
import { defaultProbes } from "./agent-registry.js";

/**
 * Back-compat alias: the former extra members ("acp" | "sdk") were already in
 * HarnessKind, so the union was a no-op.
 */
export type AgentPickKind = HarnessKind;

export interface AgentPick {
	readonly id: string;
	readonly kind: AgentPickKind;
	readonly label: string;
	readonly detected: boolean;
	readonly selected: boolean;
	readonly note: string;
}

export interface ChecklistState {
	readonly picks: readonly AgentPick[];
	readonly cursor: number;
	readonly done?: "write" | "abort";
}

export function shouldWriteAgentsInit(input: {
	readonly flags: Record<string, string | boolean>;
	readonly tty: boolean;
	readonly env?: NodeJS.ProcessEnv;
	readonly dryRun?: boolean;
}): boolean {
	if (input.dryRun === true) return false;
	if (input.flags.yes === true) return true;
	if (input.flags["non-interactive"] === true) return true;
	const ci = input.env?.CI;
	if (ci === "1" || ci === "true") return true;
	return input.tty !== true;
}

export function buildAgentPicks(options: {
	readonly home: string;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly all?: boolean;
	readonly ids?: readonly string[];
	readonly eveTrees?: readonly { readonly id: string }[];
}): AgentPick[] {
	const specs = loadHarnessCatalog({ cwd: options.cwd });
	const probes = defaultProbes(options.env);
	const requested = new Set(
		(options.ids ?? []).filter((id) => !isSelfHarness(id, specs)),
	);
	const picks: AgentPick[] = [];

	for (const spec of specs) {
		if (isHostSpec(spec) || spec.kind === "inference") continue;
		const evidence = specEvidence(spec, probes, options.cwd);
		const detected = evidence.length > 0;
		if (!detected && options.all !== true && !requested.has(spec.id)) continue;
		picks.push({
			id: spec.id,
			kind: pickKindFromSpec(spec),
			label: spec.label,
			detected,
			selected: requested.size > 0 ? requested.has(spec.id) : detected,
			note: detected
				? (evidence[0] ?? "detected")
				: "not detected — listed by --all",
		});
	}

	return picks;
}

/** hobo-code is the host. Registering it as ACP/harness nests another hobo-code. */
export function isSelfHarness(
	id: string,
	specs = loadHarnessCatalog(),
): boolean {
	if (id === "acp") return true;
	const spec = specs.find((row) => row.id === id);
	return spec !== undefined && isHostSpec(spec);
}

export function createChecklist(picks: readonly AgentPick[]): ChecklistState {
	return { picks: [...picks], cursor: 0 };
}

export function reduceChecklistKey(
	state: ChecklistState,
	key: string,
): ChecklistState {
	if (state.done) return state;
	if (key === "q" || key === "\u0003") return { ...state, done: "abort" };
	if (key === "\r" || key === "\n") return { ...state, done: "write" };
	if (key === " " || key === "x") {
		const picks = state.picks.map((pick, i) =>
			i === state.cursor ? { ...pick, selected: !pick.selected } : pick,
		);
		return { ...state, picks };
	}
	if (key === "a") {
		const allOn = state.picks.every((pick) => pick.selected);
		return {
			...state,
			picks: state.picks.map((pick) => ({ ...pick, selected: !allOn })),
		};
	}
	if (key === "j" || key === "\x1b[B") {
		return {
			...state,
			cursor: Math.min(state.cursor + 1, Math.max(0, state.picks.length - 1)),
		};
	}
	if (key === "k" || key === "\x1b[A") {
		return { ...state, cursor: Math.max(0, state.cursor - 1) };
	}
	return state;
}

export function selectedPickIds(state: ChecklistState): readonly string[] {
	return state.picks.filter((pick) => pick.selected).map((pick) => pick.id);
}

export function renderAgentChecklist(state: ChecklistState): string {
	const lines = [
		"select harnesses · space toggle · j/k move · a all · enter write · q abort",
	];
	for (const [i, pick] of state.picks.entries()) {
		const mark = pick.selected ? "x" : " ";
		const cursor = i === state.cursor ? "▸" : " ";
		const detected = pick.detected ? "detected" : "optional";
		lines.push(
			`${cursor} [${mark}] ${pick.id.padEnd(10)} ${pick.kind.padEnd(11)} ${detected}  ${pick.note}`,
		);
	}
	return lines.join("\n");
}

export function checklistLineCount(frame: string): number {
	if (frame.length === 0) return 0;
	return frame.split("\n").length;
}

/** In-place redraw: move up the previous frame and erase downward. */
export function repaintAgentChecklist(
	previousLines: number,
	frame: string,
): { readonly write: string; readonly lines: number } {
	const body = frame.endsWith("\n") ? frame : `${frame}\n`;
	const lines = checklistLineCount(body.replace(/\n$/u, ""));
	const rewind = previousLines > 0 ? `\x1b[${previousLines}F\x1b[J` : "";
	return { write: `${rewind}\x1b[?25l${body}`, lines };
}

export function eraseAgentChecklist(previousLines: number): string {
	if (previousLines <= 0) return "\x1b[?25h";
	return `\x1b[${previousLines}F\x1b[J\x1b[?25h`;
}
