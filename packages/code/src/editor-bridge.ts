/**
 * Vim/Neovim managed-pane bridge for CLI-native engineers.
 *
 * Not a full IDE. Provides a discoverable contract + open commands so
 * [neo]vim can sit in a harness-managed terminal pane (tmux split, float,
 * or host TUI) and talk to hobo-code via stdio JSON / send-keys / ACP-shaped
 * bridge modes.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// public-contract: editor bridge schema
export const CODE_EDITOR_BRIDGE_SCHEMA = "hobo.code.editor-bridge/v1" as const;

export type EditorKind = "neovim" | "vim" | "helix" | "editor-env";

export type BridgeMode = "tmux-send" | "stdio-jsonrpc" | "acp" | "direct-exec";

export type PaneLayout = "split-right" | "split-below" | "float" | "replace";

export interface EditorBinary {
	readonly kind: EditorKind;
	readonly binary: string;
	readonly detected: boolean;
	readonly versionHint: string | null;
}

export interface EditorPaneSpec {
	readonly id: string;
	readonly managed: true;
	readonly layout: PaneLayout;
	readonly title: string;
	readonly narrative: string;
}

export interface EditorBridgeContract {
	readonly mode: BridgeMode;
	readonly description: string;
	readonly openCommand: string;
	readonly listenHint: string;
}

export interface EditorExtensionHint {
	readonly id: string;
	readonly path: string;
	readonly present: boolean;
	readonly install: string;
}

export interface EditorBridgeStatus {
	readonly schema: typeof CODE_EDITOR_BRIDGE_SCHEMA;
	readonly targetPath: string | null;
	readonly isolationRootHint: string | null;
	readonly preferred: EditorBinary;
	readonly candidates: readonly EditorBinary[];
	readonly pane: EditorPaneSpec;
	readonly bridges: readonly EditorBridgeContract[];
	readonly activeBridge: BridgeMode;
	readonly extension: EditorExtensionHint;
	readonly cliNavigation: readonly string[];
	readonly legend: string;
	readonly notes: readonly string[];
}

function which(bin: string, env: NodeJS.ProcessEnv): boolean {
	const pathEnv = env.PATH ?? env.Path ?? "";
	for (const dir of pathEnv.split(":")) {
		if (!dir) continue;
		if (existsSync(join(dir, bin))) return true;
	}
	return false;
}

function detectEditors(env: NodeJS.ProcessEnv): EditorBinary[] {
	const list: EditorBinary[] = [
		{
			kind: "neovim",
			binary: "nvim",
			detected: which("nvim", env),
			versionHint: which("nvim", env) ? "nvim" : null,
		},
		{
			kind: "vim",
			binary: "vim",
			detected: which("vim", env),
			versionHint: which("vim", env) ? "vim" : null,
		},
		{
			kind: "helix",
			binary: "hx",
			detected: which("hx", env),
			versionHint: which("hx", env) ? "hx" : null,
		},
	];
	const ed = env.EDITOR?.trim() || env.VISUAL?.trim();
	if (ed) {
		const base = ed.split(/\s+/)[0] ?? ed;
		list.push({
			kind: "editor-env",
			binary: base,
			detected: which(base, env) || existsSync(base),
			versionHint: `$EDITOR=${ed}`,
		});
	}
	return list;
}

function pickPreferred(
	candidates: readonly EditorBinary[],
	force?: string,
): EditorBinary {
	if (force) {
		const f = force.toLowerCase();
		const hit = candidates.find(
			(c) =>
				c.kind === f ||
				c.binary === f ||
				(f === "nvim" && c.kind === "neovim") ||
				(f === "neovim" && c.kind === "neovim"),
		);
		if (hit) return hit;
		return {
			kind: f.includes("vim") && !f.includes("n") ? "vim" : "neovim",
			binary: force,
			detected: false,
			versionHint: null,
		};
	}
	const order: EditorKind[] = ["neovim", "vim", "helix", "editor-env"];
	for (const k of order) {
		const c = candidates.find((x) => x.kind === k && x.detected);
		if (c) return c;
	}
	return (
		candidates[0] ?? {
			kind: "neovim",
			binary: "nvim",
			detected: false,
			versionHint: null,
		}
	);
}

function packageEditorRoot(): string {
	// src/editor-bridge.ts → packages/code
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		return resolve(here, "..");
	} catch {
		return resolve(process.cwd());
	}
}

/**
 * Build editor bridge status for CLI `edit` and nvim extension.
 */
export function inspectEditorBridge(
	options: {
		readonly env?: NodeJS.ProcessEnv;
		readonly path?: string | null;
		readonly editor?: string;
		readonly layout?: PaneLayout;
		readonly bridge?: BridgeMode;
		readonly isolationRoot?: string | null;
		readonly runId?: string | null;
	} = {},
): EditorBridgeStatus {
	const env = options.env ?? process.env;
	const candidates = detectEditors(env);
	const preferred = pickPreferred(candidates, options.editor);
	const layout = options.layout ?? "split-right";
	const targetPath = options.path ? resolve(options.path) : null;
	const isolationRoot = options.isolationRoot ?? null;
	const runId = options.runId ?? null;
	const openTarget = targetPath ?? isolationRoot ?? ".";

	const pkg = packageEditorRoot();
	const extRel = "editor/hobo-code.nvim";
	const extPath = join(pkg, extRel);
	const extPresent = existsSync(join(extPath, "lua", "hobo-code", "init.lua"));

	const pane: EditorPaneSpec = {
		id: runId ? `edit-${runId}` : "edit-main",
		managed: true,
		layout,
		title: "hobo-code·nvim",
		narrative:
			"Managed harness pane: editor sits beside agent chrome (status/tasks), not a detached GUI.",
	};

	const nvimOpen = targetPath
		? `${preferred.binary} ${JSON.stringify(targetPath)}`
		: `${preferred.binary} ${JSON.stringify(openTarget)}`;

	const bridges: EditorBridgeContract[] = [
		{
			mode: "direct-exec",
			description: "Spawn editor in current TTY (simplest; replace focus).",
			openCommand: nvimOpen,
			listenHint: "hobo-code stays parent shell; exit editor to return",
		},
		{
			mode: "tmux-send",
			description:
				"Open [neo]vim in a tmux split managed as harness pane (CLI-native default).",
			openCommand: [
				`tmux split-window -h -c ${JSON.stringify(isolationRoot ?? process.cwd())}`,
				`tmux send-keys -t '{last}' ${JSON.stringify(nvimOpen)} Enter`,
				`tmux select-pane -T ${JSON.stringify(pane.title)}`,
			].join(" && "),
			listenHint: "Requires tmux session; pane title hobo-code·nvim",
		},
		{
			mode: "stdio-jsonrpc",
			description:
				"Editor plugin ↔ hobo-code JSON lines (open/buffer/status) over stdio.",
			openCommand: `hobo-code edit --bridge stdio-jsonrpc${targetPath ? ` ${JSON.stringify(targetPath)}` : ""}`,
			listenHint: "Plugin calls: open | status | isolate-root | promote-hint",
		},
		{
			mode: "acp",
			description:
				"Agent Client Protocol–shaped bridge (editor as ACP client; residual host support).",
			openCommand: `hobo-code edit --bridge acp${targetPath ? ` -- ${JSON.stringify(targetPath)}` : ""}`,
			listenHint:
				"ACP stdio session; partial — prefer tmux-send or stdio-jsonrpc today",
		},
	];

	const activeBridge: BridgeMode =
		options.bridge ?? (which("tmux", env) ? "tmux-send" : "direct-exec");

	return {
		schema: CODE_EDITOR_BRIDGE_SCHEMA,
		targetPath,
		isolationRootHint: isolationRoot,
		preferred,
		candidates,
		pane,
		bridges,
		activeBridge,
		extension: {
			id: "hobo-code.nvim",
			path: extRel,
			present: extPresent,
			install: `lazy: { dir = "${extPath}" }  -- or packpath += ${extPath}`,
		},
		cliNavigation: [
			"hobo-code status          # panes without leaving terminal",
			"hobo-code tasks           # agent board",
			"hobo-code isolate <id>    # sandbox tree → open with edit",
			"hobo-code edit <file>     # managed nvim/vim pane",
			"hobo-code promote <id>    # gates after edit",
			"hobo-code attach          # reattach remote terminal",
		],
		legend: "edit · nvim pane · bridge · keyboard",
		notes: [
			"Prefer neovim; falls back to vim, hx, or $EDITOR.",
			"Default bridge: tmux-send when tmux is on PATH (managed split-right pane).",
			"Extension: packages/code/editor/hobo-code.nvim — open isolation root, jump buffers, :HoboStatus.",
			"CLI-native navigation stays first-class; editor is a pane, not the product.",
			"Never requires VS Code / Cursor GUI.",
		],
	};
}

/** Human panel for hobo-code edit. */
export function editorBridgeHumanSummary(status: EditorBridgeStatus): string {
	const pref = status.preferred;
	const det = pref.detected ? "●" : "○";
	const bridge = status.bridges.find((b) => b.mode === status.activeBridge);
	const tgt = status.targetPath
		? status.targetPath.length > 36
			? `…${status.targetPath.slice(-34)}`
			: status.targetPath
		: status.isolationRootHint
			? "isolation root"
			: ".";
	return [
		`editor · ${det}${pref.binary} (${pref.kind})`,
		`pane · ${status.pane.layout} · ${status.pane.title}`,
		`bridge · ${status.activeBridge}`,
		`target · ${tgt}`,
		`ext · ${status.extension.present ? "●" : "○"} ${status.extension.id}`,
		`open · ${bridge?.openCommand.slice(0, 48) ?? "—"}${
			(bridge?.openCommand.length ?? 0) > 48 ? "…" : ""
		}`,
		`nav · status · tasks · isolate · edit · promote`,
		status.legend,
	].join("\n");
}

/** Print the full open command for the active bridge (for shell eval). */
export function editorBridgeOpenScript(status: EditorBridgeStatus): string {
	const b = status.bridges.find((x) => x.mode === status.activeBridge);
	return b?.openCommand ?? `${status.preferred.binary} .`;
}
