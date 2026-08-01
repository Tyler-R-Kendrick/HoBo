import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactText } from "../lib/redaction.mts";

export type CliCaptureInput = {
	command: string;
	cwd: string;
	env?: Record<string, string>;
	timeoutMs?: number;
};

export type CliCaptureResult = {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	combined: string;
	durationMs: number;
	screen: { cols: number | null; rows: number | null };
	primaryFile: string;
	kind: "recording";
};

function termSize(): { cols: number | null; rows: number | null } {
	return {
		cols: process.stdout.columns ?? null,
		rows: process.stdout.rows ?? null,
	};
}

export function captureCli(
	outDir: string,
	input: CliCaptureInput,
): CliCaptureResult {
	mkdirSync(outDir, { recursive: true });
	const started = Date.now();
	// pipefail so `cmd | head` reports the failing command's status, not head's 0
	const wrapped = `set -o pipefail; ${input.command}`;
	const r = spawnSync("bash", ["-lc", wrapped], {
		cwd: input.cwd,
		env: { ...process.env, ...input.env },
		encoding: "utf8",
		timeout: input.timeoutMs ?? 120_000,
		maxBuffer: 8 * 1024 * 1024,
	});
	const durationMs = Date.now() - started;
	const stdout = redactText(r.stdout ?? "");
	const stderr = redactText(r.stderr ?? "");
	const combinedText = `${stdout}\n${stderr}`;
	// Prefer spawn status; if still 0, recover body-level lifecycle failures
	let exitCode: number | null = r.status;
	if (exitCode === 0) {
		const elifecycle = combinedText.match(
			/ELIFECYCLE[^\n]*exit code (\d+)/i,
		);
		if (elifecycle?.[1]) exitCode = Number(elifecycle[1]);
		else if (
			/ERR_MODULE_NOT_FOUND|Cannot find package|node_modules missing/i.test(
				combinedText,
			)
		) {
			exitCode = 1;
		}
	}
	const screen = termSize();
	const header = [
		`# OptimizeXP CLI evidence`,
		`command: ${input.command}`,
		`cwd: ${input.cwd}`,
		`exitCode: ${exitCode}`,
		`spawnStatus: ${r.status}`,
		`durationMs: ${durationMs}`,
		`screen: ${screen.cols ?? "?"}x${screen.rows ?? "?"} (cols x rows)`,
		`capturedAt: ${new Date().toISOString()}`,
		``,
		`## stdout`,
		stdout || "(empty)",
		``,
		`## stderr`,
		stderr || "(empty)",
		``,
	].join("\n");
	writeFileSync(path.join(outDir, "terminal.txt"), header, "utf8");
	const castFile = path.join(outDir, "primary.cast");
	const castHeader = {
		version: 2,
		width: screen.cols ?? 120,
		height: screen.rows ?? 40,
		timestamp: Math.floor(Date.now() / 1000),
		env: { TERM: "xterm-256color", SHELL: "bash" },
	};
	const output = `${stdout}${stderr ? `\n${stderr}` : ""}`;
	writeFileSync(
		castFile,
		`${JSON.stringify(castHeader)}\n${JSON.stringify([Math.max(durationMs / 1000, 0.01), "o", output])}\n`,
		"utf8",
	);
	return {
		exitCode,
		stdout,
		stderr,
		combined: header,
		durationMs,
		screen,
		primaryFile: castFile,
		kind: "recording",
	};
}
