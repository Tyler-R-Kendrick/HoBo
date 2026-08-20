/**
 * AI SDK HarnessV1 factory for hobo-code plugins.
 *
 * Builtin adapters load `@ai-sdk/harness-*` packages. Custom adapters cover
 * catalog runtimes the AI SDK does not ship yet (CLI spawn, Eve trees, SDK
 * env, host skip). Dispatch is on `runtime.adapter`, never on agent id.
 */
import { spawn } from "node:child_process";
import type { HarnessSpec } from "./agent-harness-adapters.js";
import {
	HARNESS_AGENT_PACKAGE,
	isBridgeHarnessAdapter,
	isHostHarnessAdapter,
	JUST_BASH_SANDBOX_PACKAGE,
	type ResolvedHarnessRuntime,
	resolveHarnessRuntime,
	VERCEL_SANDBOX_PACKAGE,
} from "./harness-spec.js";
import {
	cloneAsJson,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
} from "./json.js";

export type HarnessV1Event =
	| { readonly type: "text-start"; readonly id: string }
	| { readonly type: "text-delta"; readonly id: string; readonly delta: string }
	| { readonly type: "text-end"; readonly id: string }
	| {
			readonly type: "finish";
			readonly finishReason: { readonly unified: string; readonly raw: string };
			readonly totalUsage: HarnessUsage;
	  };

export interface HarnessUsage {
	readonly inputTokens: { readonly total: number; readonly noCache: number };
	readonly outputTokens: { readonly total: number; readonly text: number };
}

export interface HarnessTurnHandle {
	readonly submitToolResult: (result?: JsonValue) => Promise<void>;
	readonly done: Promise<void>;
}

export type HarnessPrompt = string | { readonly content?: unknown };

export interface HarnessV1StartOptions {
	readonly sessionId: string;
	readonly sandboxSession?: unknown;
	readonly sessionWorkDir?: string;
}

export interface HarnessV1Session {
	readonly sessionId: string;
	readonly isResume: boolean;
	doPromptTurn(options: {
		readonly prompt: HarnessPrompt;
		readonly emit: (event: HarnessV1Event) => void;
	}): Promise<HarnessTurnHandle>;
	doContinueTurn(options: {
		readonly emit: (event: HarnessV1Event) => void;
	}): Promise<HarnessTurnHandle>;
	doCompact(): Promise<void>;
	doDetach(): Promise<HarnessResumeState>;
	doStop(): Promise<HarnessResumeState>;
	doDestroy(): Promise<void>;
	doSuspendTurn(): Promise<HarnessContinueState>;
}

export interface HarnessResumeState {
	readonly type: "resume-session";
	readonly harnessId: string;
	readonly specificationVersion: "harness-v1";
	readonly data: JsonObject;
}

export interface HarnessContinueState {
	readonly type: "continue-turn";
	readonly harnessId: string;
	readonly specificationVersion: "harness-v1";
	readonly data: JsonObject;
}

export interface HarnessV1 {
	readonly specificationVersion: "harness-v1";
	readonly harnessId: string;
	readonly builtinTools: Readonly<Record<string, never>>;
	doStart(options: HarnessV1StartOptions): Promise<HarnessV1Session>;
}

export interface CliTurnInput {
	readonly command: string;
	readonly prompt: string;
	readonly cwd?: string;
	readonly args?: readonly string[];
	readonly stdin?: string;
}

export interface SpawnCliInput {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
	readonly stdin?: string;
}

export interface SpawnCliResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
}

export interface CreateHarnessV1Options {
	readonly cwd?: string;
	readonly importBuiltin?: (packageName: string) => Promise<HarnessV1>;
	readonly runCliTurn?: (input: CliTurnInput) => Promise<string>;
	readonly spawnCli?: (input: SpawnCliInput) => Promise<SpawnCliResult>;
	/** AI SDK generateText / ToolLoopAgent seam for the `sdk` adapter. */
	readonly generateSdkText?: (prompt: string) => Promise<string>;
}

const EMPTY_USAGE: HarnessUsage = {
	inputTokens: { total: 0, noCache: 0 },
	outputTokens: { total: 0, text: 0 },
};

function promptText(prompt: HarnessPrompt): string {
	if (isJsonString(prompt)) return prompt;
	const content = prompt.content;
	if (isJsonString(content)) return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (isJsonString(part)) return part;
				if (part && isJsonObject(part) && "text" in part) {
					// SAFETY: parsed or fixture value is the named domain type after this assertion.
					const text = (part as { text?: unknown }).text;
					return isJsonString(text) ? text : "";
				}
				return "";
			})
			.join("");
	}
	return "";
}

function resumeState(harnessId: string): HarnessResumeState {
	return {
		type: "resume-session",
		harnessId,
		specificationVersion: "harness-v1",
		data: {},
	};
}

function continueState(harnessId: string): HarnessContinueState {
	return {
		type: "continue-turn",
		harnessId,
		specificationVersion: "harness-v1",
		data: {},
	};
}

function emitTextTurn(
	emit: (event: HarnessV1Event) => void,
	text: string,
): HarnessTurnHandle {
	const done = Promise.resolve().then(() => {
		emit({ type: "text-start", id: "t" });
		if (text.length > 0) {
			emit({ type: "text-delta", id: "t", delta: text });
		}
		emit({ type: "text-end", id: "t" });
		emit({
			type: "finish",
			finishReason: { unified: "stop", raw: "stop" },
			totalUsage: EMPTY_USAGE,
		});
	});
	return { submitToolResult: async () => {}, done };
}

function sessionShell(
	harnessId: string,
	sessionId: string,
	onPrompt: (prompt: string) => Promise<string>,
): HarnessV1Session {
	return {
		sessionId,
		isResume: false,
		async doPromptTurn(options) {
			const text = await onPrompt(promptText(options.prompt));
			return emitTextTurn(options.emit, text);
		},
		async doContinueTurn(options) {
			return emitTextTurn(options.emit, "");
		},
		async doCompact() {},
		async doDetach() {
			return resumeState(harnessId);
		},
		async doStop() {
			return resumeState(harnessId);
		},
		async doDestroy() {},
		async doSuspendTurn() {
			return continueState(harnessId);
		},
	};
}

function customHarness(
	harnessId: string,
	onPrompt: (prompt: string) => Promise<string>,
): HarnessV1 {
	return {
		specificationVersion: "harness-v1",
		harnessId,
		builtinTools: {},
		async doStart(options) {
			return sessionShell(harnessId, options.sessionId, onPrompt);
		},
	};
}

async function loadBuiltinHarness(
	resolved: Extract<ResolvedHarnessRuntime, { origin: "builtin" }>,
	importBuiltin?: CreateHarnessV1Options["importBuiltin"],
): Promise<HarnessV1> {
	if (importBuiltin) return importBuiltin(resolved.packageName);
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const loaded = (await import(
			// SAFETY: packageName is a compile-time builtin adapter specifier.
			resolved.packageName as string
		)) as HarnessModule;
		const harness = pickBuiltinExport(loaded);
		if (!harness) {
			throw new Error(
				`${resolved.packageName} loaded but exported no HarnessV1 factory`,
			);
		}
		return harness;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`AI SDK harness adapter ${resolved.adapter} unavailable (${resolved.packageName}): ${reason}`,
		);
	}
}

interface HarnessModule {
	[name: string]: JsonValue | ((...args: never[]) => JsonValue) | undefined;
}

function pickBuiltinExport(mod: HarnessModule): HarnessV1 | undefined {
	const factories = [
		"claudeCode",
		"codex",
		"pi",
		"opencode",
		"grokBuild",
		"cline",
		"deepAgents",
		"acp",
		"createClaudeCode",
		"createCodex",
		"createPi",
		"createOpenCode",
		"createGrokBuild",
		"createCline",
		"createDeepAgents",
		"createACP",
	];
	for (const name of factories) {
		const value = mod[name];
		if (value instanceof Function) {
			const created = cloneAsJson(value());
			if (isHarnessV1(created)) return created;
		}
		if (isHarnessV1(value)) return value;
	}
	if (isHarnessV1(mod.default)) return mod.default;
	return undefined;
}

function isHarnessV1<T>(value: T): value is T & HarnessV1 {
	if (!value || !isJsonObject(value)) return false;
	const row = value;
	return (
		row.specificationVersion === "harness-v1" &&
		isJsonString(row.harnessId) &&
		row.doStart instanceof Function
	);
}

function cliTurnInput(
	command: string,
	prompt: string,
	cwd: string | undefined,
): CliTurnInput {
	return cwd === undefined ? { command, prompt } : { command, prompt, cwd };
}

export function cliPromptInvocation(spec: HarnessSpec, prompt: string) {
	const command = spec.command;
	if (!command) {
		throw new Error(`cli adapter requires command on harness spec ${spec.id}`);
	}
	const prefix = spec.runtime?.prompt?.prefixArgs ?? ["-p"];
	if (spec.runtime?.prompt?.placement === "stdin") {
		return { command, args: [...prefix], stdin: prompt };
	}
	return { command, args: [...prefix, prompt] };
}

function defaultSpawnCli(input: SpawnCliInput): Promise<SpawnCliResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(input.command, [...input.args], {
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
			...(input.cwd === undefined ? undefined : { cwd: input.cwd }),
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		if (input.stdin !== undefined) {
			child.stdin.end(input.stdin);
		} else {
			child.stdin.end();
		}
		child.on("error", (error) => {
			reject(new Error(`cli spawn ${input.command} failed: ${error.message}`));
		});
		child.on("close", (code) => {
			resolve({ stdout, stderr, code: code ?? 1 });
		});
	});
}

async function runCliPrompt(
	spec: HarnessSpec,
	prompt: string,
	options: CreateHarnessV1Options,
): Promise<string> {
	const invocation = cliPromptInvocation(spec, prompt);
	if (options.runCliTurn) {
		return options.runCliTurn({
			command: invocation.command,
			prompt,
			args: invocation.args,
			...(options.cwd === undefined ? undefined : { cwd: options.cwd }),
			...(invocation.stdin === undefined
				? undefined
				: { stdin: invocation.stdin }),
		});
	}
	const spawnCli = options.spawnCli ?? defaultSpawnCli;
	const result = await spawnCli({
		command: invocation.command,
		args: invocation.args,
		...(options.cwd === undefined ? undefined : { cwd: options.cwd }),
		...(invocation.stdin === undefined
			? undefined
			: { stdin: invocation.stdin }),
	});
	if (result.code !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim();
		throw new Error(
			`${invocation.command} exited ${result.code}${detail ? `: ${detail}` : ""}`,
		);
	}
	return result.stdout;
}

function createCustomHarness(
	spec: HarnessSpec,
	adapter: "cli" | "eve" | "sdk" | "skip",
	options: CreateHarnessV1Options,
): HarnessV1 {
	if (adapter === "skip") {
		return customHarness(spec.id, async () => {
			throw new Error(
				`${spec.id} is not a runnable coding harness (host or inference)`,
			);
		});
	}
	if (adapter === "eve") {
		return customHarness(spec.id, async (prompt) => {
			if (options.runCliTurn) {
				return options.runCliTurn(
					cliTurnInput(spec.command ?? "eve", prompt, options.cwd),
				);
			}
			return `eve tree ${spec.id} received: ${prompt}`;
		});
	}
	if (adapter === "sdk") {
		return customHarness(spec.id, async (prompt) => {
			if (options.generateSdkText) {
				return options.generateSdkText(prompt);
			}
			if (options.runCliTurn) {
				return options.runCliTurn(
					cliTurnInput(spec.command ?? "sdk", prompt, options.cwd),
				);
			}
			throw new Error(
				"sdk adapter needs generateSdkText (AI SDK generateText / ToolLoopAgent)",
			);
		});
	}
	if (!spec.command) {
		throw new Error(`cli adapter requires command on harness spec ${spec.id}`);
	}
	return customHarness(spec.id, async (prompt) =>
		runCliPrompt(spec, prompt, options),
	);
}

export async function createHarnessV1(
	spec: HarnessSpec,
	options: CreateHarnessV1Options = {},
): Promise<HarnessV1> {
	const resolved = resolveHarnessRuntime(spec);
	if (resolved.origin === "builtin") {
		return loadBuiltinHarness(resolved, options.importBuiltin);
	}
	return createCustomHarness(spec, resolved.adapter, options);
}

export interface HarnessAgentLike {
	readonly createSession: (options?: {
		readonly sessionId?: string;
	}) => Promise<JsonValue>;
}

export interface CreateHarnessAgentOptions extends CreateHarnessV1Options {
	readonly sandbox?: unknown;
	readonly instructions?: string;
	readonly createAgent?: (input: {
		readonly harness: HarnessV1;
		readonly sandbox: unknown;
		readonly instructions?: string;
	}) => HarnessAgentLike | Promise<HarnessAgentLike>;
	readonly importJustBashSandbox?: () => Promise<{
		createJustBashSandbox: (settings?: JsonValue) => JsonValue;
	}>;
	readonly importHarnessAgent?: () => Promise<{
		HarnessAgent: new (settings: {
			harness: HarnessV1;
			sandbox: unknown;
			instructions?: string;
		}) => HarnessAgentLike;
	}>;
}

async function resolveSandbox(
	resolved: ResolvedHarnessRuntime,
	options: CreateHarnessAgentOptions,
): Promise<JsonValue> {
	if (options.sandbox !== undefined) return cloneAsJson(options.sandbox);
	if (resolved.adapter === "skip") {
		throw new Error(
			`${resolved.adapter} is not a runnable coding harness (host or inference)`,
		);
	}
	if (isBridgeHarnessAdapter(resolved.adapter)) {
		throw new Error(
			`AI SDK adapter ${resolved.adapter} is a sandbox bridge — pass a network sandbox (${VERCEL_SANDBOX_PACKAGE}) or use TTY mux seating`,
		);
	}
	if (!isHostHarnessAdapter(resolved.adapter)) {
		throw new Error(`adapter ${resolved.adapter} has no sandbox mapping`);
	}
	try {
		let loaded: {
			createJustBashSandbox: (settings?: JsonValue) => JsonValue;
		};
		if (options.importJustBashSandbox) {
			loaded = await options.importJustBashSandbox();
		} else {
			// SAFETY: JUST_BASH_SANDBOX_PACKAGE is a compile-time package specifier.
			const specifier = JUST_BASH_SANDBOX_PACKAGE as string;
			// SAFETY: the just-bash package exports createJustBashSandbox.
			loaded = (await import(specifier)) as {
				createJustBashSandbox: (settings?: JsonValue) => JsonValue;
			};
		}
		if (!(loaded.createJustBashSandbox instanceof Function)) {
			throw new Error(
				`${JUST_BASH_SANDBOX_PACKAGE} loaded but exported no createJustBashSandbox`,
			);
		}
		return loaded.createJustBashSandbox();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if (reason.includes("sandbox bridge")) throw error;
		throw new Error(
			`AI SDK just-bash sandbox unavailable (${JUST_BASH_SANDBOX_PACKAGE}): ${reason}`,
		);
	}
}

/**
 * Wrap a HarnessV1 in AI SDK HarnessAgent. Host adapters default to
 * `@ai-sdk/sandbox-just-bash`. Bridge adapters fail closed until a network
 * sandbox is injected — local Station is not a Vercel microVM.
 */
export async function createHarnessAgent(
	spec: HarnessSpec,
	options: CreateHarnessAgentOptions = {},
): Promise<HarnessAgentLike> {
	const resolved = resolveHarnessRuntime(spec);
	if (resolved.adapter === "skip") {
		throw new Error(
			`${spec.id} is not a runnable coding harness (host or inference)`,
		);
	}
	const harness = await createHarnessV1(spec, options);
	const sandbox = await resolveSandbox(resolved, options);
	const agentSettings = {
		harness,
		sandbox,
		...(options.instructions === undefined
			? undefined
			: { instructions: options.instructions }),
	};
	if (options.createAgent) {
		return options.createAgent(agentSettings);
	}
	try {
		let loaded: {
			HarnessAgent: new (settings: {
				harness: HarnessV1;
				sandbox: unknown;
				instructions?: string;
			}) => HarnessAgentLike;
		};
		if (options.importHarnessAgent) {
			loaded = await options.importHarnessAgent();
		} else {
			// SAFETY: the harness-agent package exports the HarnessAgent class.
			loaded = (await import(`${HARNESS_AGENT_PACKAGE}/agent`)) as {
				HarnessAgent: new (settings: {
					harness: HarnessV1;
					sandbox: unknown;
					instructions?: string;
				}) => HarnessAgentLike;
			};
		}
		if (!(loaded.HarnessAgent instanceof Function)) {
			throw new Error(
				`${HARNESS_AGENT_PACKAGE}/agent loaded but exported no HarnessAgent`,
			);
		}
		return new loaded.HarnessAgent(agentSettings);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`AI SDK HarnessAgent unavailable (${HARNESS_AGENT_PACKAGE}): ${reason}`,
		);
	}
}

export { resolveHarnessRuntime };
