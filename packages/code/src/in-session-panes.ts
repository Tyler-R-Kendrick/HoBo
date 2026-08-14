/**
 * Herdr-style in-session panes: tmux windows owned by the hobo-code TTY.
 * The human stays in the product shell; agent CLIs (codex, claude, …) run
 * in tmux and are captured/fed from this process. Not `tmux attach`.
 */
import { loadHarnessCatalog, seatingOrder } from "./agent-harness-catalog.js";
import { defaultProbes, detectAgents } from "./agent-registry.js";
import {
	applyMux,
	type MuxRunner,
	type MuxTarget,
	planMux,
	safeWindowName,
	sessionTarget,
	tmuxRunner,
} from "./mux.js";

// public-contract: default in-session mux name
export const IN_SESSION_MUX = "hobo" as const;

export interface InSessionWindow {
	readonly name: string;
	readonly target: string;
	readonly kind: "harness" | "coding-agent" | "inference" | "unknown";
}

export interface InSessionPanes {
	readonly session: string;
	readonly windows: readonly InSessionWindow[];
	readonly focused: number;
	readonly capture: string;
	readonly note: string;
	readonly tmux: boolean;
}

function codingOrder(): readonly string[] {
	return seatingOrder(loadHarnessCatalog());
}

export function pickCodingWindow(
	windows: readonly InSessionWindow[],
): InSessionWindow | undefined {
	for (const id of codingOrder()) {
		const hit = windows.find((row) => row.name === id);
		if (hit) return hit;
	}
	return windows.find((row) => row.kind === "coding-agent");
}

/** Focused coding CLI, else the preferred coding window. Never the harness. */
export function pickSendWindow(
	panes: InSessionPanes,
): InSessionWindow | undefined {
	const focused = panes.windows[panes.focused];
	if (focused?.kind === "coding-agent") return focused;
	return pickCodingWindow(panes.windows);
}

export function isProductPrompt(text: string): boolean {
	const t = text.trim();
	if (t.startsWith("/")) return true;
	if (/^(btw)\b/iu.test(t)) return true;
	return false;
}

export function emptyInSessionPanes(note: string): InSessionPanes {
	return {
		session: IN_SESSION_MUX,
		windows: [],
		focused: 0,
		capture: "",
		note,
		tmux: false,
	};
}

export function classifyWindowName(
	name: string,
): InSessionWindow["kind"] {
	const spec = loadHarnessCatalog().find((row) => row.id === name);
	if (!spec) return "unknown";
	if (spec.host === true || spec.kind === "harness") return "harness";
	if (spec.kind === "inference") return "inference";
	if (spec.kind === "coding-agent") return "coding-agent";
	return "unknown";
}

export async function listInSessionWindows(
	runner: MuxRunner,
	session: string = IN_SESSION_MUX,
): Promise<readonly InSessionWindow[]> {
	const listed = await runner.run([
		"list-windows",
		"-t",
		sessionTarget(session),
		"-F",
		"#{window_name}\t#{pane_id}",
	]);
	if (listed.code !== 0) return [];
	const rows: InSessionWindow[] = [];
	for (const line of listed.stdout.split("\n")) {
		const [nameRaw, paneId] = line.split("\t");
		const name = nameRaw?.trim() ?? "";
		if (name.length === 0) continue;
		rows.push({
			name,
			target: paneId?.trim() || `${session}:${name}`,
			kind: classifyWindowName(name),
		});
	}
	return rows;
}

export async function captureInSessionPane(
	runner: MuxRunner,
	target: string,
	lines = 40,
): Promise<string> {
	const captured = await runner.run([
		"capture-pane",
		"-p",
		"-S",
		`-${lines}`,
		"-t",
		target,
	]);
	return captured.stdout.replace(/\s+$/u, "");
}

export async function sendToInSessionPane(
	runner: MuxRunner,
	target: string,
	text: string,
): Promise<void> {
	await runner.run(["send-keys", "-t", target, "-l", "--", text]);
	await runner.run(["send-keys", "-t", target, "Enter"]);
}

export async function ensureInSessionPanes(options: {
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly runner?: MuxRunner;
	readonly session?: string;
}): Promise<InSessionPanes> {
	const runner = options.runner ?? tmuxRunner();
	const session = safeWindowName(options.session ?? IN_SESSION_MUX);
	const hasTmux = await runner.run(["-V"]);
	if (hasTmux.code !== 0) {
		return emptyInSessionPanes(
			"tmux is not available — install tmux to seat agent CLIs in-session",
		);
	}
	const agents = detectAgents(defaultProbes(options.env ?? process.env));
	const placeable = agents.filter(
		(agent) => agent.binary !== null && agent.kind !== "harness",
	);
	if (placeable.length === 0) {
		return emptyInSessionPanes(
			"no agent CLI on PATH — install codex, claude, or cursor-agent",
		);
	}
	const cwd = options.cwd ?? process.cwd();
	const targets: MuxTarget[] = placeable.map((agent) => ({
		name: agent.id,
		kind: agent.kind === "inference" ? "local-inference" : "local",
		command: agent.command,
		cwd,
	}));
	const applied = await applyMux(planMux(session, targets), runner);
	if (!applied.ok) {
		return {
			...emptyInSessionPanes(applied.detail),
			tmux: true,
		};
	}
	const windows = await listInSessionWindows(runner, session);
	const coding = pickCodingWindow(windows);
	const focused = coding
		? Math.max(0, windows.findIndex((row) => row.name === coding.name))
		: 0;
	const focusedWindow = windows[focused];
	const capture = focusedWindow
		? await captureInSessionPane(runner, focusedWindow.target)
		: "";
	return {
		session,
		windows,
		focused,
		capture,
		note:
			coding !== undefined
				? `in-session · ${coding.name} writes the app · [ ] cycle panes`
				: applied.detail,
		tmux: true,
	};
}

export async function refreshInSessionPanes(
	current: InSessionPanes,
	runner: MuxRunner,
): Promise<InSessionPanes> {
	if (!current.tmux || current.windows.length === 0) return current;
	const window = current.windows[current.focused] ?? current.windows[0];
	if (!window) return current;
	const capture = await captureInSessionPane(runner, window.target);
	return { ...current, capture };
}

export function cycleInSessionWindow(
	current: InSessionPanes,
	delta: 1 | -1,
): InSessionPanes {
	if (current.windows.length === 0) return current;
	const next =
		(current.focused + delta + current.windows.length) %
		current.windows.length;
	return { ...current, focused: next, capture: "" };
}
