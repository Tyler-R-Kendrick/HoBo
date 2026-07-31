/**
 * HoBo pi extension (ADR-0139) — customizes the pi interactive terminal into
 * the hobo-code persistent chat surface: Chewy-logo + Bo startup header,
 * Bo footer status, /hive and /bo commands.
 *
 * Loaded by the hobo-code bin via `pi --no-extensions -e <this file>`
 * (pi compiles TS extensions with jiti — no build step for this file).
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Chewy HoBo wordmark + Bo idle frame + hint line (fallback: one line). */
async function buildHoboHeaderLines(
	accent: (s: string) => string,
	dim: (s: string) => string,
): Promise<string[]> {
	try {
		const { HOBO_LOGO_TUI } = await import(
			join(pkgRoot, "dist", "_generated", "hobo-logo-tui.js") as any
		);
		const { renderBoIdleFrame, BO_IDLE_REST } = await import(
			join(pkgRoot, "dist", "splash.js") as any
		);
		const logo = (HOBO_LOGO_TUI as string)
			.split("\n")
			.map((l: string) => l.trimEnd())
			.filter((l: string) => l.length > 0)
			.map(accent);
		const bo = (renderBoIdleFrame(BO_IDLE_REST) as string)
			.split("\n")
			.map((l: string) => l.trimEnd())
			.filter((l: string) => l.length > 0)
			.map((l: string) => `  ${l}`);
		return [
			"",
			...logo,
			"",
			...bo,
			"",
			dim("  hobo-code — pack your bindle · / commands · /exit to leave"),
			"",
		];
	} catch {
		return ["", dim("  hobo-code — / commands · /exit to leave"), ""];
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setTitle("hobo-code");
		ctx.ui.setStatus("hobo", "(••)/@ hobo-code · /hive · /bo");
		ctx.ui.setHeader((tui, theme) => {
				let lines: string[] | undefined;
				void buildHoboHeaderLines(
					(s) => theme.fg("accent", s),
					(s) => theme.fg("dim", s),
				).then((built) => {
					lines = built;
					tui.requestRender?.();
				});
				return {
					render(_width: number): string[] {
						return lines ?? [""];
					},
					invalidate() {},
				};
			});
		ctx.ui.notify("Bo online — bindle packed, hive ready.", "info");
	});

	pi.registerCommand("hive", {
		description: "Show hobo-code hive status (station, panes, nodes)",
		handler: async (_args, ctx) => {
			try {
				const { runHoboCodeCli, formatHoboCodeResult } = await import(
					join(pkgRoot, "dist", "cli.js") as any
				);
				const result = await runHoboCodeCli(["status"], { json: false });
				ctx.ui.notify(formatHoboCodeResult(result, false), "info");
			} catch (err) {
				ctx.ui.notify(
					`hive status failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("bo", {
		description: "Print a Bo idle frame (sprite-derived TUI art)",
		handler: async (_args, ctx) => {
			try {
				const { renderBoIdleFrame, boIdleClipName } = await import(
					join(pkgRoot, "dist", "splash.js") as any
				);
				const frame = Math.floor(Math.random() * 12);
				ctx.ui.notify(
					`\n${renderBoIdleFrame(frame)}\n${boIdleClipName(frame)}`,
					"info",
				);
			} catch (err) {
				ctx.ui.notify(
					`bo failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});
}
