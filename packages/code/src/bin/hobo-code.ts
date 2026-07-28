#!/usr/bin/env node
/**
 * hobo-code — standalone coding harness CLI (ADR-0139).
 * Default verb: dispatch.
 *
 * Bare `hobo-code` (or `hobo-code chat`) on a TTY opens the animated title
 * screen (Chewy wordmark + Bo idle, press any key) and then drops into the
 * **pi interactive coding harness** customized with the HoBo extension
 * (pi/extensions/hobo.ts) and HoBo system instructions — the same agent
 * harness the Flue surface (agents/hobo-code.ts) runs programmatically.
 * Piped stdout, --json, or any other verb stays one-shot.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatHoboCodeResult, runHoboCodeCli } from "../cli.js";
import { HOBO_AGENT_INSTRUCTIONS } from "../harness-customization.js";
import { BO_IDLE_TICK_MS, renderTitleScreen } from "../splash.js";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const interactive = process.stdout.isTTY === true && process.stdin.isTTY === true;
const chatVerb = argv[0] === "chat";
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Animated title screen on the alternate buffer. Fixed-geometry repaints
 * (cursor-home only, no clear) so the canvas never flickers. Resolves on
 * any keypress / Ctrl+C; restores the primary screen either way.
 */
function showTitleScreen(): Promise<void> {
	return new Promise((resolve) => {
		const out = process.stdout;
		const input = process.stdin;
		out.write("\x1b[?1049h\x1b[?25l"); // alternate screen + hide cursor
		let done = false;
		const started = Date.now();
		const paint = () => {
			const frame = renderTitleScreen({ tickMs: Date.now() - started });
			out.write(`\x1b[H${frame}`);
		};
		const finish = () => {
			if (done) return;
			done = true;
			clearInterval(timer);
			input.removeListener("data", onData);
			if (input.isTTY) input.setRawMode(false);
			input.pause();
			out.write("\x1b[?25h\x1b[?1049l"); // show cursor + primary screen
			resolve();
		};
		const onData = (chunk: Buffer) => {
			if (chunk.includes(3)) process.exitCode = 130; // Ctrl+C
			finish();
		};
		if (input.isTTY) input.setRawMode(true);
		input.resume();
		input.on("data", onData);
		paint();
		const timer = setInterval(paint, BO_IDLE_TICK_MS);
		// Safety: never trap the user — auto-continue after 30s.
		setTimeout(finish, 30_000).unref();
	});
}

/**
 * Launch the pi interactive harness with HoBo customization.
 * Forwards pi's exit code; never resolves before pi exits (persistent).
 */
function launchPiHarness(): Promise<number> {
	const piEntry = fileURLToPath(import.meta.resolve("@mariozechner/pi-coding-agent"));
	const piBin = join(dirname(piEntry), "cli.js");
	const args = [
		piBin,
		"--no-extensions", // ignore ambient ~/.pi extensions; load only ours
		"-e",
		join(pkgRoot, "pi", "extensions", "hobo.ts"),
		"--append-system-prompt",
		HOBO_AGENT_INSTRUCTIONS,
	];
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal === "SIGINT") resolve(130);
			else resolve(code ?? 1);
		});
	});
}

if (interactive && !json && (argv.length === 0 || chatVerb)) {
	if (argv.length === 0) await showTitleScreen();
	process.exitCode = await launchPiHarness();
} else {
	const result = await runHoboCodeCli(argv, { json });
	process.stdout.write(formatHoboCodeResult(result, json));
	process.exitCode = result.exitCode;
}
