/**
 * Default InteractiveShell host — bridges product CLI + dispatch.
 *
 * Honesty contract (render-budget/honesty tests pin this):
 * - a chat reply states exactly what happened — a dispatch turn *records a
 *   compute task*; no completion engine runs it yet, and the reply says so;
 * - no success theater, no fixed "Next:" filler, no branding in replies;
 * - every reply teaches the equivalent one-shot command.
 */
import {
	formatHoboCodeResult,
	type HoboCodeCliDeps,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "./cli.js";
import type { ShellHost } from "./interactive-shell.js";

interface DispatchedTaskShape {
	readonly taskId?: string;
	readonly status?: string;
	readonly handbackPath?: string;
	readonly error?: string;
}

function dispatchedTask(result: HoboCodeCliResult): DispatchedTaskShape | null {
	if (typeof result.data !== "object" || result.data === null) return null;
	const task = (result.data as { readonly task?: unknown }).task;
	if (typeof task !== "object" || task === null) return null;
	return task as DispatchedTaskShape;
}

function oneShotHint(prompt: string): string {
	const compact = prompt.length > 48 ? `${prompt.slice(0, 47)}…` : prompt;
	return `One-shot equivalent: hobo-code "${compact.replace(/"/g, '\\"')}"`;
}

export function createDefaultShellHost(deps: HoboCodeCliDeps = {}): ShellHost {
	return {
		async runVerb(argv) {
			const result = await runHoboCodeCli([...argv], {
				...deps,
				json: false,
			});
			return formatHoboCodeResult(result, {
				json: false,
				dense: deps.dense === true,
			});
		},
		async complete(prompt) {
			const result = await runHoboCodeCli([prompt], {
				...deps,
				json: false,
			});
			const task = dispatchedTask(result);
			if (result.ok && task?.taskId) {
				return [
					`Recorded compute task ${task.taskId} (status: ${task.status ?? "unknown"}).`,
					"No completion engine is wired yet, so nothing acted on your prompt —",
					"it is stored as a dispatch task for a worker to pick up (/about).",
					...(task.handbackPath ? [`Handback: ${task.handbackPath}`] : []),
					oneShotHint(prompt),
				].join("\n");
			}
			if (result.ok) {
				// Non-dispatch success (e.g. a verb-shaped prompt routed elsewhere).
				return formatHoboCodeResult(result, {
					json: false,
					dense: deps.dense === true,
				});
			}
			const remediation = result.remediation ?? [];
			return [
				`${result.code}: ${task?.error ?? "dispatch failed"}`,
				formatHoboCodeResult(result, {
					json: false,
					dense: deps.dense === true,
				}).trimEnd(),
				...(remediation.length > 0
					? ["Try:", ...remediation.map((r) => `  ${r}`)]
					: []),
			].join("\n");
		},
	};
}
