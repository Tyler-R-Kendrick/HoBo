/**
 * Default InteractiveShell host — bridges product CLI + dispatch without Pi TUI.
 */
import {
	formatHoboCodeResult,
	runHoboCodeCli,
	type HoboCodeCliDeps,
} from "./cli.js";
import type { ShellHost } from "./interactive-shell.js";

export function createDefaultShellHost(
	deps: HoboCodeCliDeps = {},
): ShellHost {
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
			// Dispatch is the product default for a build prompt — no Pi chrome.
			const result = await runHoboCodeCli([prompt], {
				...deps,
				json: false,
			});
			const body = formatHoboCodeResult(result, {
				json: false,
				dense: deps.dense === true,
			});
			if (result.ok) {
				return [
					"Bo dispatched your prompt through hobo-code (product path — not stock Pi UI).",
					"",
					body,
					"",
					"Next: /status · /tasks · /cost · or type another prompt.",
				].join("\n");
			}
			return [
				"Dispatch hit a snag — still in HoBo shell.",
				body,
				"Try: /auth · /config · /guide · or rephrase the prompt.",
			].join("\n");
		},
	};
}
