/**
 * HoBo pi extension (ADR-0139) — customizes the pi interactive terminal into
 * the hobo-code persistent chat surface: Chewy-logo + Bo startup header,
 * Bo footer status, and slash commands for every discoverable product surface.
 *
 * Loaded by the hobo-code bin via `pi --no-extensions -e <this file>`
 * (pi compiles TS extensions with jiti — no build step for this file).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Surfaces agents and humans can invoke without leaving the Pi session. */
const SURFACE_COMMANDS: readonly {
	readonly name: string;
	readonly description: string;
	readonly argv: readonly string[];
}[] = [
	{
		name: "status",
		description: "Herdr mux status (panes, highlight→copy)",
		argv: ["status"],
	},
	{
		name: "session",
		description: "Isolation session + durable handback",
		argv: ["session"],
	},
	{
		name: "config",
		description: "Env/flags inventory by stack (setup critique)",
		argv: ["config"],
	},
	{
		name: "cost",
		description: "Budget, $0 free/local path, savings",
		argv: ["cost"],
	},
	{
		name: "harness",
		description: "Pi/Flue dual surface, skills, self-improve, brain",
		argv: ["harness"],
	},
	{
		name: "guide",
		description: "Claude Code → hobo-code map",
		argv: ["guide"],
	},
	{
		name: "cursor",
		description: "Cursor → hobo-code map",
		argv: ["guide", "--cursor"],
	},
	{
		name: "tasks",
		description: "Background task board (Grok Build–shaped)",
		argv: ["tasks"],
	},
	{
		name: "attach",
		description: "Dev-terminal attach (tmux/mosh/Tailscale-shaped)",
		argv: ["attach"],
	},
	{
		name: "models",
		description: "Active model + BYOK env presence (no secrets)",
		argv: ["models"],
	},
	{
		name: "auth",
		description: "Station auth status",
		argv: ["auth", "status"],
	},
	{
		name: "login",
		description: "Human-free local Station login (agent path)",
		argv: ["auth", "login", "--agent"],
	},
	{
		name: "env",
		description: "Hermetic shell + durable layout",
		argv: ["env"],
	},
	{
		name: "edit",
		description: "nvim/vim managed pane bridge help",
		argv: ["edit", "--help"],
	},
	{
		name: "verbs",
		description: "List all hobo-code CLI verbs (top-level help)",
		argv: ["help"],
	},
];

/** Chewy HoBo wordmark + Bo idle frame + discoverability line. */
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
			dim("  hobo-code — not plain Pi · slash commands map CLI surfaces"),
			dim(
				"  /config /cost /harness /status /agents /guide /tasks /login /verbs",
			),
			dim("  outside TUI: hobo-code help · hobo-code <verb> --help"),
			"",
		];
	} catch {
		return ["", dim("  hobo-code — /config /agents /cost /verbs · /exit"), ""];
	}
}

async function runSurface(
	argv: readonly string[],
	ctx: { ui: { notify: (msg: string, kind: string) => void } },
): Promise<void> {
	try {
		const { runHoboCodeCli, formatHoboCodeResult } = await import(
			join(pkgRoot, "dist", "cli.js") as any
		);
		const result = await runHoboCodeCli([...argv], { json: false });
		const text = formatHoboCodeResult(result, false);
		// Cap very long help in the TUI notify channel
		const body =
			text.length > 3500
				? `${text.slice(0, 3500)}\n… (truncated — use hobo-code ${argv[0]} --json)`
				: text;
		ctx.ui.notify(body, result.ok === false ? "error" : "info");
	} catch (err) {
		ctx.ui.notify(
			`${argv.join(" ")} failed: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setTitle("hobo-code");
		ctx.ui.setStatus("hobo", "(••)/@ hobo-code · /config · /agents · /verbs");
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
		ctx.ui.notify(
			[
				"Bo online — this is hobo-code (HoBo app-building harness), not stock Pi Agent.",
				"Slash commands (same as CLI verbs):",
				"  /config  /cost  /harness  /status  /session  /guide  /cursor  /agents",
				"  /tasks  /attach  /models  /auth  /login  /env  /edit  /verbs  /hive  /bo",
				"One-shot outside TUI: hobo-code help · hobo-code agent · hobo-code config",
				"(Binary is hobo-code — plain `hobo` is the control-plane CLI, different product.)",
			].join("\n"),
			"info",
		);
	});

	// Legacy aliases kept for existing sessions / docs.
	pi.registerCommand("hive", {
		description: "Alias for /status (Herdr mux)",
		handler: async (_args, ctx) => runSurface(["status"], ctx),
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

	for (const cmd of SURFACE_COMMANDS) {
		pi.registerCommand(cmd.name, {
			description: cmd.description,
			handler: async (_args, ctx) => runSurface(cmd.argv, ctx),
		});
	}
}
