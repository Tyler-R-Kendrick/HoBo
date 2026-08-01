import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import { which } from "../lib/media.mts";
import { captureCli, type CliCaptureInput, type CliCaptureResult } from "./cli.mts";

export type TuiCaptureResult = CliCaptureResult & {
	castFile?: string;
	degraded: boolean;
	notes: string[];
};

/**
 * TUI capture: prefer asciinema; always keep transcript + terminal size for repro.
 * Does not double-run the command when asciinema succeeds — writes a size/meta transcript only.
 */
export function captureTui(
	outDir: string,
	input: CliCaptureInput,
): TuiCaptureResult {
	mkdirSync(outDir, { recursive: true });
	const notes: string[] = [];
	const screen = {
		cols: process.stdout.columns ?? null,
		rows: process.stdout.rows ?? null,
	};
	const asciinema = which("asciinema");
	if (asciinema) {
		const castPath = path.join(outDir, "session.cast");
		const started = Date.now();
		const r = spawnSync(
			asciinema,
			[
				"rec",
				"--overwrite",
				"--command",
				input.command,
				"--idle-time-limit",
				"2",
				castPath,
			],
			{
				cwd: input.cwd,
				env: { ...process.env, ...input.env },
				encoding: "utf8",
				timeout: input.timeoutMs ?? 180_000,
			},
		);
		const durationMs = Date.now() - started;
		if (r.status === 0 && existsSync(castPath)) {
			const primaryCast = path.join(outDir, "primary.cast");
			renameSync(castPath, primaryCast);
			const summary = [
				`# OptimizeXP TUI evidence`,
				`command: ${input.command}`,
				`cwd: ${input.cwd}`,
				`exitCode: ${r.status}`,
				`durationMs: ${durationMs}`,
				`screen: ${screen.cols ?? "?"}x${screen.rows ?? "?"} (cols x rows)`,
				`recording: primary.cast (asciinema)`,
				`capturedAt: ${new Date().toISOString()}`,
				``,
				`## note`,
				`Full terminal recording is primary.cast; this text is the repro summary.`,
				``,
			].join("\n");
			writeFileSync(path.join(outDir, "terminal.txt"), summary, "utf8");
			notes.push("asciinema cast stored as primary.cast");
			return {
				exitCode: r.status,
				stdout: "",
				stderr: r.stderr ?? "",
				combined: summary,
				durationMs,
				screen,
				primaryFile: primaryCast,
				kind: "recording",
				castFile: primaryCast,
				degraded: false,
				notes,
			};
		}
		notes.push(`asciinema failed (status ${r.status}); fell back to transcript`);
	} else {
		notes.push("asciinema not installed; transcript + screen size only");
	}
	const text = captureCli(outDir, input);
	return { ...text, degraded: true, notes };
}
