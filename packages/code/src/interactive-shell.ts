/**
 * HoBo-owned interactive product shell for bare `hobo-code` TTY.
 *
 * Architecture (ADR note in ARCHITECTURE.md):
 * - **This module owns chrome** (header/Bo, chat, tasks, slash, footer).
 * - Pi is **not** the product UI. Optional engine via `HOBO_CODE_TUI=pi` only.
 *
 * Pure frame rendering is unit-tested. The run loop is a thin TTY driver.
 */

import type { Readable, Writable } from "node:stream";
import {
	BO_IDLE_TICK_MS,
	HOBO_LOGO_CONSOLE,
	HOBO_MARK_CONSOLE,
	padLine,
	renderBoIdleFrame,
	selectBoIdleFrame,
} from "./splash.js";
import { buildTasksSurface } from "./grok-build-parity.js";
import { createPane, buildMultiplexerStatus, renderStatusText } from "./tui.js";
import { inspectHermeticEnv, hermeticEnvSummary } from "./hermetic-env.js";
import { inspectCost } from "./cost.js";
import { inspectModels } from "./models.js";

// ── Types ────────────────────────────────────────────────────────────────

export type ShellFocus = "chat" | "tasks" | "status" | "slash";

export type ShellAgentState = "idle" | "working" | "blocked" | "done";

export interface ShellMessage {
	readonly role: "system" | "user" | "assistant" | "product";
	readonly text: string;
	readonly at: number;
}

export interface ShellSlashItem {
	readonly name: string;
	readonly description: string;
	/** When set, shell invokes this CLI argv via the host callback. */
	readonly argv?: readonly string[];
	/** Built-in action id when not a CLI verb. */
	readonly action?: "help" | "clear" | "quit" | "guide-hint";
}

export interface InteractiveShellState {
	readonly width: number;
	readonly height: number;
	readonly tickMs: number;
	readonly reducedMotion: boolean;
	readonly dense: boolean;
	readonly focus: ShellFocus;
	readonly input: string;
	readonly messages: readonly ShellMessage[];
	readonly agentState: ShellAgentState;
	readonly slashOpen: boolean;
	readonly slashFilter: string;
	readonly slashIndex: number;
	readonly statusPlain: string;
	readonly tasksPlain: string;
	readonly footerHints: string;
	readonly modelLabel: string;
	readonly costLabel: string;
	readonly hermeticLabel: string;
	readonly productTitle: string;
	/** Hard product identity — must never be stock Pi chrome. */
	readonly engineLabel: "hobo-shell";
}

export interface RenderShellOptions {
	readonly state: InteractiveShellState;
}

export const DEFAULT_SLASH_ITEMS: readonly ShellSlashItem[] = [
	{ name: "help", description: "Shell keys + product map", action: "help" },
	{ name: "guide", description: "Claude Code → hobo-code map", argv: ["guide"] },
	{ name: "cursor", description: "Cursor → hobo-code map", argv: ["guide", "--cursor"] },
	{ name: "agent", description: "Agent-native inventory", argv: ["agent"] },
	{ name: "config", description: "Setup / stack inventory", argv: ["config"] },
	{ name: "cost", description: "$0 path + budget + savings", argv: ["cost"] },
	{ name: "status", description: "Session / agent panes", argv: ["status"] },
	{ name: "tasks", description: "Background task board", argv: ["tasks"] },
	{ name: "env", description: "Hermetic shell + durable layout", argv: ["env"] },
	{ name: "auth", description: "Station auth status", argv: ["auth", "status"] },
	{ name: "login", description: "Human-free local login", argv: ["auth", "login", "--agent"] },
	{ name: "models", description: "Model + BYOK (no secrets)", argv: ["models"] },
	{ name: "harness", description: "Pi engine / Flue dual surface", argv: ["harness"] },
	{ name: "attach", description: "tmux/mosh/Tailscale-shaped attach", argv: ["attach"] },
	{ name: "clear", description: "Clear chat transcript", action: "clear" },
	{ name: "quit", description: "Exit hobo-code shell", action: "quit" },
] as const;

export const PRODUCT_NOT_PI = "hobo-code · HoBo shell (not stock Pi Agent)";

// ── Pure helpers ─────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

function wrapText(text: string, width: number): string[] {
	const w = Math.max(8, width);
	const out: string[] = [];
	for (const para of text.split("\n")) {
		if (para.length === 0) {
			out.push("");
			continue;
		}
		let rest = para;
		while (rest.length > w) {
			let breakAt = rest.lastIndexOf(" ", w);
			if (breakAt < w * 0.5) breakAt = w;
			out.push(rest.slice(0, breakAt).trimEnd());
			rest = rest.slice(breakAt).trimStart();
		}
		out.push(rest);
	}
	return out;
}

function filterSlash(
	items: readonly ShellSlashItem[],
	filter: string,
): ShellSlashItem[] {
	const f = filter.trim().toLowerCase().replace(/^\//, "");
	if (!f) return [...items];
	return items.filter(
		(i) =>
			i.name.includes(f) ||
			i.description.toLowerCase().includes(f),
	);
}

/**
 * Build initial shell state from env/cwd — pure enough for tests with overrides.
 */
export function createInitialShellState(
	options: {
		readonly width?: number;
		readonly height?: number;
		readonly dense?: boolean;
		readonly reducedMotion?: boolean;
		readonly cwd?: string;
		readonly hoboHome?: string;
		readonly env?: NodeJS.ProcessEnv;
		readonly welcome?: boolean;
	} = {},
): InteractiveShellState {
	const env = options.env ?? process.env;
	const width = clamp(options.width ?? 80, 40, 200);
	const height = clamp(options.height ?? 24, 12, 80);
	const dense = options.dense === true;
	const reducedMotion =
		options.reducedMotion === true ||
		env.HOBO_CODE_REDUCED_MOTION === "1" ||
		env.HOBO_CODE_REDUCED_MOTION === "true";

	const hoboHome =
		options.hoboHome ??
		(typeof env.HOBO_HOME === "string" && env.HOBO_HOME
			? env.HOBO_HOME
			: `${env.HOME ?? "/tmp"}/.hobo`);
	const hermetic = inspectHermeticEnv({
		projectRoot: options.cwd ?? process.cwd(),
		hoboHome,
		env,
	});
	const cost = inspectCost(env);
	const models = inspectModels(env);

	const panes = [
		createPane("coord", "idle", ""),
		createPane("station", "done", ""),
		createPane("auth", "idle", "login"),
	];
	const mux = buildMultiplexerStatus(panes, {
		remoteReady: true,
		theme: "herdr",
	});
	const statusPlain = renderStatusText(mux, { plain: true });
	const tasks = buildTasksSurface({ hoboHome, panes: mux.panes });
	const tasksPlain = [
		"Tasks · keyboard-first (Tab → Tasks) · clickable mouse residual later",
		...tasks.rows.map(
			(r) =>
				`  [${r.state}] ${r.kind}/${r.id}${r.summary ? ` — ${r.summary}` : ""}`,
		),
		"  Regions: task-row · still-working · status-chip (keyboard focus now)",
		"  Honest residual: fullscreen mouse TUI is not claimed complete yet",
	].join("\n");

	const welcome: ShellMessage[] =
		options.welcome === false
			? []
			: [
					{
						role: "system",
						text: PRODUCT_NOT_PI,
						at: Date.now(),
					},
					{
						role: "product",
						text: [
							"Bo is with you — this is HoBo product chrome, not stock Pi Agent.",
							"Start: type a build prompt · or /guide (Claude map) · /config · /cost · /tasks",
							"Hermetic/nix: /env · Budget: footer chip · Keys: Tab · / · ? · Ctrl+C",
						].join("\n"),
						at: Date.now(),
					},
				];

	return {
		width,
		height,
		tickMs: 0,
		reducedMotion,
		dense,
		focus: "chat",
		input: "",
		messages: welcome,
		agentState: "idle",
		slashOpen: false,
		slashFilter: "",
		slashIndex: 0,
		statusPlain,
		tasksPlain,
		footerHints: "Tab focus · / slash · ? help · Ctrl+C quit",
		modelLabel: models.activeModel,
		costLabel: `$${cost.budget.spendUsd.toFixed(2)}/$${cost.budget.capUsd.toFixed(2)} · ${cost.budget.routingPolicy}`,
		hermeticLabel: hermeticEnvSummary(hermetic).split("\n")[0] ?? "env",
		productTitle: "hobo-code",
		engineLabel: "hobo-shell",
	};
}

/**
 * Render one full-screen frame. Fixed structure for tests:
 * header (logo+Bo) · identity line · body (chat|tasks|status|slash) · input · footer.
 */
export function renderShellFrame(state: InteractiveShellState): string {
	const w = state.width;
	const lines: string[] = [];

	// Header: compact mark + Bo (dense: mark only strip)
	const frame = selectBoIdleFrame({
		tickMs: state.tickMs,
		reducedMotion: state.reducedMotion,
	});
	const bo = renderBoIdleFrame(frame);
	const logo = state.dense ? HOBO_MARK_CONSOLE : HOBO_LOGO_CONSOLE;
	for (const row of logo.split("\n")) {
		lines.push(padLine(row, w));
	}
	// Bo: take up to 6 lines of sprite, pad to width
	const boRows = bo.split("\n").slice(0, state.dense ? 0 : 6);
	for (const row of boRows) {
		lines.push(padLine(row.trimEnd().slice(0, w), w));
	}

	lines.push(padLine(PRODUCT_NOT_PI, w));
	lines.push(
		padLine(
			`${state.productTitle} · ${state.engineLabel} · agent:${state.agentState} · focus:${state.focus}`,
			w,
		),
	);
	lines.push(padLine("─".repeat(Math.min(w, 40)), w));

	// Body budget
	const reserved = lines.length + 4; // input + footer + blanks
	const bodyH = Math.max(4, state.height - reserved);

	let bodyLines: string[] = [];
	if (state.slashOpen) {
		const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
		bodyLines.push(padLine(`Slash palette  filter: /${state.slashFilter}`, w));
		items.forEach((item, i) => {
			const mark = i === state.slashIndex ? "▸" : " ";
			bodyLines.push(
				padLine(`${mark} /${item.name.padEnd(10)} ${item.description}`, w),
			);
		});
		if (items.length === 0) {
			bodyLines.push(padLine("  (no matches)", w));
		}
	} else if (state.focus === "tasks") {
		bodyLines = wrapText(state.tasksPlain, w).map((l) => padLine(l, w));
	} else if (state.focus === "status") {
		bodyLines = wrapText(state.statusPlain, w).map((l) => padLine(l, w));
	} else {
		// chat transcript (last N lines)
		const chat: string[] = [];
		for (const m of state.messages) {
			const prefix =
				m.role === "user"
					? "you · "
					: m.role === "assistant"
						? "Bo  · "
						: m.role === "product"
							? "··· · "
							: "sys · ";
			for (const row of wrapText(prefix + m.text, w)) {
				chat.push(padLine(row, w));
			}
			chat.push(padLine("", w));
		}
		bodyLines = chat.slice(-bodyH);
	}

	while (bodyLines.length < bodyH) bodyLines.push(padLine("", w));
	lines.push(...bodyLines.slice(0, bodyH));

	lines.push(padLine("─".repeat(Math.min(w, 40)), w));
	const prompt =
		state.slashOpen || state.input.startsWith("/")
			? `/${state.slashFilter || state.input.replace(/^\//, "")}`
			: state.input;
	lines.push(padLine(`❯ ${prompt}█`, w));
	lines.push(
		padLine(
			`${state.modelLabel} · ${state.costLabel} · ${state.hermeticLabel}`,
			w,
		),
	);
	lines.push(padLine(state.footerHints, w));

	// Guarantee no "pi agent" product chrome tokens in owned frame
	return lines.join("\n");
}

/** Assert product identity tokens for persona hard gates. */
export function shellFrameIdentity(frame: string): {
	readonly isHoboShell: boolean;
	readonly claimsNotPi: boolean;
	readonly hasBoArt: boolean;
	readonly hasPrompt: boolean;
	readonly mentionsStockPiChrome: boolean;
} {
	const lower = frame.toLowerCase();
	return {
		isHoboShell: frame.includes("hobo-shell") && frame.includes("hobo-code"),
		claimsNotPi: frame.includes(PRODUCT_NOT_PI) || lower.includes("not stock pi"),
		hasBoArt: /[▀▄█]/.test(frame) || frame.includes(HOBO_MARK_CONSOLE),
		hasPrompt: frame.includes("❯"),
		// Stock Pi product chrome phrases we must not show as our UI
		mentionsStockPiChrome:
			/\bpi coding agent\b/i.test(frame) ||
			/\bpi-agent\b/i.test(frame) ||
			/welcome to pi\b/i.test(frame),
	};
}

export function reduceShellKey(
	state: InteractiveShellState,
	key: string,
): { readonly state: InteractiveShellState; readonly quit?: boolean; readonly submit?: string; readonly slash?: ShellSlashItem } {
	// Ctrl+C
	if (key === "\u0003") {
		return { state, quit: true };
	}
	// Esc
	if (key === "\u001b") {
		if (state.slashOpen) {
			return {
				state: {
					...state,
					slashOpen: false,
					slashFilter: "",
					slashIndex: 0,
					input: "",
					focus: "chat",
				},
			};
		}
		return { state };
	}
	// Tab — cycle focus
	if (key === "\t") {
		const order: ShellFocus[] = ["chat", "tasks", "status"];
		const i = order.indexOf(state.focus === "slash" ? "chat" : state.focus);
		const next = order[(i + 1) % order.length]!;
		return {
			state: {
				...state,
				focus: next,
				slashOpen: false,
				footerHints: `focus:${next} · Tab cycle · / slash · ? help`,
			},
		};
	}
	// ?
	if (key === "?" && state.input.length === 0 && !state.slashOpen) {
		const help: ShellMessage = {
			role: "product",
			text: [
				"hobo-code shell help",
				"  Type a prompt to build with Bo.",
				"  / opens slash palette (guide, config, cost, tasks, …).",
				"  Tab cycles Chat → Tasks → Status.",
				"  This is HoBo chrome — not stock Pi Agent UI.",
			].join("\n"),
			at: Date.now(),
		};
		return {
			state: { ...state, messages: [...state.messages, help] },
		};
	}
	// Enter
	if (key === "\r" || key === "\n") {
		if (state.slashOpen) {
			const items = filterSlash(DEFAULT_SLASH_ITEMS, state.slashFilter);
			const item = items[state.slashIndex];
			if (!item) {
				return {
					state: {
						...state,
						slashOpen: false,
						slashFilter: "",
						input: "",
					},
				};
			}
			return {
				state: {
					...state,
					slashOpen: false,
					slashFilter: "",
					slashIndex: 0,
					input: "",
					focus: "chat",
				},
				slash: item,
			};
		}
		const text = state.input.trim();
		if (!text) return { state };
		if (text.startsWith("/")) {
			const name = text.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
			const item = DEFAULT_SLASH_ITEMS.find((i) => i.name === name);
			if (item) {
				return {
					state: { ...state, input: "", slashOpen: false, slashFilter: "" },
					slash: item,
				};
			}
			return {
				state: { ...state, input: "", slashOpen: false, slashFilter: "" },
				submit: text,
			};
		}
		return {
			state: {
				...state,
				input: "",
				messages: [
					...state.messages,
					{ role: "user", text, at: Date.now() },
				],
				agentState: "working",
			},
			submit: text,
		};
	}
	// Backspace
	if (key === "\u007f" || key === "\b") {
		if (state.slashOpen) {
			const f = state.slashFilter.slice(0, -1);
			return {
				state: {
					...state,
					slashFilter: f,
					slashIndex: 0,
					input: f ? `/${f}` : "/",
				},
			};
		}
		return { state: { ...state, input: state.input.slice(0, -1) } };
	}
	// Arrow up/down in slash (CSI A/B) — simplified: ignore multi-byte for v1 except we get single chars
	// Printable
	if (key.length === 1 && key >= " ") {
		if (key === "/" && state.input.length === 0 && !state.slashOpen) {
			return {
				state: {
					...state,
					slashOpen: true,
					slashFilter: "",
					slashIndex: 0,
					input: "/",
					focus: "slash",
				},
			};
		}
		if (state.slashOpen) {
			const f = state.slashFilter + key;
			return {
				state: {
					...state,
					slashFilter: f,
					slashIndex: 0,
					input: `/${f}`,
				},
			};
		}
		return { state: { ...state, input: state.input + key } };
	}
	return { state };
}

export function appendAssistant(
	state: InteractiveShellState,
	text: string,
	agentState: ShellAgentState = "idle",
): InteractiveShellState {
	return {
		...state,
		agentState,
		messages: [
			...state.messages,
			{ role: "assistant", text, at: Date.now() },
		],
	};
}

export function appendProduct(
	state: InteractiveShellState,
	text: string,
): InteractiveShellState {
	return {
		...state,
		messages: [
			...state.messages,
			{ role: "product", text, at: Date.now() },
		],
	};
}

// ── TTY driver ───────────────────────────────────────────────────────────

export interface ShellHost {
	/** Run a product CLI surface; return human text. */
	readonly runVerb: (argv: readonly string[]) => Promise<string>;
	/** Handle a user chat prompt; return assistant text. */
	readonly complete: (prompt: string) => Promise<string>;
}

export interface RunInteractiveShellOptions {
	readonly stdin?: Readable;
	readonly stdout?: Writable;
	readonly stderr?: Writable;
	readonly host: ShellHost;
	readonly dense?: boolean;
	readonly reducedMotion?: boolean;
	readonly cwd?: string;
	readonly hoboHome?: string;
	readonly env?: NodeJS.ProcessEnv;
	/** Test hook: stop after N ms */
	readonly maxMs?: number;
	/** Inject keys for tests (skips raw mode). */
	readonly scriptedKeys?: string;
}

/**
 * Default host: one-shot CLI verbs + dispatch-shaped complete via runHoboCodeCli.
 * Injected from bin to avoid circular imports at module load in tests.
 */
export async function runInteractiveShell(
	options: RunInteractiveShellOptions,
): Promise<number> {
	const stdin = options.stdin ?? process.stdin;
	const stdout = options.stdout ?? process.stdout;
	const isTty =
		"isTTY" in stdin &&
		stdin.isTTY === true &&
		"isTTY" in stdout &&
		stdout.isTTY === true;

	let state = createInitialShellState({
		width: "columns" in stdout && typeof stdout.columns === "number" ? stdout.columns : 80,
		height: "rows" in stdout && typeof stdout.rows === "number" ? stdout.rows : 24,
		...(options.dense !== undefined ? { dense: options.dense } : {}),
		...(options.reducedMotion !== undefined
			? { reducedMotion: options.reducedMotion }
			: {}),
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.hoboHome !== undefined ? { hoboHome: options.hoboHome } : {}),
		...(options.env !== undefined ? { env: options.env } : {}),
	});

	const write = (s: string) => {
		stdout.write(s);
	};

	const paint = () => {
		const frame = renderShellFrame({ ...state, tickMs: state.tickMs });
		if (isTty) {
			// alt screen home + paint
			write(`\x1b[H\x1b[J${frame}`);
		} else {
			write(`${frame}\n`);
		}
	};

	let quit = false;
	const started = Date.now();

	const applySlash = async (item: ShellSlashItem) => {
		if (item.action === "quit") {
			quit = true;
			return;
		}
		if (item.action === "clear") {
			state = { ...state, messages: [] };
			return;
		}
		if (item.action === "help") {
			state = appendProduct(
				state,
				[
					"Slash: /guide /config /cost /tasks /status /agent /env /auth /login /quit",
					"Chat: type a prompt and Enter — Bo dispatches app-building work.",
					PRODUCT_NOT_PI,
				].join("\n"),
			);
			return;
		}
		if (item.argv) {
			state = { ...state, agentState: "working" };
			paint();
			try {
				const text = await options.host.runVerb(item.argv);
				state = appendProduct(state, text.slice(0, 4000));
			} catch (err) {
				state = appendProduct(
					state,
					`/${item.name} failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			state = { ...state, agentState: "idle" };
			return;
		}
	};

	const onSubmit = async (prompt: string) => {
		state = { ...state, agentState: "working" };
		paint();
		try {
			const text = await options.host.complete(prompt);
			state = appendAssistant(state, text.slice(0, 8000), "idle");
		} catch (err) {
			state = appendAssistant(
				state,
				`Could not complete: ${err instanceof Error ? err.message : String(err)}`,
				"blocked",
			);
		}
	};

	if (isTty && "setRawMode" in stdin && typeof stdin.setRawMode === "function") {
		stdin.setRawMode(true);
	}
	if ("resume" in stdin) stdin.resume();

	if (isTty) {
		write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor
	}

	const tick = setInterval(() => {
		if (quit) return;
		state = { ...state, tickMs: Date.now() - started };
		if (!state.reducedMotion) paint();
	}, BO_IDLE_TICK_MS);

	paint();

	const handleChunk = async (chunk: Buffer | string) => {
		const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
		for (const ch of s) {
			if (quit) return;
			const result = reduceShellKey(state, ch);
			state = result.state;
			if (result.quit) {
				quit = true;
				return;
			}
			if (result.slash) {
				await applySlash(result.slash);
			}
			if (result.submit && !result.slash) {
				await onSubmit(result.submit);
			}
			paint();
		}
	};

	if (options.scriptedKeys !== undefined) {
		await handleChunk(options.scriptedKeys);
		quit = true;
	} else {
		await new Promise<void>((resolve) => {
			const onData = (c: Buffer) => {
				void handleChunk(c).then(() => {
					if (quit) cleanup();
				});
			};
			const cleanup = () => {
				stdin.removeListener("data", onData);
				clearInterval(tick);
				resolve();
			};
			stdin.on("data", onData);
			if (options.maxMs) {
				setTimeout(() => {
					quit = true;
					cleanup();
				}, options.maxMs).unref();
			}
			// When quit set from handler
			const watch = setInterval(() => {
				if (quit) {
					clearInterval(watch);
					cleanup();
				}
			}, 50);
		});
	}

	clearInterval(tick);
	if (isTty) {
		write("\x1b[?25h\x1b[?1049l");
	}
	if (isTty && "setRawMode" in stdin && typeof stdin.setRawMode === "function") {
		stdin.setRawMode(false);
	}
	return 0;
}
