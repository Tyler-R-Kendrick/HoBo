#!/usr/bin/env node
/**
 * hobo-code — standalone coding harness CLI (ADR-0139).
 * Default verb: dispatch.
 *
 * Bare `hobo-code` on a TTY opens the animated title screen first (Chewy
 * wordmark + Bo idle, alternate screen, press any key) and then runs the
 * default dispatch. Any argument, piped stdout, or --json skips it.
 */
import { formatHoboCodeResult, runHoboCodeCli } from "../cli.js";
import { BO_IDLE_TICK_MS, renderTitleScreen } from "../splash.js";

const argv = process.argv.slice(2);
const json = argv.includes("--json");

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

if (argv.length === 0 && !json && process.stdout.isTTY === true) {
	await showTitleScreen();
}

const result = await runHoboCodeCli(argv, { json });
process.stdout.write(formatHoboCodeResult(result, json));
process.exitCode = result.exitCode;
