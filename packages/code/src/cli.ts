/**
 * `hobo-code` CLI — coding harness + multi-node compute (ADR-0139).
 *
 * App-building agent CLI (not a control-plane management tool).
 *   dispatch (default) | status | session | attach | tasks | guide |
 *   scaffold | dev | isolate | promote | env | auth | models | cost | harness |
 *   edit | config | agent | help
 *
 * Binary name: hobo-code (dash permitted).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultProbes, detectAgents } from "./agent-registry.js";
import { agentHumanSummary, inspectAgentSurface } from "./agent-surface.js";
import { allocateAgentWorkspaces } from "./agent-workspaces.js";
import {
	authLogin,
	authStatus,
	clearAuthSession,
	confirmRemoteLogin,
	readAuthSession,
	resolveAuthenticatedStationId,
} from "./auth.js";
import {
	claudeCodeGuide,
	renderClaudeCodeGuideText,
} from "./claude-code-guide.js";
import {
	type ConfigStackId,
	configHumanSummary,
	inspectConfigSurface,
	isConfigStackId,
} from "./config-surface.js";
import { costHumanSummary, inspectCost } from "./cost.js";
import { cursorGuide, renderCursorGuideText } from "./cursor-guide.js";
import {
	DEV_MACHINES_FILE,
	loadDevMachines,
	machinesForAgent,
	resolveMachine,
	sshDestination,
} from "./dev-machines.js";
import { defaultDevenvProbes, devenvSummary, inspectDevenv } from "./devenv.js";
import { startDevBrowserSession } from "./dev-browser.js";
import {
	computeTaskPath,
	describeDistributedCompute,
	dispatchComputeTask,
} from "./distributed.js";
import { dogfoodSummary } from "./dogfood.js";
import {
	type BridgeMode,
	editorBridgeHumanSummary,
	editorBridgeOpenScript,
	inspectEditorBridge,
	type PaneLayout,
} from "./editor-bridge.js";
import { describeEveSubagentSurface } from "./eve.js";
import {
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
	sponsoredWaitState,
} from "./finops.js";
import {
	buildTasksSurface,
	grokBuildParity,
	renderGrokBuildFooter,
	renderTasksBoardText,
} from "./grok-build-parity.js";
import {
	harnessHumanSummary,
	inspectHarnessSurface,
} from "./harness-surface.js";
import { hermeticEnvSummary, inspectHermeticEnv } from "./hermetic-env.js";
import {
	cleanupIsolation,
	createIsolationContext,
	listSandboxOrphans,
} from "./isolation.js";
import {
	brokerPaneSession,
	brokerPanes,
	describePane,
	type OpenedGateway,
	openStationGateway,
	type ResolvedSshIdentity,
} from "./machine-sessions.js";
import { inspectModels, modelsHumanSummary } from "./models.js";
import {
	applyMux,
	attachCommand,
	type MuxRunner,
	type MuxTarget,
	planMux,
	safeWindowName,
	tmuxRunner,
} from "./mux.js";
import {
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	type CodeFeaturePort,
	composeCodePlatform,
	createMemoryFeaturePort,
} from "./platform.js";
import { runProjectGates } from "./promotion-gates.js";
import {
	type CodeRemoteMode,
	describeDevTerminalAttach,
	shortNamedHost,
} from "./remote.js";
import {
	type RemoteSessionServe,
	runResidentSessionCli,
} from "./resident-session-cli.js";
import { type PromotionGate, promoteIsolation } from "./sandbox-promote.js";
import { describeSecureSandboxStack } from "./sandbox-stack.js";
import { scaffoldHighValueTemplate } from "./scaffolding.js";
import { startCodeSession } from "./session.js";
import {
	buildMultiplexerStatus,
	createPane,
	herdrMuxCapabilities,
	renderHerdrCapabilityFooter,
	renderStatusChip,
	renderStatusText,
} from "./tui.js";
import {
	runVirtualPane,
	VIRTUAL_PANE_COMMANDS,
	virtualPaneCommand,
} from "./virtual-pane.js";
import { findWorkspaceRoot } from "./workspace.js";
import { describeCodeWorlds } from "./worlds.js";

export const HOBO_CODE_VERBS = [
	"dispatch",
	"vshell",
	"machines",
	"status",
	"session",
	"attach",
	"mux",
	"tasks",
	"guide",
	"scaffold",
	"dev",
	"isolate",
	"promote",
	"env",
	"auth",
	"models",
	"cost",
	"harness",
	"edit",
	"config",
	"agent",
	"help",
] as const;

/**
 * Closed human panel: title band, soft underline, body rows, bottom rule.
 * Pure presentation — used by every non-status verb.
 * Single body row: soft band omitted (3-line panel).
 * Rule width tracks content (12–20) so short panels stay tight.
 */
function panel(title: string, rows: readonly string[]): string {
	// Single-space body indent — denser than two-space columns.
	const body = rows.map((row) =>
		row.startsWith(" ") || row.startsWith("  ") ? row : ` ${row}`,
	);
	const widest = Math.max(title.length, ...body.map((r) => r.length));
	const ruleW = Math.max(12, Math.min(20, widest));
	const rule = "─".repeat(ruleW);
	// Happy-path one-scan panels drop soft twin (title · body · rule).
	if (body.length === 1) {
		return [title, ...body, rule].join("\n");
	}
	const soft = "·".repeat(ruleW);
	return [title, soft, ...body, rule].join("\n");
}

export type HoboCodeVerb = (typeof HOBO_CODE_VERBS)[number];

const VERB_SET = new Set<string>(HOBO_CODE_VERBS);

/** Levenshtein distance for near-miss verb detection (DX typo feedback). */
function editDistance(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array.from({ length: n + 1 }, () => 0),
	);
	for (let i = 0; i <= m; i++) dp[i]![0] = i;
	for (let j = 0; j <= n; j++) dp[0]![j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i]![j] = Math.min(
				dp[i - 1]![j]! + 1,
				dp[i]![j - 1]! + 1,
				dp[i - 1]![j - 1]! + cost,
			);
		}
	}
	return dp[m]![n]!;
}

/**
 * If a single bare token looks like a mistyped verb (not a multi-word prompt),
 * return the closest known verb; otherwise null (dispatch as prompt).
 */
export function suggestVerbTypo(token: string): string | null {
	const t = token.trim().toLowerCase();
	if (!t || t.includes(" ") || t.length < 3) return null;
	// Multi-word / free-text prompts stay dispatch.
	if (!/^[a-z][a-z0-9_-]*$/i.test(t)) return null;
	if (VERB_SET.has(t)) return null;
	let best: string | null = null;
	let bestD = Infinity;
	for (const v of HOBO_CODE_VERBS) {
		if (v === "help" || v === "dispatch") continue;
		const d = editDistance(t, v);
		// Allow distance 1 always; distance 2 only for longer tokens.
		const maxD = t.length <= 4 ? 1 : 2;
		if (d > 0 && d <= maxD && d < bestD) {
			bestD = d;
			best = v;
		}
	}
	return best;
}

/**
 * CLI-shaped single tokens that are not verbs (hyphen/underscore idioms).
 * GUI-native users often invent command names; celebrating them as dispatch
 * is deceptive magic. One-word natural language (no separators) still dispatches.
 */
export function looksLikeUnknownVerbAttempt(token: string): boolean {
	const t = token.trim().toLowerCase();
	if (!t || t.includes(" ") || t.length < 3) return false;
	if (!/^[a-z][a-z0-9_-]*$/i.test(t)) return false;
	if (VERB_SET.has(t)) return false;
	return t.includes("-") || t.includes("_");
}

export interface HoboCodeCliResult {
	readonly ok: boolean;
	readonly status: string;
	readonly code: string;
	readonly message: string;
	readonly remediation?: readonly string[];
	readonly data?: unknown;
	readonly exitCode: number;
}

export interface HoboCodeCliDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	readonly cwd?: string;
	readonly features?: CodeFeaturePort;
	readonly json?: boolean;
	/**
	 * Opt-in glyph/idiom chrome (power-user strip + ultra-short verb tails).
	 * Default is plain/legible help and full verb titles for unfamiliar devs.
	 * Also: HOBO_CODE_DENSE=1 or --dense / -D.
	 */
	readonly dense?: boolean;
	readonly openStationGateway?: (
		context: Parameters<typeof openStationGateway>[0],
	) => Promise<OpenedGateway>;
	readonly muxRunner?: MuxRunner;
}

export type FormatHoboCodeOptions = {
	readonly json?: boolean;
	readonly dense?: boolean;
};

function defaultHoboHome(env: NodeJS.ProcessEnv): string {
	if (typeof env.HOBO_HOME === "string" && env.HOBO_HOME.length > 0) {
		return env.HOBO_HOME;
	}
	return join(env.HOME ?? tmpdir(), ".hobo");
}

/** Flags that consume the next token as their value (strict parsing). */
const VALUE_FLAGS = new Set([
	"home",
	"workspace",
	"tier",
	"source",
	"session",
	"host",
	"cwd",
	"tenant",
	"domain",
	"station",
	"pool",
	"hive", // legacy alias of --pool
	"stack",
	"path",
	"bridge",
	"layout",
	"editor",
	"e", // alias of --editor
	"complete",
	"run",
	"from",
	"name",
	"out",
	"mode",
	"port",
	"debug-port",
]);

/** Boolean flags (never consume the next token). */
const BOOL_FLAGS = new Set([
	"json",
	"dense",
	"help",
	"agent",
	"force",
	"mock",
	"complete-remote",
	"print-cmd",
	"printcmd",
	"cursor",
	"dry-run",
	"shared",
	"virtual",
	"approve",
	"once",
]);

export class UnknownFlagError extends Error {
	constructor(readonly flag: string) {
		super(
			`Unknown flag "--${flag}". Run "hobo-code help" to see supported flags.`,
		);
		this.name = "UnknownFlagError";
	}
}

function parseArgv(argv: readonly string[]): {
	readonly verb: HoboCodeVerb;
	readonly args: readonly string[];
	readonly flags: Record<string, string | boolean>;
	/** True when dispatch was inferred (bare prompt), not typed as a verb. */
	readonly defaultedVerb: boolean;
} {
	const flags: Record<string, string | boolean> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--") {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (a === "--json") {
			flags.json = true;
			continue;
		}
		if (a === "--dense" || a === "-D") {
			flags.dense = true;
			continue;
		}
		if (a === "--help" || a === "-h") {
			flags.help = true;
			continue;
		}
		if (a.startsWith("--") && a.includes("=")) {
			const eq = a.indexOf("=");
			const name = a.slice(2, eq);
			if (!VALUE_FLAGS.has(name) && !BOOL_FLAGS.has(name)) {
				throw new UnknownFlagError(name);
			}
			flags[name] = a.slice(eq + 1);
			continue;
		}
		if (a.startsWith("--")) {
			const name = a.slice(2);
			if (VALUE_FLAGS.has(name)) {
				const value = argv[i + 1];
				if (value === undefined || value.startsWith("-")) {
					throw new Error(
						`Flag "--${name}" requires a value. Run "hobo-code help" to see supported flags.`,
					);
				}
				flags[name] = value;
				i += 1;
				continue;
			}
			if (BOOL_FLAGS.has(name)) {
				flags[name] = true;
				continue;
			}
			throw new UnknownFlagError(name);
		}
		positional.push(a);
	}

	const first = positional[0];
	// `hobo-code platform --help` keeps verb=platform (subcommand help).
	// Bare `--help` / `help` → top-level help.
	if (flags.help === true) {
		if (first && VERB_SET.has(first) && first !== "help") {
			return {
				verb: first as HoboCodeVerb,
				args: positional.slice(1),
				flags,
				defaultedVerb: false,
			};
		}
		return { verb: "help", args: positional, flags, defaultedVerb: false };
	}

	if (first && VERB_SET.has(first)) {
		return {
			verb: first as HoboCodeVerb,
			args: positional.slice(1),
			flags,
			defaultedVerb: false,
		};
	}
	// Default verb: dispatch. Entire positional list is the prompt.
	return { verb: "dispatch", args: positional, flags, defaultedVerb: true };
}

/**
 * Power-user dense help: intentional glyph/tail idioms (opt-in via --dense).
 * Full keys still available with --json.
 */
function helpTextDense(): string {
	const flags = Object.values(CODE_FEATURE_FLAGS);
	const ofShort = flags
		.map((f) => {
			const tail = f.replace(/^code\./, "").replace(/\..*$/, "");
			if (tail === "harness") return "h";
			if (tail === "evidence") return "e";
			if (tail === "monetization") return "m";
			if (tail === "isolation") return "r";
			if (tail === "distributed") return "d";
			return tail[0] ?? tail;
		})
		.join("");
	return [
		`hobo-code★●${ofShort}`,
		"★d·st·se·sc·i·pr",
		"ev·au·mo",
		"",
		"dense chrome (--dense | -D | HOBO_CODE_DENSE=1)",
		"plain help: hobo-code help   ·   json: hobo-code help --json",
		"",
		"tails: ★d=dispatch-default  st=status  se=session  sc=scaffold",
		"       i=isolate  pr=promote  ev=env  au=auth  mo=models",
		`OF ●${ofShort}: h=harness e=evidence m=monetization r=rift d=distributed`,
	].join("\n");
}

/**
 * Default human-readable help (legible for unfamiliar devs).
 * Full feature-flag keys live in the JSON data payload.
 */
function helpTextPlain(): string {
	const lines = [
		"hobo-code — HoBo coding harness CLI",
		"You are in HoBo’s world · plain by default · --dense is opt-in power chrome",
		"Entry contract: bare hobo-code needs a TTY; pipes/non-TTY must provide a prompt or use help.",
		"",
		"Usage:",
		"  hobo-code <prompt>                 dispatch (default)",
		"  hobo-code <verb> [args] [flags]",
		"  hobo-code help | hobo-code --help",
		"  hobo-code <verb> --help            help for one verb (e.g. auth)",
		"  hobo-code help <verb>              same as <verb> --help",
		"  hobo-code help --dense             power-user glyph strip + legend",
		"",
		"Start here:",
		"  guide      Claude Code / Cursor → hobo-code maps (plain English)",
		"  auth       Login to a Station (local auto, or tenant+domain)",
		"  dispatch   Build / refine the app (default when given a prompt)",
		"  help       This message",
		"",
		"Session & status:",
		"  status     Session / agent panes in plain words (dense glyphs with --dense)",
		"  session    Isolation session + handback",
		"  attach     Dev-terminal attach (tmux/mosh/Tailscale-shaped)",
		"  tasks      Background task board (Grok Build–shaped)",
		"",
		"Craft & cost:",
		"  scaffold   OpenUI/Astryx scaffold template",
		"  dev        Deploy the current web app with browser evidence controls",
		"  isolate    Mediated sandbox for agent work",
		"  promote    Promote a run through gate checklist",
		"  edit       Open [neo]vim in managed harness pane (CLI-native)",
		"  cost       Budget, $0 path, savings, free/local routing",
		"  models     Active model + BYOK / open-model env (no secrets)",
		"  config     Env/flags inventory by stack (setup critique)",
		"",
		"Agent & harness:",
		"  agent      Agent-native: human-free auth, MCP/ACP, unattended",
		"  harness    Pi/Flue dual surface, skills, self-improve, brain",
		"  env        Hermetic shell + durable vs sandbox layout",
		"",
		"Flags:",
		"  --json              Machine-readable envelope (stdout)",
		"  --dense, -D         Power-user dense glyph chrome (opt-in)",
		"  --home <path>       Override HOBO_HOME",
		"  --cwd <path>        Project root (hermetic markers, isolate)",
		"  --help, -h          Show this help (plain by default)",
		"",
		"Env:",
		"  HOBO_HOME           Durable home (default: $HOME/.hobo)",
		"                      Prefer a path outside the Nix store",
		"  HOBO_CODE_DENSE=1   Same as --dense for the process",
		"  HOBO_CODE_AGENT=1   Unattended / no-elicitation agent contract",
		"",
		"First run:",
		"  hobo-code                         # bare TTY → InteractiveShell (Bo + chat + /)",
		"  hobo-code guide | guide --cursor   # Claude Code / Cursor maps",
		"  hobo-code auth login               # Station identity (local auto)",
		"  hobo-code auth login --agent       # human-free agent path",
		'  hobo-code "add a settings page"    # dispatch (default verb)',
		"  hobo-code config | agent           # setup + agent-native inventory",
		"  hobo-code status | tasks | attach | cost | harness | edit",
		"  hobo-code isolate my-run && hobo-code promote my-run",
		"",
		"Examples:",
		'  hobo-code "refine the openui bindle"',
		"  hobo-code scaffold --name demo",
		"  hobo-code dev --cwd demo",
		"  hobo-code config --stack cost-budget",
		"  hobo-code agent --json            # MCP/ACP + unattended contract",
		"  hobo-code edit src/cli.ts        # neovim/vim managed pane",
		"  hobo-code models                # BYOK / open models (no secrets)",
		"  hobo-code cost                  # $0 path + savings",
		"  hobo-code harness               # Pi/Flue dual surface + skills",
		"  hobo-code env --json            # optional hermetic / durable layout",
		"  hobo-code guide --cursor --json # Cursor feature map (machine)",
		"",
		"Notes:",
		"  · Binary is hobo-code (not `hobo code`). Plain help default; --dense opt-in.",
		"  · Bare TTY opens HoBo InteractiveShell (Bo + chat + slash) — not stock Pi UI.",
		"  · Escape hatch only: HOBO_CODE_TUI=pi or hobo-code --pi (engine experiments).",
		"  · Setup: hobo-code config (stacks: agent-native, cost-budget, editor-vim, …).",
		"  · Agents: hobo-code agent (MCP/ACP, human-free auth, no-elicitation).",
		"  · Maps: guide · edit (nvim) · tasks · attach · status · cost · harness · models.",
		"  · CLI-native: prefer keyboard verbs; nvim bridge: packages/code/editor/hobo-code.nvim",
		"  · Nix/devenv optional (never monorepo IaC). Full payloads: hobo-code help --json",
	];
	return lines.join("\n");
}

function helpText(dense: boolean): string {
	return dense ? helpTextDense() : helpTextPlain();
}

/** Per-verb help (plain). Used by `hobo-code <verb> --help` and `hobo-code help <verb>`. */
const VERB_HELP_PLAIN: Record<
	Exclude<HoboCodeVerb, "help">,
	readonly string[]
> = {
	dispatch: [
		"hobo-code dispatch — app-building agent dispatch",
		"",
		"Usage:",
		"  hobo-code dispatch <prompt…>",
		"  hobo-code <prompt…>                 # same (default verb)",
		"",
		"Flags:",
		"  --json              Machine-readable envelope",
		"  --pool <id>         Compute pool (advanced)",
		"  --home <path>       Override HOBO_HOME",
		"  --help, -h          Show this help",
		"",
		"Requires: hobo-code auth login (local Station auto-resolves).",
		"",
		"Examples:",
		'  hobo-code "add a login form to the bindle"',
		'  hobo-code dispatch "refine the openui scaffold"',
		"",
		"See also: hobo-code auth · hobo-code scaffold · hobo-code session",
	],
	status: [
		"hobo-code status — session / agent multiplexer chrome",
		"",
		"Usage:",
		"  hobo-code status                 # plain English hierarchy (default)",
		"  hobo-code status --dense         # power-user glyph box chrome",
		"  hobo-code status --json",
		"",
		"What you see (plain default):",
		"  · Agent list with idle / working / blocked / done words",
		"  · Summary counts, theme, and a clear Next: line",
		"  · Dense glyph box only with --dense (○ ● ▲ ✓ · ▸ focus)",
		"",
		"What you see (--dense):",
		"  · Pane fold with semantic state glyphs; ≤4 panes per fold line",
		"  · Footer legend: herdr · panes · detach · highlight→copy",
		"  · --json exposes copyOnHighlight, detachable, theme, panes, capabilities",
		"",
		"Herdr differentiators (vs single-stream agent CLIs):",
		"  · Multi-pane mux with background-ready agent states",
		"  · Detachable session model (session verb persists handback)",
		"  · Highlight-to-copy: select text in a pane → highlightBuffer / ↳ clip",
		"",
		"Flags:",
		"  --dense, -D         Glyph box chrome (opt-in)",
		"  --json              Machine-readable status + herdr capabilities",
		"  --help, -h          Show this help",
		"",
		"See also: hobo-code session · hobo-code auth status",
	],
	session: [
		"hobo-code session — resident tmux agent sessions + durable handback",
		"",
		"Usage:",
		"  hobo-code session list | create <name> [branch]",
		"  hobo-code session show | attach | switch | detach <sessionId>",
		"  hobo-code session replay <sessionId>  # read-only synchronized timeline",
		"  hobo-code session fork <sessionId> [checkpointId] [name]",
		"  hobo-code session tab <sessionId> <title>",
		"  hobo-code session pane <sessionId> <tabId> <title> [command…]",
		"  hobo-code session split <sessionId> <paneId> <horizontal|vertical> <title> [command…]",
		"  hobo-code session focus | close-pane <sessionId> <paneId>",
		"  hobo-code session prompt <sessionId> <paneId> <text…>",
		"  hobo-code session agent-start <sessionId> <paneId> <provider> <command> [-- <command-args…>]",
		"  hobo-code session agent-stop <sessionId> <agentRunId>",
		"  hobo-code session checkpoint <sessionId> <label>",
		"  hobo-code session restore <sessionId> <checkpointId>",
		"  hobo-code session commit | push | pr | stack | merge … --approve",
		"  hobo-code session stop | delete <sessionId>",
		"  hobo-code session serve [--port <port>]",
		"    Resident terminal tabs plus a lazygit-style Git workbench",
		"  hobo-code session git <sessionId>  # native ANSI pane inside tmux",
		"  hobo-code session serve --host <declared-machine> --port <port>",
		"  hobo-code session              # legacy one-shot handback",
		"",
		"Resident controls:",
		"  One branch-backed worktree per session; tabs, panes, agents, input,",
		"  checkpoints, delivery, detach/reattach, and browser control share",
		"  the same revisioned command/snapshot boundary.",
		"",
		"Persistence:",
		"  SQLite snapshots live under $HOBO_HOME/durable/code/sessions; tmux",
		"  owns PTYs, so sessions survive client and control-server restarts.",
		"",
		"Flags:",
		"  --approve           Required for commit, push, PR, stack, and merge",
		"  --host <machine>    Station-authorized declared dev machine",
		"  --port <port>       Fixed loopback port (required with --host)",
		"  --json              Machine-readable snapshots",
		"  --home <path>       Override HOBO_HOME",
		"  --help, -h          Show this help",
		"",
		"Remote browser serving asks that Station to authorize and audit access,",
		"then gates the installed SSH agent for that lease and opens local",
		"forwarding. No key or session token is copied; denial has no fallback.",
		"",
		"See also: hobo-code attach · hobo-code auth · hobo-code isolate · hobo-code status",
	],
	guide: [
		"hobo-code guide — Claude Code / Cursor → hobo-code maps (plain English)",
		"",
		"For Claude Code advanced users and Cursor power users who want a cheat sheet.",
		"",
		"Usage:",
		"  hobo-code guide                 # Claude Code map (default)",
		"  hobo-code guide --cursor        # Cursor Agent/Composer/Background/BugBot map",
		"  hobo-code guide --json",
		"  hobo-code guide --cursor --json",
		"",
		"Claude Code map (default):",
		"  workflows · remote connect · channels · routines",
		"  automated/ultrareview · browser/Chrome · deep-research",
		"  fork · btw · plan · login",
		"",
		"Cursor map (--cursor):",
		"  Agent mode · Composer · Tab · Background Agent · BugBot",
		"  MCP · Rules · Hooks · Memories · Automations · multi-model · CLI",
		"",
		"Each row shows status (supported / partial / residual) and a try command.",
		"Honest gaps are listed under Residual.",
		"",
		"Flags:",
		"  --cursor            Cursor power-user map (instead of Claude Code)",
		"  --from cursor       Same as --cursor",
		"  --json              Full structured map + residual list",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code guide",
		"  hobo-code guide --cursor",
		"  hobo-code guide --cursor --json",
		"  hobo-code auth login   # then scaffold / dispatch",
		"",
		"See also: hobo-code help · hobo-code scaffold · hobo-code tasks · hobo-code isolate",
	],
	tasks: [
		"hobo-code tasks — background task board (Grok Build–shaped)",
		"",
		"Usage:",
		"  hobo-code tasks",
		"  hobo-code tasks --json",
		"",
		"For AI-native Grok Build users:",
		"  · Grok Build: fullscreen mouse TUI, tasks pane, click still-running,",
		"    workflows overlay, subagents, headless -p, Plan Mode",
		"  · hobo-code tasks: agent task board + clickable task-row story,",
		"    durable Local World workflow steps, grokBuild parity JSON card",
		"",
		"What you see:",
		"  · Subagent/task/watcher rows with semantic glyphs (○ idle · ● work · …)",
		"  · Legend: grok-build · click · tasks · workflows",
		"  · --json: clickableRegions, backgroundTasks, workflows, compare.grokBuild",
		"",
		"Flags:",
		"  --json              Full tasks surface + Grok Build parity card",
		"  --home <path>       Override HOBO_HOME",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code tasks",
		"  hobo-code tasks --json",
		"  hobo-code status    # mux chrome; herdr footer + clickableRegions in data",
		"",
		"See also: hobo-code status · hobo-code session · hobo-code help",
	],
	machines: [
		"hobo-code machines — dev machines panes may reach",
		"",
		"A remote pane used to be `ssh -t <whatever was typed>`: an arbitrary",
		"host, an ambient key, and no record. Machines are declared instead, in",
		`${DEV_MACHINES_FILE} beside the devenv files, so the reachable set is`,
		"reviewable alongside the toolchain.",
		"",
		"Usage:",
		"  hobo-code machines",
		"  hobo-code machines --json",
		"",
		"Each entry needs an id, a host (tailnet name), and an isolationClass;",
		"`user` and `agents` are optional. Entries that do not parse are listed",
		"as rejected rather than dropped.",
		"",
		"`hobo-code mux --host <id>` places panes on one. Sessions are brokered",
		"by the Station's privileged-access gateway, which applies the target's",
		"isolation-class policy and audits every session; a pane the Station did",
		"not authorise is refused rather than opened.",
		"",
		"Each Station authorization gates a lease-bound local SSH-agent",
		"socket backed by SSH_AUTH_SOCK. Keys and tokens are never copied into",
		"the pane; redemption and lease termination drain to Station Yard audit.",
	],
	vshell: [
		"hobo-code vshell — a virtual pane: virtual terminal over a virtual filesystem",
		"",
		"What a normal pane gives an agent is a real shell in a real directory.",
		"rift separates the tree so agents cannot collide, but an agent can still",
		"curl | sh, read ~/.aws/credentials by absolute path, or rm -rf its way",
		"out. A virtual pane closes that: bash is interpreted in-process, so a",
		"command that is not on the allow-list does not exist — there is no",
		"execve behind it to escape to.",
		"",
		"Usage:",
		"  hobo-code vshell                         virtual pane over the current project",
		"  hobo-code vshell --workspace DIR         mount a specific directory",
		"  hobo-code vshell --name claude           name the pane",
		"  hobo-code vshell --tier T --source DIR   from a rift record (see below)",
		"",
		"Inside the pane:",
		"  commands        list what exists here",
		"  exit | Ctrl-D   leave",
		"",
		"Reads come from the real tree; writes stay in memory until promotion.",
		"No path resolves outside the mounted root, and there are no network",
		"commands at all.",
		"",
		"--tier/--source come from `hobo-rift create --json`, and are for running",
		"vshell OUTSIDE the workspace's namespace: an overlay path is empty to a",
		"process outside it, so the source is mounted instead.",
		"",
		"Do NOT pass them when vshell runs inside `hobo-rift exec` (which is what",
		"`mux --virtual` does): there the merged path is real, and mounting the",
		"source would hand the agent the SHARED tree instead of its own — exactly",
		"the collision rift exists to prevent.",
		"",
		"Not a VM: this bounds what an agent can name and touch, not what",
		"hostile native code could do.",
	],
	mux: [
		"hobo-code mux — herdr-style multi-pane tmux session",
		"",
		"Seats every agent found on this machine in its own tmux window.",
		"Local agents, local inference and ssh hosts are the same kind of",
		"target: a command in a pane, so detach/reattach works identically.",
		"",
		"Usage:",
		"  hobo-code mux                     detect agents, create/reuse session 'hobo'",
		"  hobo-code mux --session work      name the session",
		"  hobo-code mux --host box.example  run the same panes over ssh",
		"  hobo-code mux --virtual           panes get a virtual terminal + filesystem",
		"  hobo-code mux --dry-run           show the plan without touching tmux",
		"",
		"--virtual replaces each pane's shell with an interpreter over a virtual",
		"filesystem: commands off the allow-list do not exist, there is no network",
		"and no execve, and writes stay off the checkout until promotion.",
		"",
		"Detection is evidence-based: a binary on PATH and/or a known config",
		"directory. See hobo-code agent for what was found and why.",
		"",
		"Join: tmux attach -t hobo",
	],
	attach: [
		"hobo-code attach — dev-terminal attach (tmux / mosh / Tailscale-shaped)",
		"",
		"Usage:",
		"  hobo-code attach",
		"  hobo-code attach --mode local|overlay",
		"  hobo-code attach --json",
		"",
		"Mental model (preferred setups):",
		"  · tmux     → detach/reattach coding sessions after SSH drop",
		"  · cmux     → concurrent panes (see hobo-code status / session)",
		"  · mosh     → optional UDP roaming on lossy mobile links",
		"  · Tailscale→ --mode overlay named endpoint on the tailnet (ADR-0130)",
		"",
		"What you get:",
		"  · Deterministic named endpoint host (local .hobo.localhost or overlay)",
		"  · Attach / reattach steps + ssh/mosh hints",
		"  · Link to session durable handback under $HOBO_HOME",
		"  · Not a control-plane admin surface (no platform/budget/hive)",
		"",
		"Flags:",
		"  --mode local|overlay   Endpoint mode (default: local)",
		"  --json                 Full registration + compare + attach steps",
		"  --home <path>          Override HOBO_HOME",
		"  --help, -h             Show this help",
		"",
		"Examples:",
		"  hobo-code attach",
		"  hobo-code attach --mode overlay --json",
		"  hobo-code session   # open work on the box, then re-attach later",
		"",
		"See also: hobo-code session · hobo-code status · hobo-code auth",
	],
	scaffold: [
		"hobo-code scaffold — OpenUI/Astryx scaffold template",
		"",
		"Usage:",
		"  hobo-code scaffold [--name <name>] [--out <dir>]",
		"",
		"Flags:",
		"  --name <name>       Scaffold name",
		"  --out <dir>         Output directory",
		"  --json              Machine-readable result",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code scaffold --name demo",
		"",
		"See also: hobo-code dispatch · hobo-code help",
	],
	dev: [
		"hobo-code dev — local browser deployment with evidence controls",
		"",
		"Usage:",
		"  hobo-code dev [--cwd <app>] [--port <port>] [--debug-port <port>]",
		"  hobo-code dev --once --json       # bounded deployment probe",
		"",
		"The app is served from public/. Open the debug URL to use the Evidence",
		"overlay for reports, annotations, screenshots, recordings, and replay.",
		"",
		"Flags:",
		"  --cwd <app>         App root containing public/index.html",
		"  --port <port>       Raw app port (default 4173; 0 chooses a free port)",
		"  --debug-port <port> Evidence controls port (default 4174; 0 chooses free)",
		"  --once              Probe both surfaces, then stop",
		"  --json              Machine-readable deployment URLs and evidence path",
		"",
		"See also: hobo-code scaffold · hobo-code harness · hobo-code session",
	],
	isolate: [
		"hobo-code isolate — mediated sandbox for agent work",
		"",
		"Usage:",
		"  hobo-code isolate [runId]",
		"",
		"Flags:",
		"  --json              Isolation context + layout",
		"  --cwd <path>        Project root",
		"  --home <path>       Override HOBO_HOME",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code isolate my-run",
		"  hobo-code promote my-run",
		"",
		"See also: hobo-code promote · hobo-code session",
	],
	promote: [
		"hobo-code promote — promote a run through gate checklist",
		"",
		"Usage:",
		"  hobo-code promote <runId>",
		"  hobo-code promote --run <runId>",
		"",
		"Flags:",
		"  --run <runId>       Run id",
		"  --json              Machine-readable result",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code isolate my-run && hobo-code promote my-run",
		"",
		"See also: hobo-code isolate · hobo-code status",
	],
	env: [
		"hobo-code env — hermetic shell + durable layout",
		"",
		"Usage:",
		"  hobo-code env",
		"  hobo-code env --json",
		"",
		"Flags:",
		"  --json              Full hermetic report",
		"  --cwd <path>        Project root",
		"  --home <path>       Override HOBO_HOME",
		"  --help, -h          Show this help",
		"",
		"See also: hobo-code help · hobo-code auth status",
	],
	models: [
		"hobo-code models — active model + BYOK / open models",
		"",
		"Usage:",
		"  hobo-code models",
		"  hobo-code models --json",
		"",
		"Shows the active provider/model (HOBO_CODE_MODEL or default) and which",
		"BYOK env *names* are set — never prints secret values.",
		"",
		"GHCP-parity notes:",
		"  · Open models via BYOK env keys (OpenAI, Anthropic, Google, xAI, …)",
		"  · Interactive animated title on bare TTY `hobo-code`",
		"  · Sandbox via isolate/session after auth login",
		"",
		"$0 / free-local (cost-conscious):",
		"  · export HOBO_CODE_MODEL=ollama/qwen2.5-coder:7b",
		"  · or OPENAI_BASE_URL=http://127.0.0.1:… for local OpenAI-compatible / OrnithAI-class",
		"  · see hobo-code cost for budget + savings scoreboard",
		"",
		"Flags:",
		"  --json              Full models payload",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  export HOBO_CODE_MODEL=openai/gpt-4.1",
		"  export OPENAI_API_KEY=…   # value never shown by models",
		"  hobo-code models",
		"",
		"See also: hobo-code cost · hobo-code auth · hobo-code help",
	],
	config: [
		"hobo-code config — env/flags inventory by stack (setup critique)",
		"",
		"Personas judge setup from preferred stacks. This command lists knobs,",
		"presence (never secret values), and a setup checklist.",
		"",
		"Usage:",
		"  hobo-code config",
		"  hobo-code config --stack cost-budget|editor-vim|hermetic-nix|…",
		"  hobo-code config --json",
		"",
		"Stacks:",
		"  core · auth · models-byok · cost-budget · hermetic-nix",
		"  isolation · remote-attach · editor-vim · harness-pi-flue",
		"  chrome-dense · monetization",
		"",
		"Flags:",
		"  --stack <id>        Filter knobs to one stack",
		"  --json              Full inventory",
		"  --cwd <path>        Project root for file markers",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code config",
		"  hobo-code config --stack editor-vim",
		"  hobo-code config --stack cost-budget --json",
		"",
		"See also: hobo-code env · hobo-code cost · hobo-code models · hobo-code edit",
	],
	edit: [
		"hobo-code edit — open [neo]vim in a managed harness pane",
		"",
		"For CLI-native engineers who live in vim/neovim (keyboard-first).",
		"",
		"Usage:",
		"  hobo-code edit [path]",
		"  hobo-code edit --editor nvim|vim|hx",
		"  hobo-code edit --bridge tmux-send|direct-exec|stdio-jsonrpc|acp",
		"  hobo-code edit --layout split-right|split-below|float|replace",
		"  hobo-code edit --json [path]",
		"  hobo-code edit --print-cmd [path]   # print open script only (shell eval)",
		"",
		"Bridge:",
		"  · tmux-send (default when tmux on PATH) — split pane titled hobo-code·nvim",
		"  · direct-exec — spawn editor in this TTY",
		"  · stdio-jsonrpc — neovim plugin ↔ hobo-code JSON",
		"  · acp — ACP-shaped (partial)",
		"",
		"Extension:",
		"  packages/code/editor/hobo-code.nvim  →  :HoboOpen :HoboStatus :HoboIsolation",
		"",
		"CLI navigation (no GUI):",
		"  status · tasks · isolate · edit · promote · attach",
		"",
		"Flags:",
		"  --editor <bin>      nvim | vim | hx | $EDITOR binary",
		"  --bridge <mode>     tmux-send | direct-exec | stdio-jsonrpc | acp",
		"  --layout <layout>   split-right | split-below | float | replace",
		"  --print-cmd         Print open command only (no panel)",
		"  --json              Full bridge contract",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code edit src/cli.ts",
		"  hobo-code isolate my-run && hobo-code edit .",
		"  hobo-code edit --bridge tmux-send --print-cmd path",
		"",
		"See also: hobo-code status · hobo-code isolate · hobo-code attach · hobo-code harness",
	],
	harness: [
		"hobo-code harness — Pi/Flue dual surface, skills, self-improve, brain",
		"",
		"For AI automation engineers who live in harnesses (Pi terminal + Flue durable).",
		"",
		"Usage:",
		"  hobo-code harness",
		"  hobo-code harness --json",
		"",
		"Shows:",
		"  · Dual surface: Pi TUI path + flue run hobo-code",
		"  · Shared customization (harness-customization.ts — ADR-0139)",
		"  · Skill roots (.agents/skills, .claude/skills) + presence",
		"  · Eve-shaped subagents (investigator · implementer · reviewer)",
		"  · Self-improve loop: isolate → evidence → promote → durable",
		"  · Brain notes: Serena · gbrain · durable handback · GraphRAG residual",
		"",
		"Pi vs Flue (mental model):",
		"  · Pi  — lightweight terminal coding-agent harness (tools loop)",
		"  · Flue — TypeScript framework on Pi: describe knowledge, durable run",
		"",
		"Flags:",
		"  --json              Full harness inventory",
		"  --cwd <path>        Project root for skill-root presence",
		"  --home <path>       Override HOBO_HOME (worlds hint)",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code harness",
		"  hobo-code harness --json",
		'  flue run hobo-code --input \'{"message":"status"}\'',
		"",
		"See also: hobo-code session · hobo-code tasks · hobo-code isolate · hobo-code cost",
	],
	cost: [
		"hobo-code cost — budget, $0 path, savings, free/local routing",
		"",
		"For cost-conscious open-source devs on a tight or $0 budget.",
		"",
		"Usage:",
		"  hobo-code cost",
		"  hobo-code cost --json",
		"",
		"Shows:",
		"  · Spend / cap / remaining (HOBO_CODE_BUDGET_USD)",
		"  · Routing policy (cheapest-capable by default)",
		"  · Active model + local/free hint",
		"  · Savings vs illustrative always-frontier baseline",
		"  · Free/local recipes (Ollama, OpenAI-compatible local, OrnithAI-class)",
		"  · Token-tool stack (RTK, headroom, caveman, Serena, ponytail)",
		"  · Monetization disable path (never inspects code/prompts)",
		"",
		"Env:",
		"  HOBO_CODE_BUDGET_USD=5          Cap (default 5)",
		"  HOBO_CODE_ROUTING=cheapest-capable|pinned|fallback-chain",
		"  HOBO_CODE_MONETIZATION=0        Force monetization off",
		"  HOBO_CODE_MODEL=ollama/…        Free/local model id",
		"  OPENAI_BASE_URL / OLLAMA_HOST   Local endpoint",
		"",
		"Flags:",
		"  --json              Full cost payload",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  export HOBO_CODE_MONETIZATION=0",
		"  export HOBO_CODE_MODEL=ollama/qwen2.5-coder:7b",
		"  hobo-code cost",
		"",
		"See also: hobo-code models · hobo-code help",
	],
	auth: [
		"hobo-code auth — login to a Station (app agent identity)",
		"",
		"Usage:",
		"  hobo-code auth login",
		"  hobo-code auth login --tenant <id> --domain <host>",
		"  hobo-code auth login --complete <device-code>",
		"  hobo-code auth status",
		"  hobo-code auth logout",
		"  hobo-code auth whoami",
		"",
		"Local Station (default):",
		"  Auto-resolves station:local (or the only local Station), inits if needed.",
		"  Similar to a happy-path local copilot login — no browser required.",
		"",
		"Agent / human-free (preferred for coding agents):",
		"  hobo-code auth login --agent",
		"  Sets HOBO_CODE_AGENT contract: no browser, no elicitation, session-ref.",
		"  Or: export HOBO_CODE_SESSION_REF=… / prior durable session.json",
		"",
		"Remote Station (human bootstrap residual for agents):",
		"  Provide --tenant and --domain (station host).",
		"  Prints a one-time device code + verification URL (RFC 8628-shaped).",
		"  Complete with: hobo-code auth login --complete <code>",
		"  Steady-state agents should prefer local/session-ref over device-code.",
		"",
		"Flags:",
		"  --agent             Human-free local login + agent contract",
		"  --tenant <id>       Tenant (required for remote)",
		"  --domain <host>     Station domain (triggers remote login)",
		"  --station <id>      Explicit station id",
		"  --complete <code>   Finish remote device-code login",
		"  --json              Machine-readable envelope",
		"  --help, -h          Show this help",
		"",
		"Examples:",
		"  hobo-code auth login",
		"  hobo-code auth login --agent",
		"  hobo-code auth login --tenant acme --domain stations.acme.example",
		"  hobo-code auth status",
		"  hobo-code auth logout",
		"",
		"See also: hobo-code agent · hobo-code session · hobo-code dispatch",
	],
	agent: [
		"hobo-code agent — agent-native readiness (AX)",
		"",
		"For coding agents that need:",
		"  · Human-free auth (local Station / session-ref; not browser-only)",
		"  · Safe unattended iterate (isolate→promote, no elicitation)",
		"  · Learn from mistakes (self-improve + durable handback)",
		"  · Native protocols (MCP tools, ACP stdio, --json)",
		"",
		"Usage:",
		"  hobo-code agent",
		"  hobo-code agent --json",
		"",
		"Standards inventory (honest status):",
		"  · MCP — tools/resources; stdio env credentials; HTTP OAuth 2.1 residual",
		"  · ACP — editor↔agent JSON-RPC 2.0 over stdio (partial host)",
		"  · stdio-jsonrpc / cli-json — unattended verb contract",
		"  · Device-code / CIBA — human bootstrap residual",
		"",
		"Env:",
		"  HOBO_CODE_AGENT=1              Enable agent contract",
		"  HOBO_CODE_NO_ELICITATION=1     Same (no prompts)",
		"  HOBO_CODE_SESSION_REF=…        Pre-bound session (never printed)",
		"",
		"Examples:",
		"  export HOBO_CODE_AGENT=1",
		"  hobo-code auth login --agent",
		"  hobo-code agent --json",
		"  hobo-code isolate --json && hobo-code promote --run <id> --json",
		"",
		"See also: hobo-code harness · hobo-code config --stack agent-native · auth",
	],
};

function verbHelpText(verb: HoboCodeVerb, dense: boolean): string {
	if (verb === "help") return helpText(dense);
	if (dense) {
		// Compact one-liner pointer + plain block would thrash; keep short.
		const tails: Record<string, string> = {
			dispatch: "★d",
			status: "st",
			session: "se",
			attach: "at",
			tasks: "tk",
			guide: "gd",
			scaffold: "sc",
			dev: "dv",
			isolate: "i",
			promote: "pr",
			env: "ev",
			auth: "au",
			models: "mo",
			cost: "$",
			harness: "hz",
			edit: "ed",
			config: "cfg",
			agent: "ag",
		};
		const t = tails[verb] ?? verb;
		return [
			`hobo-code ${verb} · dense · tail ${t}`,
			`plain: hobo-code ${verb} --help`,
			`top:   hobo-code help --dense`,
			"",
			...VERB_HELP_PLAIN[verb],
		].join("\n");
	}
	return VERB_HELP_PLAIN[verb].join("\n");
}

function isTopicVerb(token: string): token is Exclude<HoboCodeVerb, "help"> {
	return VERB_SET.has(token) && token !== "help";
}

/**
 * When --dense, compress long verb titles to power-user tails (glyph idioms).
 * Default (plain) leaves messages unchanged for unfamiliar devs.
 */
export function applyDenseChrome(message: string): string {
	const lines = message.split("\n");
	const titleMap: Record<string, string> = {
		"▣ isolate": "▣ i",
		"✓ promote": "✓ pr",
		"✕ promote": "✕ pr",
		"✕ isolate": "✕ i",
		"✕ session": "✕ se",
		"✕ distributed": "✕ dist",
		"✕ cmd": "✕ ?",
		"? cmd": "? ?",
		"▣ env": "▣ ev",
		"▣ pl": "▣ pl",
		"◎ re": "◎ re",
		"◎ attach": "◎ at",
		"▣ tasks": "▣ tk",
		"▣ guide": "▣ gd",
		"◈ b": "◈ b",
		"✦ sc": "✦ sc",
		"◈ cost": "◈ $",
		"◈ harness": "◈ hz",
		"◈ edit": "◈ ed",
		"◈ config": "◈ cfg",
	};
	return lines
		.map((line, idx) => {
			if (idx === 0 && titleMap[line]) return titleMap[line]!;
			// Short next-step idioms
			return line
				.replace(/^ next · hobo-code promote (.+)$/, " next · pr $1")
				.replace(/^ next · hobo-code status$/, " next · st")
				.replace(/^ try · hobo-code help$/, " try · help")
				.replace(/^ did you mean · /, " ≈ ")
				.replace(/^ unknown · /, " ? ");
		})
		.join("\n");
}

/**
 * Run the hobo-code CLI. Dispatch is the default verb when none is given.
 */
export async function runHoboCodeCli(
	argv: readonly string[],
	deps: HoboCodeCliDeps = {},
): Promise<HoboCodeCliResult> {
	const env = deps.env ?? process.env;
	let parsed: ReturnType<typeof parseArgv>;
	try {
		parsed = parseArgv(argv);
	} catch (error) {
		// Strict flag parsing: unknown/malformed flags fail with a help pointer.
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			status: "failed",
			code: "HOBO_CODE_UNKNOWN_FLAG",
			message: panel("✕ flags", [message, "try · hobo-code help"]),
			remediation: ["hobo-code help", "hobo-code <verb> --help"],
			exitCode: 1,
		};
	}
	const { verb, args, flags, defaultedVerb } = parsed;
	const json = deps.json === true || flags.json === true;
	const dense =
		deps.dense === true ||
		flags.dense === true ||
		env.HOBO_CODE_DENSE === "1" ||
		env.HOBO_CODE_DENSE === "true";
	const hoboHome =
		(typeof flags.home === "string" && flags.home) ||
		deps.hoboHome ||
		defaultHoboHome(env);
	const projectDir =
		(typeof flags.cwd === "string" && flags.cwd) || deps.cwd || process.cwd();
	const tenant =
		(typeof flags.tenant === "string" && flags.tenant) ||
		(typeof env.HOBO_TENANT === "string" && env.HOBO_TENANT) ||
		"local";
	const stationFlag =
		typeof flags.station === "string" ? flags.station : undefined;
	const poolId =
		(typeof flags.pool === "string" && flags.pool) ||
		(typeof flags.hive === "string" && flags.hive) || // legacy alias
		"default";
	const features = deps.features ?? createMemoryFeaturePort();

	const authSession = readAuthSession(hoboHome);
	const resolvedStation =
		stationFlag ??
		authSession?.stationId ??
		resolveAuthenticatedStationId(hoboHome);
	const resolvedTenant =
		tenant !== "local" ? tenant : (authSession?.tenant ?? tenant);
	const platform = composeCodePlatform({
		hoboHome,
		...(resolvedStation !== undefined ? { stationId: resolvedStation } : {}),
		autoInitStation: !(verb === "session" && typeof flags.host === "string"),
		tenant: resolvedTenant,
		features,
	});

	const withDense = (data?: unknown): unknown => {
		if (data === undefined) return { dense };
		if (typeof data === "object" && data !== null && !Array.isArray(data)) {
			return { dense, ...(data as Record<string, unknown>) };
		}
		return { dense, payload: data };
	};

	const ok = (
		code: string,
		message: string,
		data?: unknown,
	): HoboCodeCliResult => ({
		ok: true,
		status: "ok",
		code,
		message,
		data: withDense(data),
		exitCode: 0,
	});

	const fail = (
		code: string,
		message: string,
		remediation?: readonly string[],
		data?: unknown,
	): HoboCodeCliResult => ({
		ok: false,
		status: "failed",
		code,
		message,
		...(remediation !== undefined ? { remediation } : {}),
		data: withDense(data),
		exitCode: 1,
	});

	// json/dense formatting is applied by formatHoboCodeResult / bin.

	// Bare single-token near-miss / CLI-shaped unknowns → kind recovery, not ★ success.
	if (defaultedVerb && args.length === 1) {
		const raw = String(args[0] ?? "");
		const suggestion = suggestVerbTypo(raw);
		if (suggestion) {
			return fail(
				"HOBO_CODE_UNKNOWN_VERB",
				panel("? cmd", [
					`not a verb · ${raw}`,
					`did you mean · ${suggestion}`,
					"try · hobo-code help",
					`prompt · hobo-code "${raw}"`,
				]),
				[
					`hobo-code ${suggestion} …`,
					"hobo-code help",
					`hobo-code "${raw}"  # send as build prompt`,
				],
				{ unknown: raw, suggestion, defaultVerb: "dispatch" },
			);
		}
		if (looksLikeUnknownVerbAttempt(raw)) {
			return fail(
				"HOBO_CODE_UNKNOWN_VERB",
				panel("? cmd", [
					`not a verb · ${raw}`,
					"try · hobo-code help",
					`prompt · hobo-code "${raw}"`,
					"or · hobo-code guide",
				]),
				[
					"hobo-code help",
					`hobo-code "${raw}"  # send as build prompt`,
					"hobo-code guide",
					'hobo-code "add a settings page"',
				],
				{ unknown: raw, defaultVerb: "dispatch" },
			);
		}
	}

	const hermetic = inspectHermeticEnv({
		projectRoot: projectDir,
		hoboHome,
		env,
	});

	// Subcommand help: `hobo-code platform --help` or `hobo-code help platform`
	const helpTopic =
		verb === "help" && args[0] && isTopicVerb(String(args[0]))
			? (String(args[0]) as Exclude<HoboCodeVerb, "help">)
			: flags.help === true && verb !== "help"
				? (verb as Exclude<HoboCodeVerb, "help">)
				: null;

	if (verb === "help" || helpTopic !== null) {
		const topic = helpTopic;
		const message =
			topic !== null ? verbHelpText(topic, dense) : helpText(dense);
		return ok("HOBO_CODE_HELP", message, {
			verbs: [...HOBO_CODE_VERBS],
			defaultVerb: "dispatch",
			dense,
			topic: topic ?? "top",
			defaults: CODE_FEATURE_DEFAULTS,
			distributed: describeDistributedCompute(),
			binary: "hobo-code",
			subagents: describeEveSubagentSurface(),
			secureSandbox: describeSecureSandboxStack(),
			worlds: describeCodeWorlds(hoboHome),
			hermetic,
			hermeticPolicy:
				"Optional devenv/nix for hobo-code hermetic toolchains; not required; durable state stays under HOBO_HOME outside sandboxes.",
		});
	}

	if (verb === "models") {
		const status = inspectModels(env);
		const body = modelsHumanSummary(status);
		const text = panel("▣ models", body.split("\n"));
		return ok("HOBO_CODE_MODELS", text, { models: status, text });
	}

	if (verb === "cost") {
		const status = inspectCost(env);
		const body = costHumanSummary(status);
		const text = panel("◈ cost", body.split("\n"));
		return ok("HOBO_CODE_COST", text, { cost: status, text });
	}

	if (verb === "harness") {
		const status = inspectHarnessSurface({
			cwd: projectDir,
			hoboHome,
		});
		const body = harnessHumanSummary(status);
		const text = panel("◈ harness", body.split("\n"));
		return ok("HOBO_CODE_HARNESS", text, { harness: status, text });
	}

	if (verb === "config") {
		const stackRaw =
			typeof flags.stack === "string"
				? flags.stack.toLowerCase()
				: args[0] && !args[0].startsWith("-")
					? args[0].toLowerCase()
					: "";
		const stack: ConfigStackId | null = isConfigStackId(stackRaw)
			? stackRaw
			: null;
		if (stackRaw && !stack) {
			return fail(
				"HOBO_CODE_CONFIG_USAGE",
				panel("✕ config", [
					`unknown stack · ${stackRaw}`,
					"try · agent-native | cost-budget | editor-vim | hermetic-nix | harness-pi-flue",
					"list · hobo-code config --help",
				]),
				["hobo-code config --help", "hobo-code config --json"],
			);
		}
		const status = inspectConfigSurface(env, projectDir);
		const body = configHumanSummary(status, stack);
		const text = panel("◈ config", body.split("\n"));
		return ok("HOBO_CODE_CONFIG", text, {
			config: status,
			stack,
			text,
		});
	}

	if (verb === "agent") {
		const status = inspectAgentSurface({
			hoboHome,
			cwd: projectDir,
			env,
		});
		const body = agentHumanSummary(status);
		const text = panel("◈ agent", body.split("\n"));
		return ok("HOBO_CODE_AGENT", text, { agent: status, text });
	}

	if (verb === "edit") {
		const pathArg =
			args.find((a) => !a.startsWith("-")) ??
			(typeof flags.path === "string" ? flags.path : null);
		const bridgeRaw =
			typeof flags.bridge === "string" ? flags.bridge.toLowerCase() : "";
		const bridge = (
			["tmux-send", "direct-exec", "stdio-jsonrpc", "acp"] as const
		).includes(bridgeRaw as BridgeMode)
			? (bridgeRaw as BridgeMode)
			: undefined;
		const layoutRaw =
			typeof flags.layout === "string" ? flags.layout.toLowerCase() : "";
		const layout = (
			["split-right", "split-below", "float", "replace"] as const
		).includes(layoutRaw as PaneLayout)
			? (layoutRaw as PaneLayout)
			: undefined;
		const editor =
			typeof flags.editor === "string"
				? flags.editor
				: typeof flags.e === "string"
					? flags.e
					: undefined;
		const status = inspectEditorBridge({
			env,
			path: pathArg,
			...(editor !== undefined ? { editor } : {}),
			...(layout !== undefined ? { layout } : {}),
			...(bridge !== undefined ? { bridge } : {}),
			isolationRoot: null,
		});
		const openCmd = editorBridgeOpenScript(status);
		if (flags["print-cmd"] === true || flags.printcmd === true) {
			return ok(
				"HOBO_CODE_EDIT",
				openCmd.endsWith("\n") ? openCmd : `${openCmd}\n`,
				{
					editor: status,
					openCommand: openCmd,
					text: openCmd,
				},
			);
		}
		const body = editorBridgeHumanSummary(status);
		const text = panel("◈ edit", [
			...body.split("\n"),
			`cmd · ${openCmd.length > 42 ? `${openCmd.slice(0, 40)}…` : openCmd}`,
			"run · hobo-code edit --print-cmd … | sh   # or eval",
		]);
		return ok("HOBO_CODE_EDIT", text, {
			editor: status,
			openCommand: openCmd,
			text,
		});
	}

	if (verb === "auth") {
		const sub = (args[0] ?? "status").toLowerCase();
		const completeCode =
			typeof flags.complete === "string"
				? flags.complete
				: args[0]?.toLowerCase() === "login" && args[1] === "--complete"
					? args[2]
					: undefined;
		// login --complete CODE  or  auth login with --complete flag
		if (
			sub === "login" &&
			(typeof flags.complete === "string" || args[1] === "--complete")
		) {
			const code =
				(typeof flags.complete === "string" && flags.complete) ||
				(args[1] === "--complete" ? args[2] : undefined) ||
				args[1];
			if (!code) {
				return fail(
					"HOBO_CODE_AUTH_USAGE",
					panel("✕ auth", [
						"missing device code",
						"usage · hobo-code auth login --complete <code>",
					]),
					["hobo-code auth login --tenant <t> --domain <host>"],
				);
			}
			const result = confirmRemoteLogin({
				hoboHome,
				userCode: String(code),
			});
			if (!result.ok || result.status !== "logged-in") {
				const codeOut = result.ok ? "HOBO_CODE_AUTH_PENDING" : result.code;
				const msg = result.message;
				const rem = result.ok ? [] : result.remediation;
				return fail(codeOut, panel("✕ auth", [msg]), rem);
			}
			const text = panel("✓ auth", [
				result.message,
				`station · ${result.session.stationId}`,
				'next · hobo-code dispatch "…"',
			]);
			return ok("HOBO_CODE_AUTH", text, { auth: result, text });
		}
		if (sub === "login") {
			const agentLogin =
				flags.agent === true ||
				env.HOBO_CODE_AGENT === "1" ||
				env.HOBO_CODE_AGENT === "true";
			// Agent path refuses remote device-code as steady-state: force local.
			if (
				agentLogin &&
				(typeof flags.domain === "string" ||
					typeof flags.tenant === "string") &&
				flags.force !== true
			) {
				return fail(
					"HOBO_CODE_AUTH_AGENT_REMOTE",
					panel("✕ auth", [
						"agent login refuses interactive remote device-code",
						"use · local Station (drop --tenant/--domain)",
						"or · pre-bind HOBO_CODE_SESSION_REF / prior session.json",
						"human bootstrap · auth login --tenant … --domain … (no --agent)",
					]),
					[
						"hobo-code auth login --agent",
						"export HOBO_CODE_SESSION_REF=…",
						"hobo-code agent --json",
					],
				);
			}
			const mock =
				env.HOBO_CODE_AUTH_MOCK === "1" ||
				flags.mock === true ||
				flags["complete-remote"] === true;
			const result = authLogin({
				hoboHome,
				...(typeof flags.tenant === "string" && !agentLogin
					? { tenant: flags.tenant }
					: {}),
				...(typeof flags.domain === "string" && !agentLogin
					? { domain: flags.domain }
					: {}),
				...(typeof flags.station === "string"
					? { stationId: flags.station }
					: {}),
				completeRemoteImmediately: mock,
				autoInitLocal: true,
			});
			if (!result.ok) {
				return fail(
					result.code,
					panel("✕ auth", [
						result.message,
						...result.remediation.map((r) => `→ ${r}`),
					]),
					result.remediation,
				);
			}
			if (result.status === "device-code-pending") {
				const text = panel("◎ auth login", [
					"remote device code",
					`code · ${result.userCode}`,
					`open · ${result.verificationUrl}`,
					`then · hobo-code auth login --complete ${result.userCode}`,
				]);
				return ok("HOBO_CODE_AUTH_PENDING", text, { auth: result, text });
			}
			const text = panel("✓ auth login", [
				result.session.mode === "local"
					? `Logged in to Station ${result.session.stationId} (local)`
					: `Logged in to Station ${result.session.displayName}`,
				`tenant · ${result.session.tenant}`,
				...(result.session.domain ? [`domain · ${result.session.domain}`] : []),
				...(agentLogin
					? [
							"agent · human-free · no-elicitation",
							`sessionRef · ${result.session.sessionRef.slice(0, 12)}…`,
							"next · hobo-code agent --json · isolate --json",
						]
					: [
							"sandbox · isolate/session (mediated)",
							"models · hobo-code models",
							'next · hobo-code "build something"',
						]),
			]);
			return ok("HOBO_CODE_AUTH", text, {
				auth: result,
				session: result.session,
				text,
			});
		}
		if (sub === "logout") {
			const cleared = clearAuthSession(hoboHome);
			const text = panel("✓ auth logout", [
				cleared ? "signed out" : "already signed out",
				"next · hobo-code auth login",
			]);
			return ok("HOBO_CODE_AUTH", text, { cleared, text });
		}
		// status / whoami / default
		const st = authStatus(hoboHome);
		const text = panel(st.loggedIn ? "✓ auth" : "○ auth", [
			st.message,
			...(st.session
				? [
						`mode · ${st.session.mode}`,
						`station · ${st.session.stationId}`,
						`tenant · ${st.session.tenant}`,
						"sandbox · isolate/session (mediated)",
						"models · hobo-code models",
					]
				: ["next · hobo-code auth login"]),
		]);
		return ok("HOBO_CODE_AUTH", text, { auth: st, text });
	}

	if (verb === "status") {
		const panes = [
			createPane(
				"coord",
				platform.features.harnessEnabled ? "idle" : "blocked",
				platform.features.harnessEnabled
					? platform.provider.id === "flue"
						? "" // idle glyph = ready
						: platform.provider.id
					: "code.harness.enabled=false",
			),
			createPane(
				"station",
				platform.station.present ? "done" : "blocked",
				// Present happy path: empty summary (✓station glyph alone).
				platform.station.present
					? ""
					: (platform.station.remediation ?? "miss"),
			),
			createPane(
				"auth",
				authSession ? "done" : "idle",
				authSession
					? authSession.mode === "local"
						? ""
						: authSession.displayName
					: "login",
			),
		];
		const status = buildMultiplexerStatus(panes, {
			remoteReady: true,
			theme: "herdr",
		});
		const herdr = herdrMuxCapabilities(status.theme);
		const grokBuild = grokBuildParity();
		// Plain default: English hierarchy for GUI-native humans.
		// Dense opt-in: glyph box + Herdr/Grok footers (power chrome).
		const text = dense
			? `${renderStatusText(status)}\n${renderHerdrCapabilityFooter(herdr)}\n${renderGrokBuildFooter(grokBuild)}`
			: renderStatusText(status, { plain: true });
		const chip = renderStatusChip(status);
		// Human primary output is the chrome itself, not a one-line summary.
		return ok("HOBO_CODE_STATUS", text, {
			status,
			herdr,
			capabilities: herdr,
			grokBuild,
			text,
			chip,
			dense,
			platform,
			dogfood: dogfoodSummary(platform.station.stationId),
		});
	}

	if (verb === "tasks") {
		const surface = buildTasksSurface({
			hoboHome,
			...(typeof flags.run === "string" ? { runId: flags.run } : {}),
			panes: [
				createPane(
					"coord",
					platform.features.harnessEnabled ? "working" : "blocked",
					platform.features.harnessEnabled ? "dispatch" : "harness off",
				),
				createPane("worker", "idle", "standby"),
				createPane("watcher", "idle", "monitor"),
			],
		});
		const text = renderTasksBoardText(surface);
		return ok("HOBO_CODE_TASKS", text, {
			...surface,
			text,
			platform,
		});
	}

	if (verb === "guide") {
		const fromRaw =
			typeof flags.from === "string" ? flags.from.toLowerCase() : "";
		const wantCursor =
			flags.cursor === true ||
			fromRaw === "cursor" ||
			args.some((a) => a.toLowerCase() === "cursor");
		if (wantCursor) {
			const guide = cursorGuide();
			const text = renderCursorGuideText(guide);
			return ok("HOBO_CODE_GUIDE", text, {
				guide,
				cursor: guide,
				source: "cursor",
				text,
			});
		}
		const guide = claudeCodeGuide();
		const text = renderClaudeCodeGuideText(guide);
		return ok("HOBO_CODE_GUIDE", text, {
			guide,
			claudeCode: guide,
			source: "claude-code",
			text,
		});
	}

	if (verb === "machines") {
		const project = loadDevMachines(projectDir);
		const loaded = project.declared
			? project
			: loadDevMachines(join(dirname(fileURLToPath(import.meta.url)), ".."));
		const rows = loaded.declared
			? [
					...(loaded.machines.length > 0
						? loaded.machines.map(
								(m) =>
									`${m.id} · ${sshDestination(m)} · ${m.isolationClass}${m.agents && m.agents.length > 0 ? ` · ${m.agents.join(",")}` : ""}`,
							)
						: ["no machines declared"]),
					// Never silently drop a bad entry: an operator who wrote one
					// needs to know it is not in the reachable set.
					...loaded.rejected.map(
						(r) => `rejected · ${r.machine}: ${r.problem}`,
					),
					`file · ${loaded.path}`,
				]
			: [
					`no ${DEV_MACHINES_FILE} beside the devenv files`,
					"Declare machines there and panes can reach them; until then",
					"mux runs locally only.",
					`expected · ${loaded.path}`,
				];
		return ok("HOBO_CODE_MACHINES", panel("✓ machines", rows), {
			machines: loaded.machines,
			rejected: loaded.rejected,
			declared: loaded.declared,
			path: loaded.path,
		});
	}

	if (verb === "vshell") {
		// The pane entrypoint. It owns stdin for the life of the pane, so it
		// returns its own result rather than going through the panel path.
		const workspace =
			typeof flags.workspace === "string" && flags.workspace.length > 0
				? flags.workspace
				: projectDir;
		// `--agent` is a boolean flag elsewhere in this CLI, so the pane name
		// rides on `--name` rather than silently parsing as `true`.
		const agentId =
			typeof flags.name === "string" && flags.name.length > 0
				? flags.name
				: "agent";
		// createVirtualShell throws synchronously on a missing root, and this
		// verb awaits it directly — an unhandled rejection out of the CLI rather
		// than a HOBO_CODE_* result, reachable from the documented flag.
		try {
			await runVirtualPane({
				agentId,
				workspace,
				...(typeof flags.tier === "string" ? { tier: flags.tier } : {}),
				...(typeof flags.source === "string" ? { source: flags.source } : {}),
			});
		} catch (error) {
			return fail(
				"HOBO_CODE_VSHELL_FAILED",
				panel("✕ vshell", [
					error instanceof Error ? error.message : String(error),
					`workspace · ${workspace}`,
					// Only add the mount hint when the mount is what failed;
					// appending it to every error explains the wrong thing.
					...(/namespace/u.test(
						error instanceof Error ? error.message : String(error),
					)
						? []
						: [
								"A virtual pane mounts a real directory; that one could not be read.",
							]),
				]),
				["hobo-code vshell --help", "hobo-code mux --dry-run"],
				{ agentId, workspace },
			);
		}
		return ok("HOBO_CODE_VSHELL", "virtual pane closed", {
			agentId,
			workspace,
		});
	}

	if (verb === "mux") {
		const probes = defaultProbes(env);
		const agents = detectAgents(probes);
		// Agents work in the declared devenv workspace, not wherever the shell
		// happened to be standing.
		const workspace = findWorkspaceRoot(projectDir, env);
		const session =
			typeof flags.session === "string" && flags.session.length > 0
				? flags.session
				: "hobo";
		// Every agent is a target; local inference is not a special case, it is
		// just a target whose kind says where the work runs.
		// One virtual worktree per agent (rift by default) so parallel agents
		// cannot collide in a shared checkout.
		// A remote host has its own filesystem. Local workspace paths mean
		// nothing there, so allocating them would either send this machine's
		// absolute paths to a different one or waste the work outright; the
		// remote's own working directory is the honest answer.
		// `--host` names a *declared* machine, not an arbitrary ssh destination.
		// Resolving it through the registry is what makes the reachable set
		// reviewable; an unknown name is refused with the list of known ones
		// rather than handed to ssh to fail obscurely.
		// The project's own devenv declares its machines; hobo-code's package
		// root is the fallback so the harness can ship defaults for itself.
		const projectMachines = loadDevMachines(projectDir);
		const declaredMachines = projectMachines.declared
			? projectMachines
			: loadDevMachines(join(dirname(fileURLToPath(import.meta.url)), ".."));
		const requestedHost =
			typeof flags.host === "string" ? flags.host : undefined;
		if (flags.virtual === true && requestedHost) {
			// Before resolution and before brokering: a vshell command names a
			// local workspace path that does not exist on the remote, and
			// checking after the gateway ran would create and discard N sessions
			// plus N audit events for a combination that cannot work.
			return fail(
				"HOBO_CODE_MUX_VIRTUAL_REMOTE",
				panel("✕ mux", [
					"--virtual and --host cannot be combined yet.",
					"A virtual pane mounts a directory on this machine; the remote",
					"has its own filesystem, so the path would not resolve there.",
					"Run --virtual locally, or --host without it.",
				]),
				["hobo-code mux --virtual", `hobo-code mux --host ${requestedHost}`],
				{ requestedHost },
			);
		}
		const resolution = requestedHost
			? resolveMachine(declaredMachines.machines, requestedHost)
			: null;
		if (resolution !== null && "ambiguous" in resolution) {
			return fail(
				"HOBO_CODE_MUX_AMBIGUOUS_MACHINE",
				panel("✕ mux", [
					`"${requestedHost}" is the host of more than one declared machine.`,
					...resolution.ambiguous.map((m) => `  ${m.id} · ${m.isolationClass}`),
					"Name one by its id — choosing for you is how the wrong session",
					"gets brokered against the wrong isolation class.",
				]),
				["hobo-code machines"],
				{ requested: requestedHost, ambiguous: resolution.ambiguous },
			);
		}
		const resolvedMachine =
			resolution !== null && "machine" in resolution
				? resolution.machine
				: undefined;
		if (requestedHost && !resolvedMachine) {
			return fail(
				"HOBO_CODE_MUX_UNKNOWN_MACHINE",
				panel("✕ mux", [
					`"${requestedHost}" is not a declared dev machine.`,
					declaredMachines.declared
						? `known · ${declaredMachines.machines.map((m) => m.id).join(", ") || "none"}`
						: `no ${DEV_MACHINES_FILE} beside the devenv files — declare machines there first`,
					...(declaredMachines.rejected.length > 0
						? declaredMachines.rejected.map(
								(r) => `rejected · ${r.machine}: ${r.problem}`,
							)
						: []),
					"Panes reach only declared machines, so the set an agent can touch",
					"is reviewable, and each session is authorised and audited.",
				]),
				["hobo-code machines", "hobo-code mux --dry-run"],
				{ requested: requestedHost, declared: declaredMachines },
			);
		}
		const remoteHost = resolvedMachine
			? sshDestination(resolvedMachine)
			: undefined;

		// A machine may declare which agents it hosts; honouring that here is
		// what makes the field mean anything. An agent with nowhere to go is
		// named rather than silently placed on a machine that excluded it.
		const placeable = resolvedMachine
			? agents.filter(
					(a) => machinesForAgent([resolvedMachine], a.id).length > 0,
				)
			: agents;
		const excluded = resolvedMachine
			? agents.filter((a) => !placeable.some((p) => p.id === a.id))
			: [];
		if (resolvedMachine && placeable.length === 0) {
			return fail(
				"HOBO_CODE_MUX_NO_PLACEABLE_AGENTS",
				panel("✕ mux", [
					`${resolvedMachine.id} declares agents · ${(resolvedMachine.agents ?? []).join(", ")}`,
					`detected here · ${agents.map((a) => a.id).join(", ") || "none"}`,
					"No detected agent is allowed on that machine.",
				]),
				["hobo-code machines", "hobo-code agent"],
				{ machine: resolvedMachine, detected: agents.map((a) => a.id) },
			);
		}

		// Broker a Station session per remote pane. Doing this before tmux is
		// touched means a denial stops the session from opening at all, rather
		// than leaving panes sitting on a host they were not authorised for.
		let brokered: Awaited<ReturnType<typeof brokerPanes>> | undefined;
		let brokerAudit: readonly string[] = [];
		let resolvedIdentities: readonly ResolvedSshIdentity[] = [];
		if (resolvedMachine) {
			const gateway = await (deps.openStationGateway ?? openStationGateway)({
				hoboHome,
				stationId: platform.station.stationId,
				isolationClass: resolvedMachine.isolationClass,
			});
			try {
				brokered = await brokerPanes(
					placeable.map((a) => ({ machine: resolvedMachine, agentId: a.id })),
					{ broker: gateway.broker, subject: "hobo-code", ttlSeconds: 3600 },
				);
				if (brokered.panes.length > 0) {
					if (flags["dry-run"] === true) {
						resolvedIdentities = brokered.panes.map((pane) => ({
							pane: { ...pane, identityAgent: "<station-agent-socket>" },
							stop: async () => {},
						}));
					} else {
						const identities: ResolvedSshIdentity[] = [];
						try {
							for (const pane of brokered.panes) {
								identities.push(await gateway.handoffSshIdentity(pane));
							}
						} catch (error) {
							await Promise.all(identities.map((identity) => identity.stop()));
							throw error;
						}
						resolvedIdentities = identities;
					}
				}
				brokerAudit = gateway.auditTypes();
			} finally {
				await gateway.close();
			}
			if (brokered.panes.length === 0) {
				return fail(
					"HOBO_CODE_MUX_SESSION_DENIED",
					panel("✕ mux", [
						`the Station refused every session on ${resolvedMachine.id}.`,
						...brokered.failures
							.slice(0, 3)
							.map((f) => `${f.agentId} · ${f.reason}`),
						"Panes are not opened on a host the Station did not authorise;",
						"there is no fallback to an ambient key.",
					]),
					["hobo-code machines", "hobo-code auth"],
					{ machine: resolvedMachine, failures: brokered.failures },
				);
			}
		}
		const retainedIdentityAgents = new Set<string>();
		try {
			const allocation = await allocateAgentWorkspaces({
				workspaceRoot: workspace.path,
				agentIds: agents.map((a) => a.id),
				fallbackRoot: join(hoboHome, "workspaces"),
				env,
				shared: flags.shared === true || remoteHost !== undefined,
				...(remoteHost !== undefined && flags.shared !== true
					? {
							sharedReason: `--host ${remoteHost}: panes run on the remote, which has its own filesystem — local virtual worktrees would not exist there`,
						}
					: {}),
			});
			const workspaceFor = new Map(
				allocation.workspaces.map((w) => [w.agentId, w]),
			);
			// A virtualized pane runs the harness's own shell over a virtual
			// filesystem instead of the agent binary: the point is that the pane
			// cannot reach anything the allow-list does not name, which a real agent
			// process would immediately step outside of.
			const virtualPanes = flags.virtual === true;
			// Panes come from `placeable`, not `agents`. Filtering only the brokering
			// left every excluded agent with a pane on the machine that excluded it,
			// carrying no credentialRef — i.e. the ambient ~/.ssh key, no session, no
			// audit event. That was worse than before the placement filter existed.
			const targets: MuxTarget[] = placeable.map((a) => {
				const allocated = workspaceFor.get(a.id);
				return {
					name: a.id,
					kind: a.kind === "inference" ? "local-inference" : "local",
					command: virtualPanes
						? virtualPaneCommand(a.id, allocated?.path ?? workspace.path)
						: a.command,
					cwd: allocated?.path ?? workspace.path,
					// Namespace-mounted workspaces are unreachable by cd alone.
					...(allocated?.exec ? { exec: allocated.exec } : {}),
				} satisfies MuxTarget;
			});
			// A remote host turns the same targets into ssh panes — identical shape.
			const host = remoteHost;
			const brokeredFor = new Map(
				resolvedIdentities.map((identity) => [
					identity.pane.agentId,
					identity.pane,
				]),
			);
			const unbrokered = host
				? targets.filter((t) => !brokeredFor.has(t.name))
				: [];
			if (unbrokered.length > 0) {
				// Fail rather than open these panes. An ssh pane with no
				// credentialRef falls back to the ambient ~/.ssh key with no session
				// and no audit event, which is exactly the ungoverned path this
				// replaced — and it would do so silently.
				return fail(
					"HOBO_CODE_MUX_UNBROKERED_PANES",
					panel("✕ mux", [
						`${unbrokered.length} pane(s) have no Station session: ${unbrokered.map((t) => t.name).join(", ")}`,
						"Opening them would mean panes the Station never authorised, with",
						"no session recorded — the ungoverned path this replaced.",
						...(brokered?.failures ?? [])
							.slice(0, 3)
							.map((f) => `denied · ${f.agentId}: ${f.reason}`),
					]),
					["hobo-code machines", "hobo-code auth"],
					{ unbrokered: unbrokered.map((t) => t.name) },
				);
			}
			const remoteTargets: MuxTarget[] = host
				? targets.map(({ cwd: _local, exec: _wrapper, ...t }): MuxTarget => {
						// Non-null by the guard above: every ssh pane carries a session.
						const pane = brokeredFor.get(t.name);
						if (!pane)
							throw new Error(`missing Station identity for pane ${t.name}`);
						return {
							...t,
							kind: "ssh",
							host,
							identityAgent: pane.identityAgent,
							expiresAt: pane.expiresAt,
						};
					})
				: targets;
			const plan = planMux(session, remoteTargets);
			if (agents.length === 0) {
				return fail(
					"HOBO_CODE_MUX_NO_AGENTS",
					panel("✕ mux", [
						"no agents detected on this machine",
						"install one (claude, codex, cursor-agent, opencode, …) or run hobo-code alone",
					]),
					["hobo-code agent", "hobo-code config"],
					{ agents, plan },
				);
			}
			const applied =
				flags["dry-run"] === true
					? {
							ok: true,
							session: plan.session,
							created: plan.targets.map((t) => t.name),
							existed: false,
							detail: "dry run — no tmux invoked",
						}
					: await applyMux(plan, deps.muxRunner ?? tmuxRunner());
			const created = new Set(applied.created);
			if (flags["dry-run"] !== true) {
				for (const identity of resolvedIdentities) {
					if (created.has(safeWindowName(identity.pane.agentId))) {
						retainedIdentityAgents.add(identity.pane.agentId);
					}
				}
			}
			const text = panel(applied.ok ? "✓ mux" : "✕ mux", [
				applied.detail,
				`workspace · ${workspace.path} (${workspace.source})`,
				`trees · ${allocation.backend}${allocation.reason ? ` — ${allocation.reason}` : ""}`,
				...(excluded.length > 0
					? [
							`excluded · ${excluded.map((a) => a.id).join(", ")} (not declared for ${resolvedMachine?.id})`,
						]
					: []),
				...(brokered
					? [
							`sessions · ${brokered.panes.length} brokered by the Station (${brokerAudit.filter((t) => t === "pam.SessionStarted").length} started)`,
							...brokered.panes.slice(0, 3).map((p) => `  ${describePane(p)}`),
							...brokered.failures.map(
								(f) => `  denied · ${f.agentId}: ${f.reason}`,
							),
						]
					: []),
				...(virtualPanes
					? [
							`shell · virtual (${VIRTUAL_PANE_COMMANDS} commands, no network, no execve)`,
						]
					: []),
				...placeable.map(
					(a) =>
						`  ${a.id} · ${workspaceFor.get(a.id)?.path ?? workspace.path}`,
				),
				`join · ${attachCommand(plan.session, host)}`,
			]);
			return applied.ok
				? ok("HOBO_CODE_MUX", text, {
						session: plan.session,
						agents,
						plan,
						applied,
					})
				: fail(
						"HOBO_CODE_MUX_FAILED",
						text,
						["tmux -V", "hobo-code mux --dry-run"],
						{
							agents,
							plan,
							applied,
						},
					);
		} finally {
			await Promise.all(
				resolvedIdentities
					.filter(
						(identity) => !retainedIdentityAgents.has(identity.pane.agentId),
					)
					.map((identity) => identity.stop()),
			);
		}
	}

	if (verb === "attach") {
		// Dev-terminal attach (tmux/mosh/Tailscale-shaped) — not control-plane remote admin.
		const modeFlag =
			typeof flags.mode === "string" ? flags.mode.toLowerCase() : "local";
		const mode: CodeRemoteMode =
			modeFlag === "overlay" ||
			modeFlag === "tailscale" ||
			modeFlag === "tailnet"
				? "overlay"
				: "local";
		const surface = describeDevTerminalAttach({
			mode,
			...(tenant !== "local" ? { tenant, project: "mux" } : {}),
			stationId: platform.station.stationId,
		});
		const reg = surface.registration;
		const hostShort = shortNamedHost(reg.host);
		const remoteStation = shortStation(platform.station.stationId);
		const urlExtra =
			reg.url === `https://${reg.host}` || reg.url === `http://${reg.host}`
				? null
				: reg.url;
		const text = panel("◎ attach", [
			[hostShort, surface.legend].join(" · "),
			...(urlExtra !== null ? [`url · ${urlExtra}`] : []),
			...(reg.mode === "local" ? [] : [`mode · ● overlay`]),
			...(remoteStation === "local" ? [] : [`station · ${remoteStation}`]),
			"reattach · hobo-code attach | session",
			reg.mode === "overlay"
				? "mosh · optional on lossy link"
				: "local · no Tailscale required",
			"next · hobo-code session",
		]);
		return ok("HOBO_CODE_ATTACH", text, {
			...surface,
			stationId: platform.station.stationId,
			text,
		});
	}

	if (verb === "env") {
		// Nix-terminal parity: inspect hermetic shell + durable layout without activating Nix.
		const summary = hermeticEnvSummary(hermetic);
		const markerBit =
			hermetic.markers.length > 0
				? hermetic.markers.slice(0, 3).join("+")
				: "none";
		const homeDisplay = displayPath(hoboHome, { hoboHome, cwd: projectDir });
		const durableDisplay = displayPath(hermetic.layout.durable, {
			hoboHome,
			cwd: projectDir,
		});
		// Always surface durable path (nix purity analog): declared shells need it too.
		const envText = panel("▣ ev", [
			summary,
			`markers · ${markerBit}`,
			`home · ${homeDisplay}`,
			`durable · ${durableDisplay}`,
			...(hermetic.hermeticActive
				? []
				: hermetic.hermeticDeclared
					? ["enter · devenv shell|direnv allow|nix develop"]
					: ["optional · devenv.nix (never required)"]),
		]);
		// hobo-code declares its own environment with devenv; report whether the
		// toolchain to enter it is actually installed rather than assuming.
		const ownDevenv = inspectDevenv(
			// dist/cli.js -> package root (devenv.nix lives beside package.json)
			join(dirname(fileURLToPath(import.meta.url)), ".."),
			defaultDevenvProbes(env),
		);
		const withDevenv = `${envText}\n${devenvSummary(ownDevenv)}`;
		return ok("HOBO_CODE_ENV", withDevenv, {
			hermetic,
			devenv: ownDevenv,
			text: withDevenv,
			policy:
				"Optional hermetic shell for hobo-code only; durable state under HOBO_HOME outside sandboxes; Nix not monorepo IaC.",
		});
	}

	if (verb === "dev") {
		const port = Number(flags.port ?? 4173);
		const debugPort = Number(flags["debug-port"] ?? 4174);
		if (
			![port, debugPort].every(
				(value) => Number.isInteger(value) && value >= 0 && value <= 65_535,
			)
		) {
			return fail(
				"HOBO_CODE_DEV_USAGE",
				panel("✕ dev", ["ports must be integers from 0 through 65535"]),
				["hobo-code dev --help"],
			);
		}
		let session: Awaited<ReturnType<typeof startDevBrowserSession>> | undefined;
		try {
			session = await startDevBrowserSession({
				projectDir,
				hoboHome,
				appPort: port,
				debugPort,
			});
			const deployed = session;
			const [appProbe, debugProbe, controlsProbe] = await Promise.all([
				fetch(deployed.appUrl),
				fetch(deployed.debugUrl),
				fetch(deployed.controlsUrl),
			]);
			const probes = [appProbe, debugProbe, controlsProbe];
			if (probes.some((probe) => !probe.ok)) {
				throw new Error(
					`browser deployment probe failed (${probes.map((probe) => probe.status).join("/")})`,
				);
			}
			const once = flags.once === true;
			if (once) {
				await deployed.close();
				session = undefined;
			} else {
				const stop = (exitCode: number): void => {
					process.exitCode = exitCode;
					void deployed.close();
				};
				process.once("SIGINT", () => stop(130));
				process.once("SIGTERM", () => stop(143));
			}
			const text = panel("◎ dev", [
				`browser · ${deployed.debugUrl}`,
				`app · ${deployed.appUrl}`,
				`evidence · ${displayPath(deployed.evidencePath, { hoboHome, cwd: projectDir })}`,
				...(once ? ["probe · passed; stopped"] : ["live · Ctrl-C to stop"]),
			]);
			return ok("HOBO_CODE_DEV", text, {
				deployment: {
					mode: "local-browser",
					deploymentId: deployed.sessionId,
					sessionId: deployed.sessionId,
					appUrl: deployed.appUrl,
					debugUrl: deployed.debugUrl,
					controlsUrl: deployed.controlsUrl,
					reportUrl: deployed.reportUrl,
					evidencePath: deployed.evidencePath,
					served: {
						appStatus: appProbe.status,
						debugStatus: debugProbe.status,
						controlsStatus: controlsProbe.status,
					},
					stopped: once,
				},
				text,
			});
		} catch (error) {
			await session?.close().catch(() => {});
			return fail(
				"HOBO_CODE_DEV_FAILED",
				panel("✕ dev", [
					error instanceof Error ? error.message : String(error),
				]),
				[
					"ensure public/index.html exists",
					"choose free ports with --port and --debug-port",
				],
			);
		}
	}

	if (verb === "scaffold") {
		const name =
			args[0] || (typeof flags.name === "string" && flags.name) || "app";
		const out =
			(typeof flags.out === "string" && flags.out) || join(projectDir, name);
		const result = scaffoldHighValueTemplate({
			outputDir: out,
			appName: name,
		});
		const hasFirstPaint = result.files.includes("public/index.html");
		const hasCss = result.files.includes("public/styles.css");
		const outDisplay = displayPath(result.outputDir, {
			hoboHome,
			cwd: projectDir,
		});
		const tmpl =
			result.templateId === "openui-astryx-bindle" ? "ou" : result.templateId;
		// Short pin: flag key tail; omit feature twin when stem matches.
		// visual.primary → primary (domain stem already "openui" on left).
		const flagTail = result.openFeatureFlag
			.replace(/^app\./, "")
			.replace(/^visual\./, "");
		const featureTail = result.gherkinFeature
			.replace(/^features\//, "")
			.replace(/\.feature$/, "")
			.replace(/^visual$/, "primary");
		// primary is the happy-path visual pin — ultra-short.
		const pinRaw =
			flagTail === featureTail ||
			flagTail.startsWith(featureTail) ||
			featureTail.startsWith(flagTail.split(".")[0] ?? "")
				? flagTail
				: `${flagTail} · ${featureTail}`;
		const pin = pinRaw === "primary" ? "p" : pinRaw;
		// ●paint is happy-path default (index+css) — omit; only show when incomplete.
		const assetsBit =
			hasFirstPaint && hasCss
				? null
				: `${hasFirstPaint ? "●" : "○"}index · ${hasCss ? "●" : "○"}css`;
		// Happy-path out is ./name or name under cwd — omit twin.
		const outBit =
			outDisplay === name ||
			outDisplay === `./${name}` ||
			outDisplay === name.replace(/\/$/, "")
				? null
				: outDisplay;
		// Name short for scan; full name in data payload.
		const nameBit = shortId(name, 10);
		const text = panel("✦ sc", [
			// One scan line: template · name · files · pin
			// ★ dispatch is product default next — omit twin
			[
				tmpl,
				nameBit,
				...(outBit !== null ? [shortId(outBit, 12)] : []),
				`${result.files.length}f`,
				...(assetsBit !== null ? [assetsBit] : []),
				pin,
			].join("·"),
		]);
		return ok("HOBO_CODE_SCAFFOLD", text, {
			result,
			stationId: platform.station.stationId,
			text,
		});
	}

	if (verb === "isolate") {
		if (!platform.features.harnessEnabled) {
			return fail(
				"HOBO_CODE_HARNESS_DISABLED",
				panel("✕ isolate", [
					"harness disabled (code.harness.enabled)",
					"enable flag or unset override, then retry",
				]),
				[
					"check OpenFeature / HOBO feature overrides for code.harness.enabled",
					"hobo-code platform --json",
					"hobo-code help",
				],
			);
		}
		const runId = args[0] ?? `run-${Date.now()}`;
		const ctx = await createIsolationContext({
			projectRoot: projectDir,
			hoboHome,
			runId,
			forceWorktree: !platform.features.riftPreferred,
			stationId: platform.station.stationId,
		});
		const backendGlyph = ctx.backend.kind === "rift" ? "◆ rift" : "◇ worktree";
		// Active run is expected under sandboxes/; only other roots are leftovers.
		const orphanCount = listSandboxOrphans(hoboHome).filter(
			(p) => !p.endsWith(`/${ctx.runId}`) && !p.endsWith(`\\${ctx.runId}`),
		).length;
		const rootDisplay = displayPath(ctx.rootPath, {
			hoboHome,
			cwd: projectDir,
		});
		const isoStation = shortStation(
			ctx.stationId ?? platform.station.stationId,
		);
		const branchLabel = shortBranch(ctx.branch);
		// Default root is $HOBO_HOME/sandboxes/<runId> — omit twin on happy path.
		const defaultRoot =
			rootDisplay === `$HOBO_HOME/sandboxes/${ctx.runId}` ||
			rootDisplay.endsWith(`/sandboxes/${ctx.runId}`);
		// run-<ms> → short tail; keep explicit ids.
		const runBit = shortId(ctx.runId, 14);
		const durableDisplay = displayPath(ctx.durableRoot, {
			hoboHome,
			cwd: projectDir,
		});
		// Nix-terminal parity: human chrome must show pure sandbox≠durable split.
		// Next step spelled out (DX): promote the run id after isolation.
		const isolateText = panel("▣ isolate", [
			// Omit worktree happy-path noise.
			...(ctx.backend.kind === "worktree" ? [] : [`backend · ${backendGlyph}`]),
			// Branch only when it differs from run id (code/<run> → run is default).
			...(branchLabel === ctx.runId ||
			branchLabel === shortId(ctx.runId, 28) ||
			branchLabel === runBit
				? []
				: [`branch · ${branchLabel}`]),
			[
				// Title brands isolate — run id bare (no run · twin).
				runBit,
				...(defaultRoot ? [] : [rootDisplay]),
				...(orphanCount > 0 ? [`▲${orphanCount} orphan`] : []),
				"●",
			].join("·"),
			`durable · ${durableDisplay}`,
			`next · hobo-code promote ${ctx.runId}`,
			...(isoStation === "local" ? [] : [`station · ${isoStation}`]),
		]);
		return ok("HOBO_CODE_ISOLATE", isolateText, {
			isolation: ctx,
			platform,
			orphans: orphanCount,
			hermetic,
			durableRoot: ctx.durableRoot,
			layout: {
				sandbox: ctx.rootPath,
				durable: ctx.durableRoot,
				pureSeparation: true as const,
			},
			next: `hobo-code promote ${ctx.runId}`,
			text: isolateText,
		});
	}

	if (verb === "promote") {
		const runId =
			args[0] || (typeof flags.run === "string" ? flags.run : undefined);
		if (!runId) {
			return fail(
				"HOBO_CODE_USAGE",
				panel("✕ promote", [
					"missing run id",
					"usage · hobo-code promote <runId>",
					"or · hobo-code promote --run <runId>",
					"first · hobo-code isolate <runId>",
				]),
				[
					"hobo-code isolate my-run",
					"hobo-code promote my-run",
					"hobo-code help",
				],
			);
		}
		// Gates must be *run*, not asserted. These were hardcoded `pass: true`,
		// which made "gated, audited" decoration over a literal — the promote
		// path claimed a guarantee nothing was checking.
		const gates: PromotionGate[] = await runProjectGates(projectDir);
		const isolationRoot = join(hoboHome, "sandboxes", runId);
		const result = await promoteIsolation(
			{
				runId,
				isolationRoot,
				targetProject: projectDir,
				gateResults: gates.map((g) => g.name),
				squashOnly: true,
			},
			{ hoboHome, gates },
		);
		const glyph = result.ok ? "✓" : "✕";
		const passed = gates.filter((g) => g.pass).length;
		const allPass = passed === gates.length;
		const shortGate = (name: string) => {
			const base = name.replace(/:.*$/, "");
			if (base === "architecture") return "arch";
			if (base === "standards") return "std";
			return base;
		};
		// All-pass: ●N alone (names live in data payload). Partial keeps fraction.
		const gatesCompact = allPass
			? `●${passed}`
			: `${passed}/${gates.length} pass`;
		const promoStation = shortStation(platform.station.stationId);
		const missingRun = result.code === "HOBO_CODE_PROMOTE_MISSING_RUN";
		const promoteText = panel(`${glyph} promote`, [
			// Code only on fail — success title already carries ✓.
			...(result.ok ? [] : [`code · ${result.code}`]),
			result.ok
				? `${runId}·${result.cleaned ? "●" : "○"}clean·${gatesCompact}`
				: missingRun
					? `no sandbox · ${runId}`
					: `${runId}·${result.cleaned ? "●" : "○"}clean`,
			...(promoStation === "local" ? [] : [`station · ${promoStation}`]),
			...(result.ok
				? ["next · hobo-code status"]
				: missingRun
					? [
							"usage · hobo-code isolate <runId>",
							"then · hobo-code promote <runId>",
						]
					: [
							`gates · ${gatesCompact}`,
							...gates.map(
								(g) =>
									`  ${g.pass ? "✓" : "✕"} ${shortGate(g.name).padEnd(12)} ${g.detail}`,
							),
							`summary · ${result.message}`,
							"next · hobo-code isolate <runId>",
						]),
		]);
		return {
			ok: result.ok,
			status: result.ok ? "ok" : "failed",
			code: result.code,
			message: promoteText,
			...(result.ok
				? {}
				: {
						remediation: missingRun
							? [
									`hobo-code isolate ${runId}`,
									`hobo-code promote ${runId}`,
									"hobo-code help",
								]
							: [
									"fix failing gates, then re-run promote",
									`hobo-code isolate ${runId}`,
									"hobo-code help",
								],
					}),
			data: {
				result,
				stationId: platform.station.stationId,
				text: promoteText,
				isolationRoot,
			},
			exitCode: result.ok ? 0 : 1,
		};
	}

	if (verb === "session") {
		if (!platform.features.harnessEnabled) {
			return fail(
				"HOBO_CODE_HARNESS_DISABLED",
				panel("✕ session", [
					"harness disabled (code.harness.enabled)",
					"enable flag or unset override, then retry",
				]),
				[
					"check OpenFeature / HOBO feature overrides for code.harness.enabled",
					"hobo-code platform --json",
					"hobo-code help",
				],
			);
		}
		if (args.length > 0) {
			try {
				const requestedHost =
					args[0] === "serve" && typeof flags.host === "string"
						? flags.host
						: undefined;
				const requestedPort =
					args[0] === "serve" && typeof flags.port === "string"
						? flags.port
						: undefined;
				if (requestedHost && requestedPort === undefined) {
					return fail(
						"HOBO_CODE_SESSION_REMOTE_PORT_REQUIRED",
						panel("✕ session", [
							"remote session serving requires a fixed --port",
							"the same loopback port is used on both sides of the SSH forward",
						]),
						[`hobo-code session serve --host ${requestedHost} --port 4242`],
					);
				}
				const servePort =
					requestedPort !== undefined && /^\d+$/u.test(requestedPort)
						? Number.parseInt(requestedPort, 10)
						: undefined;
				if (
					requestedPort !== undefined &&
					(servePort === undefined || servePort < 1 || servePort > 65_535)
				) {
					return fail(
						"HOBO_CODE_SESSION_INVALID_PORT",
						panel("✕ session", [
							"--port must be an integer from 1 through 65535",
						]),
						["hobo-code session serve --port 4242"],
					);
				}

				let remoteServe: RemoteSessionServe | undefined;
				if (requestedHost && servePort !== undefined) {
					const projectMachines = loadDevMachines(projectDir);
					const declaredMachines = projectMachines.declared
						? projectMachines
						: loadDevMachines(
								join(dirname(fileURLToPath(import.meta.url)), ".."),
							);
					const resolution = resolveMachine(
						declaredMachines.machines,
						requestedHost,
					);
					if (resolution !== null && "ambiguous" in resolution) {
						return fail(
							"HOBO_CODE_SESSION_AMBIGUOUS_MACHINE",
							panel("✕ session", [
								`"${requestedHost}" is the host of more than one declared machine.`,
								...resolution.ambiguous.map(
									(m) => `  ${m.id} · ${m.isolationClass}`,
								),
								"name one by its declared id",
							]),
							["hobo-code machines"],
						);
					}
					const machine =
						resolution !== null && "machine" in resolution
							? resolution.machine
							: undefined;
					if (!machine) {
						return fail(
							"HOBO_CODE_SESSION_UNKNOWN_MACHINE",
							panel("✕ session", [
								`"${requestedHost}" is not a declared dev machine.`,
								declaredMachines.declared
									? `known · ${declaredMachines.machines.map((m) => m.id).join(", ") || "none"}`
									: `no ${DEV_MACHINES_FILE} beside the devenv files`,
								"remote browsers have no fallback to arbitrary SSH hosts",
							]),
							["hobo-code machines"],
						);
					}

					const gateway = await (deps.openStationGateway ?? openStationGateway)(
						{
							hoboHome,
							stationId: platform.station.stationId,
							isolationClass: machine.isolationClass,
						},
					);
					let outcome: Awaited<ReturnType<typeof brokerPaneSession>>;
					outcome = await brokerPaneSession(machine, "resident-browser", {
						broker: gateway.broker,
						subject: "hobo-code",
						ttlSeconds: 3600,
					});
					const auditTypes = gateway.auditTypes();
					if (!outcome.ok) {
						await gateway.close();
						return fail(
							"HOBO_CODE_SESSION_REMOTE_DENIED",
							panel("✕ session", [
								`the Station refused browser access to ${machine.id}`,
								outcome.failure.reason,
								"SSH forwarding was not opened; there is no fallback",
							]),
							["hobo-code machines", "hobo-code auth"],
						);
					}
					if (!auditTypes.includes("pam.SessionStarted")) {
						await gateway.close();
						return fail(
							"HOBO_CODE_SESSION_REMOTE_AUDIT_MISSING",
							panel("✕ session", [
								`the Station authorized ${machine.id} without a start audit event`,
								"SSH forwarding was not opened",
							]),
							["hobo-code auth status"],
						);
					}
					let identity: ResolvedSshIdentity;
					try {
						identity = await gateway.resolveSshIdentity(outcome.pane);
					} catch (error) {
						await gateway.close();
						return fail(
							"HOBO_CODE_SESSION_REMOTE_IDENTITY_UNAVAILABLE",
							panel("✕ session", [
								error instanceof Error ? error.message : String(error),
								"SSH forwarding was not opened; there is no ambient-key fallback",
							]),
							["ssh-add -l", "hobo-code auth status"],
						);
					}
					remoteServe = {
						machine,
						port: servePort,
						authorizationSessionId: outcome.pane.sessionId,
						authorizationExpiresAt: outcome.pane.expiresAt,
						auditTypes,
						identityAgent: identity.pane.identityAgent,
						closeAuthorization: gateway.close,
					};
				}
				const resident = await runResidentSessionCli({
					args,
					hoboHome,
					projectDir,
					approved: flags.approve === true,
					...(servePort !== undefined ? { servePort } : {}),
					...(remoteServe !== undefined ? { remoteServe } : {}),
				});
				if (resident) {
					return ok(
						"HOBO_CODE_RESIDENT_SESSION",
						panel("✓ session", resident.message.split("\n")),
						resident.data,
					);
				}
			} catch (error) {
				return fail(
					"HOBO_CODE_SESSION_FAILED",
					panel("✕ session", [
						error instanceof Error ? error.message : String(error),
					]),
					["hobo-code session --help", "hobo-code session list"],
				);
			}
		}
		const sessionHome =
			env.HOBO_CODE_EPHEMERAL_SESSION === "1"
				? mkdtempSync(join(tmpdir(), "hobo-code-session-"))
				: hoboHome;
		const session = await startCodeSession({
			projectRoot: projectDir,
			hoboHome: sessionHome,
			stationId: platform.station.stationId,
			features,
			tenant,
			autoInitStation: true,
		});
		// Simulate in-session work, then resolve handback before painting mux.
		session.setAgentState("worker", "working", session.platform.provider.id);
		const keepOpen = env.HOBO_CODE_SESSION_KEEP === "1";
		const handback = keepOpen
			? {
					runId: session.isolation.runId,
					ok: true,
					branch: session.isolation.branch,
					gates: [] as string[],
					isolationStatus: "open" as const,
					orphans: [] as string[],
					message: "session kept open",
				}
			: await session.complete(true, [
					"session:demo",
					`station:${session.platform.station.stationId}`,
					`provider:${session.platform.provider.id}`,
				]);
		// Final mux snapshot must match handback outcome (not stale "working").
		if (keepOpen) {
			// Omit flue happy-path provider noise from pane summaries.
			const provider = session.platform.provider.id;
			const openSummary = provider === "flue" ? "" : provider;
			const workSummary = provider === "flue" ? "" : provider;
			// working glyph alone on flue; provider only when non-default
			session.setAgentState("coordinator", "working", openSummary);
			session.setAgentState("worker", "working", workSummary);
		} else if (handback.ok) {
			session.setAgentState("coordinator", "done", "");
			session.setAgentState("worker", "done", "");
		} else {
			session.setAgentState("coordinator", "blocked", "fail");
			session.setAgentState("worker", "blocked", "fix");
		}
		const status = session.status();
		if (env.HOBO_CODE_EPHEMERAL_SESSION === "1") {
			await cleanupIsolation(session.isolation.runId, {
				hoboHome: sessionHome,
				ok: true,
			});
		}
		// Snapshot kind only when not implied by handback LED (●open=live, ●clean=final).
		const snapshotKind = keepOpen ? null : handback.ok ? null : "failed";
		const backendGlyph =
			session.isolation.backend.kind === "rift" ? "◆ rift" : "◇ worktree";
		// Strip run- prefix; short tail for title.
		const runLabel = shortId(session.isolation.runId.replace(/^run-/, ""), 6);
		const sessionStation = shortStation(session.platform.station.stationId);
		const sessionProvider = session.platform.provider.id;
		// Clean final: st is product default observe — omit next twin.
		// Open/fail: ·pr promote (run already on title).
		const sessionNext = handback.ok && !keepOpen ? null : "pr";
		// Handback LED: ● alone = clean final; ●o = open live; fail keeps text.
		const handbackBit = keepOpen
			? "●o"
			: handback.ok
				? "●"
				: handback.isolationStatus === "cleaned"
					? "●·fail"
					: `${handback.isolationStatus}`;
		const extras = [
			session.isolation.backend.kind === "worktree" ? null : backendGlyph,
			sessionStation === "local" ? null : sessionStation,
			sessionProvider === "flue" ? null : sessionProvider,
		]
			.filter((x): x is string => x !== null && x.length > 0)
			.join("·");
		const orphanBit =
			handback.orphans.length === 0 ? "" : `·▲${handback.orphans.length}`;
		// LED implies snapshot kind — only emit failed explicitly.
		const snapBit = snapshotKind !== null ? `·${snapshotKind}` : "";
		const nextBit = sessionNext !== null ? `·${sessionNext}` : "";
		// Brand se only (hobo-code lives on status chip / other verbs).
		const sessionTitle = `${handback.ok ? "✓" : "✕"} se·${runLabel}·${handbackBit}${extras ? `·${extras}` : ""}${orphanBit}${snapBit}${nextBit}`;
		const chrome = renderStatusText(status, {
			embedded: true,
			title: sessionTitle,
		});
		// Keep dense session box ≤4 lines; Herdr caps + durable path live in --json / --help.
		const sessionText = chrome;
		const herdr = herdrMuxCapabilities(status.theme);
		const durableRoot = session.isolation.durableRoot;
		const persistence = {
			durableRoot,
			handbackArtifact: "session-end.json",
			handbackPath: join(durableRoot, "session-end.json"),
			detachable: true as const,
			sessionPersistence: true as const,
		};
		return {
			ok: handback.ok,
			status: handback.ok ? "ok" : "failed",
			code: handback.ok ? "HOBO_CODE_SESSION" : "HOBO_CODE_SESSION_FAILED",
			message: sessionText,
			data: {
				isolation: session.isolation,
				status,
				herdr,
				capabilities: herdr,
				persistence,
				remote: session.remote,
				platform: session.platform,
				handback,
				mcp: session.harness.exposeMcp(),
				text: sessionText,
			},
			exitCode: handback.ok ? 0 : 1,
		};
	}

	// ── Multi-node compute (capacity-aware dispatch; not a chat/hive product) ──

	if (!platform.features.distributed && verb === "dispatch") {
		return fail(
			"HOBO_CODE_DISTRIBUTED_DISABLED",
			panel("✕ distributed", [
				"dispatch requires code.distributed",
				"enable distributed flag, then retry",
			]),
			["enable code.distributed feature flag", "hobo-code help"],
		);
	}

	// dispatch (default)
	const emptyPrompt = args.length === 0;
	if (emptyPrompt && !process.stdin.isTTY) {
		return fail(
			"HOBO_CODE_INTERACTIVE_REQUIRED",
			panel("✕ input", [
				"bare hobo-code needs a TTY; no prompt was provided",
				"use hobo-code help or provide a prompt",
			]),
			["hobo-code help", 'hobo-code "describe the change"'],
			{ interactiveRequired: true },
		);
	}
	const prompt = emptyPrompt
		? "refine scaffold under ponytail pressure"
		: args.join(" ");
	const result = await dispatchComputeTask({
		hoboHome,
		poolId,
		prompt,
		projectRoot: projectDir,
		executeLocal: true,
		stationId: platform.station.stationId,
	});
	const dispatched =
		result.task.status === "done" || result.task.status === "dispatched";
	const text = renderDispatchSummary({
		taskId: result.task.taskId,
		status: result.task.status,
		...(result.task.nodeId !== undefined ? { nodeId: result.task.nodeId } : {}),
		prompt,
		poolId,
		defaultVerb: defaultedVerb,
		emptyPrompt,
		dense,
		// Point at the record itself: "recorded a task" is only checkable if
		// the reply says where it landed.
		taskPath: computeTaskPath(hoboHome, poolId, result.task.taskId),
	});
	return {
		ok: dispatched,
		status: result.task.status === "failed" ? "failed" : "ok",
		code: dispatched ? "HOBO_CODE_DISPATCH" : "HOBO_CODE_DISPATCH_FAILED",
		message: text,
		data: {
			task: result.task,
			pool: result.pool,
			defaultVerb: defaultedVerb,
			emptyPrompt,
			text,
			distributed: describeDistributedCompute(),
		},
		exitCode: dispatched ? 0 : 1,
	};
}

function shortHash(hash?: string): string {
	if (!hash) return "bootstrap";
	const bare = hash.replace(/^sha256:/, "");
	return bare.length > 4 ? `${bare.slice(0, 4)}…` : bare;
}

/** Presentation: station:local → local; keep other ids scannable. */
function shortStation(id: string): string {
	if (id === "station:local" || id.endsWith(":local")) return "local";
	return shortId(id.replace(/^station:/, ""), 22);
}

/** Presentation: room-main → main. */
function shortRoom(id: string): string {
	if (id === "room-main" || id === "main") return "main";
	return shortId(id.replace(/^room-/, ""), 22);
}

/** Presentation: code/<run> → <run> when code/ prefix. */
function shortBranch(branch: string): string {
	if (branch.startsWith("code/")) return branch.slice("code/".length);
	return shortId(branch, 28);
}

/** Prefer scannable path: $HOBO_HOME…, relative to cwd, else short tail. */
function displayPath(
	path: string,
	opts: { readonly hoboHome?: string; readonly cwd?: string } = {},
): string {
	const home = opts.hoboHome;
	if (home && (path === home || path.startsWith(`${home}/`))) {
		return `$HOBO_HOME${path.slice(home.length)}`;
	}
	const cwd = opts.cwd;
	if (cwd && (path === cwd || path.startsWith(`${cwd}/`))) {
		const rel = path.slice(cwd.length).replace(/^\//, "");
		return rel.length > 0 ? `./${rel}` : ".";
	}
	// Outside cwd/home: keep last two segments only (scan-friendly).
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	if (parts.length >= 2) {
		return `…/${parts.slice(-2).join("/")}`;
	}
	return shortId(path, 28);
}

function shortId(id: string, max = 22): string {
	if (id.length <= max) return id;
	return `${id.slice(0, Math.max(1, max - 1))}…`;
}

/** Who-fold label: strip worker- noise, then shortId. */
function shortWho(name: string, max = 6): string {
	const cleaned = name.replace(/^worker-/, "").replace(/^human:/, "");
	return shortId(cleaned.length > 0 ? cleaned : name, max);
}

/** Strip package-path noise from provider hints for scan-friendly chrome. */
function shortProviderLabel(hint: string, max = 28): string {
	const cleaned = hint
		.replace(/\s*\(composition\)\s*$/i, "")
		.replace(/^withastro\//, "")
		.replace(/^@hobo\//, "")
		.trim();
	return shortId(cleaned.length > 0 ? cleaned : hint, max);
}

/**
 * Provider row: id alone when package collapses to the same token;
 * otherwise `id · package` (no composition / org path noise).
 */
function formatProviderLine(id: string, packageHint: string, max = 28): string {
	const pkg = shortProviderLabel(packageHint, max);
	if (pkg === id || pkg.length === 0) return id;
	// package is a thin alias of id (e.g. "flue" vs "flue-harness") — keep when distinct
	return `${id} · ${pkg}`;
}

/** Distinguishing node tail (class already shown in inventory). */
function shortNodeTail(nodeId: string): string {
	if (nodeId.includes("local")) {
		const rest = nodeId.replace(/^node-local-?/, "").replace(/^station-?/, "");
		if (rest === "" || rest === "local" || rest === "station-local") {
			return "station";
		}
		return shortId(rest, 14);
	}
	if (nodeId.includes("endpoint") || nodeId.includes("remote")) {
		const rest = nodeId.replace(/^node-endpoint-?/, "");
		if (rest === "" || rest === "remote") return "remote";
		return shortId(rest, 14);
	}
	return shortId(nodeId, 16);
}

/** Prefer class-aware node labels for dispatch scan (local / endpoint / …). */
function shortNodeLabel(nodeId: string): string {
	if (nodeId.includes("local")) {
		return `local · ${shortNodeTail(nodeId)}`;
	}
	if (nodeId.includes("endpoint") || nodeId.includes("remote")) {
		return `endpoint · ${shortNodeTail(nodeId)}`;
	}
	return shortId(nodeId, 22);
}

/**
 * What actually happened, in words.
 *
 * The dense form reads `✓ ★ / hello·st` — a status glyph, eight characters of
 * the user's own prompt echoed back, and a two-letter pointer at another
 * command. It says nothing about what `dispatch` did, and "✓" reads as "your
 * request was carried out" when what happened is that a compute task was
 * recorded. Help promises plain by default; this is that default.
 */
function renderDispatchPlain(input: {
	readonly taskId: string;
	readonly status: string;
	readonly nodeId?: string;
	readonly prompt: string;
	readonly poolId: string;
	readonly defaultVerb: boolean;
	readonly emptyPrompt?: boolean;
	readonly taskPath?: string;
}): string {
	const done = input.status === "done";
	const failed = input.status === "failed";
	const title = failed
		? "✕ dispatch failed"
		: done
			? "✓ dispatch recorded"
			: "· dispatch queued";
	const rows: string[] = [];
	rows.push(
		failed
			? "The compute task could not be recorded."
			: done
				? "Recorded a compute task. No agent has run it yet — dispatch queues work, it does not edit your project."
				: "Queued a compute task; it has not been claimed yet.",
	);
	if (input.emptyPrompt) {
		rows.push("No prompt was given, so the task carries an empty request.");
	}
	rows.push(`task · ${input.taskId}`);
	if (input.taskPath) rows.push(`at · ${input.taskPath}`);
	if (input.nodeId !== undefined) rows.push(`node · ${input.nodeId}`);
	if (input.poolId !== "default") rows.push(`pool · ${input.poolId}`);
	rows.push(
		failed
			? "Next: hobo-code status, or hobo-code tasks for the board."
			: "Next: hobo-code tasks to see the board, or hobo-code status for this session.",
	);
	return panel(title, rows);
}

function renderDispatchSummary(input: {
	readonly taskId: string;
	readonly status: string;
	readonly nodeId?: string;
	readonly prompt: string;
	readonly poolId: string;
	readonly defaultVerb: boolean;
	readonly emptyPrompt?: boolean;
	/** Glyph chrome is opt-in; plain English is the default the help promises. */
	readonly dense?: boolean;
	/** Where the task was written, so the reply points at something real. */
	readonly taskPath?: string;
}): string {
	if (input.dense !== true) return renderDispatchPlain(input);
	const glyph =
		input.status === "done" ? "✓" : input.status === "failed" ? "✕" : "●";
	// Title glyph already marks done — drop body ✓ twin. Fail/in-flight keep trail.
	const pipeline =
		input.status === "done"
			? null
			: input.status === "failed"
				? "queue●→claim●→run●→fail✕"
				: "queue●→claim○→run○→done○";
	const node = input.nodeId !== undefined ? shortNodeLabel(input.nodeId) : "—";
	// local · station is the happy path — omit when done there.
	const omitNode =
		input.status === "done" && (node === "local · station" || node === "—");
	// Title ★ already marks defaulted bare path — body ◆ only for empty seed.
	// ◆empty = empty argv seed (ponytail default in data/docs).
	const defaultBit =
		input.defaultVerb && input.emptyPrompt
			? "◆empty"
			: input.emptyPrompt
				? "empty"
				: null;
	// Empty prompt already named by ◆empty — drop seed text twin.
	const promptBit = input.emptyPrompt ? null : shortId(input.prompt, 8);
	const nextBit = input.status === "failed" ? "nodes" : "st";
	// Happy-path done: one scan line (task + next). In-flight/fail keep node/hive rows.
	// Strip task- prefix (row already says task ·).
	const taskId = shortId(input.taskId.replace(/^task-/, ""), 6);
	// Done happy path: drop task id twin (full id in data); keep prompt/next.
	// In-flight/fail keep id for correlation.
	const omitTaskId = input.status === "done";
	// Compact · without spaces — denser scan.
	const taskRow = [
		...(omitTaskId ? [] : [taskId]),
		...(pipeline !== null ? [pipeline] : []),
		...(defaultBit !== null ? [defaultBit] : []),
		...(promptBit !== null ? [promptBit] : []),
		nextBit,
	].join("·");
	const rows =
		input.status === "done" && omitNode
			? [taskRow]
			: [
					taskRow,
					...(omitNode ? [] : [`node · ${node}`]),
					// Omit hive when default — less noise on the happy path.
					...(input.poolId === "default" ? [] : [`pool · ${input.poolId}`]),
				];
	// Defaulted bare: ★. Explicit: d (matches help tail; full word in data).
	// Product brand lives on status/help; verb panels use glyph+tail.
	const title = input.defaultVerb ? `${glyph} ★` : `${glyph} d`;
	return panel(title, rows);
}

function capacityBar(running: number, capacity: number, width = 10): string {
	const cap = Math.max(1, capacity);
	const filled = Math.min(width, Math.round((running / cap) * width));
	const empty = Math.max(0, width - filled);
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/** Short class labels for inventory scan (presentation only). */
function nodeClassLabel(cls: string): string {
	switch (cls) {
		case "local-process":
			return "lo";
		case "named-endpoint":
			return "ep";
		case "worktree":
			return "wt";
		case "rift":
			return "rift";
		case "mxc":
			return "mxc";
		case "openshell":
			return "os";
		default:
			return shortId(cls, 8);
	}
}

function renderNodeInventory(
	poolId: string,
	nodes: readonly {
		readonly nodeId: string;
		readonly class: string;
		readonly status: string;
		readonly capacity: number;
		readonly running: number;
	}[],
): string {
	const rows: string[] = [];
	if (nodes.length === 0) {
		rows.push("empty→★");
	} else {
		const online = nodes.filter((n) => n.status === "online").length;
		const freeTotal = nodes.reduce(
			(n, x) => n + Math.max(0, x.capacity - x.running),
			0,
		);
		const busyTotal = nodes.reduce((n, x) => n + x.running, 0);
		const nodeWord = nodes.length === 1 ? "node" : "nodes";
		const busyBit = busyTotal > 0 ? ` · ${busyTotal} busy` : "";
		const onBit =
			online === nodes.length && busyTotal === 0 ? "" : ` · ${online} on`;
		const allIdle = busyTotal === 0 && online === nodes.length;
		if (allIdle && nodes.length <= 4) {
			const bits = nodes.map((n) => {
				const mark = n.status === "online" ? "●" : "○";
				return `${mark}${nodeClassLabel(n.class)}${n.capacity}`;
			});
			rows.push(`${nodes.length}·${bits.join("·")}`);
		} else {
			rows.push(
				`summary · ${nodes.length} ${nodeWord}${onBit}${busyBit} · ${freeTotal} free`,
			);
			rows.push(`CLASS    LOAD     RUN/CAP  ID`);
			for (const n of nodes) {
				const free = Math.max(0, n.capacity - n.running);
				const mark = n.status === "online" ? "●" : "○";
				const bar = capacityBar(n.running, n.capacity, 8);
				const cls = nodeClassLabel(n.class).padEnd(8);
				const load = `${n.running}/${n.capacity}`.padEnd(5);
				const id = shortNodeTail(n.nodeId).padEnd(12);
				rows.push(`${mark} ${cls} ${bar}  ${load} ${id}`);
				if (free === 0 && n.status === "online") {
					rows.push(`        ▲ at capacity`);
				}
			}
		}
	}
	const nodesTitle = poolId === "default" ? "▣ n" : `▣ n·pool ${poolId}`;
	return panel(nodesTitle, rows);
}

function renderRoomInventory(
	hiveId: string,
	rooms: readonly {
		readonly roomId: string;
		readonly name: string;
		readonly participants: readonly {
			readonly kind: string;
			readonly displayName: string;
		}[];
	}[],
): string {
	const rows: string[] = [];
	if (rooms.length === 0) {
		// empty cue: ◇ = join (human)
		rows.push("empty→◇");
	} else {
		const humans = rooms.reduce(
			(n, r) => n + r.participants.filter((p) => p.kind === "human").length,
			0,
		);
		const agents = rooms.reduce(
			(n, r) => n + r.participants.filter((p) => p.kind === "agent").length,
			0,
		);
		const roomWord = rooms.length === 1 ? "room" : "rooms";
		// Drop zero counts; empty when nobody present.
		const occupancyBits = [
			humans > 0 ? `◇${humans}` : null,
			agents > 0 ? `◆${agents}` : null,
		].filter((x): x is string => x !== null);
		const allEmpty = occupancyBits.length === 0;
		const occupancy = allEmpty ? "empty" : occupancyBits.join("·");
		// Single-room empty: one summary row (no twin # empty row).
		if (allEmpty && rooms.length === 1) {
			const roomLabel = shortRoom(rooms[0]!.roomId);
			// single empty room: fold id (title brands rooms)
			rows.push(`${roomLabel}·empty`);
		} else {
			// Single occupied room: room + who (glyph counts live in who).
			if (rooms.length === 1 && !allEmpty) {
				const room = rooms[0]!;
				const roomLabel = shortRoom(room.roomId);
				const n = room.participants.length;
				const whoMax = n > 3 ? 3 : n > 2 ? 4 : 6;
				const whoCap = 4;
				const whoBits = room.participants
					.slice(0, whoCap)
					.map((p) => {
						const mark = p.kind === "agent" ? "◆" : "◇";
						return `${mark}${shortWho(p.displayName, whoMax)}`;
					})
					.join("");
				const whoMore = n > whoCap ? `·+${n - whoCap}` : "";
				// Title brands rooms; main room label omitted (default).
				rows.push(
					roomLabel === "main"
						? `${whoBits}${whoMore}`
						: `${roomLabel}·${whoBits}${whoMore}`,
				);
			} else {
				rows.push(`${rooms.length}${roomWord}·${occupancy}`);
				for (const r of rooms) {
					const roomLabel = shortRoom(r.roomId);
					const title =
						r.name === r.roomId || shortRoom(r.name) === roomLabel
							? roomLabel
							: r.name;
					const n = r.participants.length;
					if (r.participants.length === 0) {
						rows.push(
							title === roomLabel
								? `# ${title} · empty`
								: `# ${title} · empty · ${roomLabel}`,
						);
					} else {
						rows.push(
							title === roomLabel
								? `# ${title} · ${n}p`
								: `# ${title} · ${n}p · ${roomLabel}`,
						);
					}
					for (const p of r.participants) {
						const mark = p.kind === "agent" ? "◆" : "◇";
						// glyph carries kind — no twin word column
						rows.push(`  ${mark} ${shortId(p.displayName, 28)}`);
					}
				}
			}
		}
		// Occupied rooms already list who — omit ·◇ next twin (join is default).
		// Empty still folds ·◇ so next is scannable.
		if (rows.length === 1 && allEmpty) {
			rows[0] = `${rows[0]}·◇`;
		} else if (rows.length > 1) {
			// Last token is next verb — no "next" word.
			rows.push("◇");
		}
	}
	const roomsTitle = hiveId === "default" ? "# rm" : `# rm·pool ${hiveId}`;
	return panel(roomsTitle, rows);
}

/** Format CLI result for stdout (human or JSON). */
export function formatHoboCodeResult(
	result: HoboCodeCliResult,
	jsonOrOpts: boolean | FormatHoboCodeOptions = false,
): string {
	const opts: FormatHoboCodeOptions =
		typeof jsonOrOpts === "boolean" ? { json: jsonOrOpts } : jsonOrOpts;
	const json = opts.json === true;
	const denseFromData =
		typeof result.data === "object" &&
		result.data !== null &&
		(result.data as { dense?: boolean }).dense === true;
	const dense = opts.dense === true || denseFromData;

	if (json) {
		return `${JSON.stringify(
			{
				ok: result.ok,
				status: result.status,
				code: result.code,
				message: result.message,
				...(result.remediation !== undefined
					? { remediation: result.remediation }
					: {}),
				...(result.data !== undefined ? { data: result.data } : {}),
			},
			null,
			2,
		)}\n`;
	}
	if (result.code === "HOBO_CODE_HELP") {
		// Help already chose plain vs dense in helpText().
		return result.message.endsWith("\n")
			? result.message
			: `${result.message}\n`;
	}

	// Prefer embedded presentation body when present (status chrome, etc.).
	const data = result.data as { text?: string } | undefined;
	let body =
		typeof data?.text === "string" && data.text.length > 0
			? data.text
			: result.message;
	if (dense) {
		body = applyDenseChrome(body);
	}

	const lines = [body];
	// Adaptive panel rule is 12–20 ─ (see panel()); detect trailing rule line.
	const ruleMatch = body.match(/\n(─{12,20})\s*$/);
	const trailingRule = ruleMatch?.[1] ?? null;
	const stripTrailingRule = (s: string): string =>
		trailingRule !== null && s.endsWith(trailingRule)
			? s.slice(0, -trailingRule.length)
			: s.endsWith("\n")
				? s
				: `${s}\n`;
	if (result.remediation?.length) {
		// Compact FIX as body row under main panel rule.
		const fixes = result.remediation.map((r) => `→ ${r}`).join(" · ");
		const codeBit =
			!result.ok && result.code !== "HOBO_CODE_HELP"
				? ` · ✕ ${result.code}`
				: "";
		// Attach under panel: replace trailing rule with FIX + rule
		const cur = lines[0] ?? "";
		const rule = trailingRule ?? "─".repeat(16);
		if (trailingRule !== null && cur.endsWith(trailingRule)) {
			lines[0] = stripTrailingRule(cur) + `FIX  ${fixes}${codeBit}\n` + rule;
		} else {
			lines.push(`FIX  ${fixes}${codeBit}`);
			lines.push(rule);
		}
	} else if (!result.ok && result.code !== "HOBO_CODE_HELP") {
		// Prefer body-inline FIX · ✕ CODE (closed panel). Else append code row.
		// Short codes (USAGE / DIST_OFF / HARNESS_DISABLED) count as branded.
		const shortCode = result.code.replace(/^HOBO_CODE_/, "");
		if (
			body.includes(result.code) ||
			body.includes(shortCode) ||
			body.includes("FIX →") ||
			body.includes("FIX  →") ||
			/✕\s*\S+/.test(body)
		) {
			// already branded — no twin trailer
		} else {
			const rule = trailingRule ?? "─".repeat(16);
			const withCode =
				trailingRule !== null && body.endsWith(trailingRule)
					? stripTrailingRule(body) + `✕ ${result.code}\n` + rule
					: `${body}\n✕ ${result.code}`;
			lines[0] = withCode;
		}
	} else if (result.ok && result.code !== "HOBO_CODE_HELP") {
		// Quiet success code only when the body does not already brand the panel.
		// Closed panel (trailing ─) / box (┌) / se / product brand all count.
		// Short titles (✓ ★ / ▣ pl / …) omit hobo-code twin — rule is the seal.
		const branded =
			body.includes(result.code) ||
			body.includes("hobo-code") ||
			body.includes("┌") ||
			trailingRule !== null ||
			/^[\s✓✕]*se·/m.test(body);
		if (!branded) {
			lines.push("");
			lines.push(`✓ ${result.code}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
