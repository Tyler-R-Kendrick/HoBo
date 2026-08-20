/**
 * Vercel-shaped coding-harness registrar for hobo-code.
 * Analog of `vercel ai-gateway coding-agents setup` — Station occupancy, not a key mint.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
	AgentsInitDestination,
	HarnessHunk,
	HarnessKind,
} from "./agent-harness-adapters.js";
import {
	isHostSpec,
	loadHarnessCatalog,
	pickKindFromSpec,
	planSpecHunks,
	specEvidence,
} from "./agent-harness-catalog.js";
import {
	type AgentPick,
	buildAgentPicks,
	createChecklist,
	eraseAgentChecklist,
	isSelfHarness,
	reduceChecklistKey,
	renderAgentChecklist,
	repaintAgentChecklist,
	selectedPickIds,
	shouldWriteAgentsInit,
} from "./agent-harness-picks.js";
import { defaultProbes } from "./agent-registry.js";
import { readAuthSession } from "./auth.js";
import { cloneAsJson, isJsonString, type JsonValue } from "./json.js";
import { DEFAULT_OLLAMA_HOST, probeOllama } from "./ollama-engine.js";

export type { AgentsInitDestination, HarnessHunk, HarnessKind };

// public-contract: agents-init plan schema written by `hobo-code agents init`
export const AGENTS_INIT_SCHEMA = "hobo.code.agents.init/v1" as const;
// public-contract: durable registry of applied harness destinations
export const AGENTS_REGISTRY_SCHEMA = "hobo.code.agents.registry/v1" as const;

export interface EveAgentTree {
	readonly id: string;
	readonly path: string;
	readonly parentId?: string;
}

export type AgentsDestinationOk = { readonly ok: true } & AgentsInitDestination;

export interface AgentsDestinationFail {
	readonly ok: false;
	readonly reason: string;
	readonly remediation: readonly string[];
}

export type AgentsDestinationResult =
	| AgentsDestinationOk
	| AgentsDestinationFail;

export interface HarnessPlanEntry {
	readonly id: string;
	readonly kind: HarnessKind;
	readonly detected: boolean;
	readonly hunks: readonly HarnessHunk[];
	readonly notes: readonly string[];
	readonly skipReason?: string;
}

export interface AgentsInitPlan {
	readonly schema: typeof AGENTS_INIT_SCHEMA;
	readonly ok: boolean;
	readonly reason: string;
	readonly destination?: AgentsInitDestination;
	readonly entries: readonly HarnessPlanEntry[];
	readonly remediation: readonly string[];
}

export interface AgentsInitApplyResult {
	readonly schema: typeof AGENTS_INIT_SCHEMA;
	readonly ok: boolean;
	readonly reason: string;
	readonly written: readonly string[];
	readonly skipped: readonly string[];
	readonly plan: AgentsInitPlan;
	readonly envScript?: string;
}

export interface AgentsInitOptions {
	readonly home: string;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	readonly ids?: readonly string[];
	readonly all?: boolean;
	readonly yes?: boolean;
	readonly reconfigure?: boolean;
	readonly sidecarUrl?: string;
	readonly probeOllamaHost?: (host: string) => Promise<boolean>;
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/u, "");
}

function asOpenAiUrl(url: string): string {
	const trimmed = stripTrailingSlash(url);
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function asAnthropicUrl(url: string): string {
	const trimmed = stripTrailingSlash(url);
	if (trimmed.endsWith("/coding-agent")) return trimmed;
	if (trimmed.endsWith("/v1")) return `${trimmed.slice(0, -3)}/coding-agent`;
	return `${trimmed}/coding-agent`;
}

export async function resolveAgentsDestination(options: {
	readonly env: NodeJS.ProcessEnv;
	readonly sidecarUrl?: string;
	readonly probeOllamaHost?: (host: string) => Promise<boolean>;
}): Promise<AgentsDestinationResult> {
	const env = options.env;
	const sidecar = options.sidecarUrl?.trim();
	if (sidecar && sidecar.length > 0) {
		const openaiUrl = asOpenAiUrl(sidecar);
		return {
			ok: true,
			source: "sidecar",
			openaiUrl,
			anthropicUrl: asAnthropicUrl(sidecar),
			namedUrl: sidecar,
			envKey: "HOBO_CODE_SESSION_REF",
		};
	}
	const local = env.HOBO_CODE_LOCAL_BASE_URL?.trim();
	if (local) {
		return {
			ok: true,
			source: "local-base-url",
			openaiUrl: asOpenAiUrl(local),
			anthropicUrl: asAnthropicUrl(local),
			namedUrl: local,
			envKey: "HOBO_CODE_SESSION_REF",
		};
	}
	const openai = env.OPENAI_BASE_URL?.trim();
	if (openai) {
		return {
			ok: true,
			source: "openai-base-url",
			openaiUrl: asOpenAiUrl(openai),
			anthropicUrl: asAnthropicUrl(openai),
			namedUrl: openai,
			envKey: "HOBO_CODE_SESSION_REF",
		};
	}
	const explicitOllama = env.OLLAMA_HOST?.trim();
	if (explicitOllama) {
		return {
			ok: true,
			source: "ollama",
			openaiUrl: asOpenAiUrl(explicitOllama),
			anthropicUrl: asAnthropicUrl(explicitOllama),
			namedUrl: explicitOllama,
			envKey: "HOBO_CODE_SESSION_REF",
		};
	}
	const probeDisabled =
		env.HOBO_CODE_AGENTS_PROBE === "0" ||
		env.HOBO_CODE_AGENTS_PROBE === "false";
	const probe =
		options.probeOllamaHost ??
		(async (host) => (await probeOllama(host, 800)).ok);
	if (!probeDisabled && (await probe(DEFAULT_OLLAMA_HOST))) {
		return {
			ok: true,
			source: "ollama",
			openaiUrl: asOpenAiUrl(DEFAULT_OLLAMA_HOST),
			anthropicUrl: asAnthropicUrl(DEFAULT_OLLAMA_HOST),
			namedUrl: DEFAULT_OLLAMA_HOST,
			envKey: "HOBO_CODE_SESSION_REF",
		};
	}
	return {
		ok: false,
		reason: "no model listen URL — refuse to write harness configs",
		remediation: [
			"hobo-code models",
			"export OPENAI_BASE_URL=http://127.0.0.1:11434/v1",
			"ollama serve",
		],
	};
}

export function discoverEveAgentTrees(cwd: string): readonly EveAgentTree[] {
	const root = join(cwd, "agent");
	if (!existsSync(root) || !statSync(root).isDirectory()) return [];
	const trees: EveAgentTree[] = [{ id: "agent", path: root }];
	const sub = join(root, "subagents");
	if (existsSync(sub) && statSync(sub).isDirectory()) {
		for (const name of readdirSync(sub)) {
			const path = join(sub, name);
			if (!statSync(path).isDirectory()) continue;
			trees.push({ id: name, path, parentId: "agent" });
		}
	}
	return trees;
}

function catalogFor(options: {
	readonly hoboHome?: string;
	readonly cwd: string;
	readonly home: string;
	readonly env: NodeJS.ProcessEnv;
}) {
	return loadHarnessCatalog({
		cwd: options.cwd,
		...(options.hoboHome !== undefined
			? { hoboHome: options.hoboHome }
			: undefined),
	});
}

function detectedIds(options: AgentsInitOptions): Set<string> {
	const specs = catalogFor(options);
	const probes = defaultProbes(options.env);
	const ids = new Set<string>();
	for (const spec of specs) {
		if (isHostSpec(spec) || spec.kind === "inference") continue;
		if (specEvidence(spec, probes, options.cwd).length === 0) continue;
		ids.add(spec.id);
	}
	return ids;
}

function detectedKind(options: AgentsInitOptions, id: string): HarnessKind {
	const spec = catalogFor(options).find((row) => row.id === id);
	return spec ? pickKindFromSpec(spec) : "coding-cli";
}

function selectedIds(
	options: AgentsInitOptions,
	detected: Set<string>,
): string[] {
	const specs = catalogFor(options);
	if (options.all === true) {
		return specs
			.filter((spec) => !isHostSpec(spec) && spec.kind !== "inference")
			.map((spec) => spec.id);
	}
	if (options.ids && options.ids.length > 0) {
		return [...options.ids];
	}
	return [...detected];
}

function hunksFor(
	id: string,
	ctx: {
		readonly home: string;
		readonly dest: AgentsInitDestination;
		readonly cwd: string;
		readonly force?: boolean;
		readonly hoboHome?: string;
	},
) {
	const spec = loadHarnessCatalog({
		cwd: ctx.cwd,
		...(ctx.hoboHome !== undefined ? { hoboHome: ctx.hoboHome } : undefined),
	}).find((row) => row.id === id);
	if (!spec) {
		return {
			kind: "coding-cli",
			hunks: [
				{
					path: join(ctx.home, `.${id}`),
					action: "note",
					summary: `${id} — drop a JSON plugin in harnesses/ or $HOBO_HOME/durable/code/harnesses/`,
					after: `base_url=${ctx.dest.openaiUrl}\nenv_key=${ctx.dest.envKey}`,
				},
			],
			notes: [`unknown harness ${id} — no plugin`],
		};
	}
	return planSpecHunks(spec, ctx);
}

export async function planAgentsInit(
	options: AgentsInitOptions,
): Promise<AgentsInitPlan> {
	const destResult = await resolveAgentsDestination({
		env: options.env,
		...(options.sidecarUrl !== undefined
			? { sidecarUrl: options.sidecarUrl }
			: undefined),
		...(options.probeOllamaHost !== undefined
			? { probeOllamaHost: options.probeOllamaHost }
			: undefined),
	});
	if (!destResult.ok) {
		return {
			schema: AGENTS_INIT_SCHEMA,
			ok: false,
			reason: destResult.reason,
			entries: [],
			remediation: destResult.remediation,
		};
	}
	const dest: AgentsInitDestination = {
		source: destResult.source,
		openaiUrl: destResult.openaiUrl,
		anthropicUrl: destResult.anthropicUrl,
		namedUrl: destResult.namedUrl,
		envKey: destResult.envKey,
	};
	const detected = detectedIds(options);
	const selected = selectedIds(options, detected);
	if (selected.length === 0) {
		return {
			schema: AGENTS_INIT_SCHEMA,
			ok: false,
			reason: "no harnesses selected — pass ids or --all",
			destination: dest,
			entries: [],
			remediation: ["hobo-code agents init --all", "install codex or claude"],
		};
	}
	const entries = selected.map((id) => {
		const planned = hunksFor(id, {
			home: options.home,
			dest,
			cwd: options.cwd,
			...(options.reconfigure === true ? { force: true } : undefined),
			...(options.hoboHome !== undefined
				? { hoboHome: options.hoboHome }
				: undefined),
		});
		const skipped = planned.hunks.some((hunk) =>
			hunk.summary.startsWith("skip"),
		);
		const entry: HarnessPlanEntry = {
			id,
			// SAFETY: hunksFor derives kind from the catalog HarnessKind union.
			kind: planned.kind as HarnessKind,
			detected: detected.has(id),
			// SAFETY: hunksFor returns HarnessHunk records for this catalog id.
			hunks: planned.hunks as readonly HarnessHunk[],
			notes: planned.notes,
		};
		if (!skipped) return entry;
		return { ...entry, skipReason: "unparseable_config" };
	});
	return {
		schema: AGENTS_INIT_SCHEMA,
		ok: true,
		reason: "planned",
		destination: dest,
		entries,
		remediation: [],
	};
}

export function agentsRegistryPath(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "agents", "registry.json");
}

function writeRegistry(
	hoboHome: string,
	plan: AgentsInitPlan,
	written: readonly string[],
): void {
	const dest = plan.destination;
	if (!dest) return;
	const path = agentsRegistryPath(hoboHome);
	mkdirSync(dirname(path), { recursive: true });
	const body = {
		schema: AGENTS_REGISTRY_SCHEMA,
		destination: {
			source: dest.source,
			namedUrl: dest.namedUrl,
			openaiUrl: dest.openaiUrl,
			anthropicUrl: dest.anthropicUrl,
			envKey: dest.envKey,
		},
		agents: plan.entries.map((entry) => ({
			id: entry.id,
			kind: entry.kind,
			detected: entry.detected,
			paths: entry.hunks.map((hunk) => hunk.path),
		})),
		written,
		updatedAt: new Date().toISOString(),
	};
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export async function applyAgentsInit(
	options: AgentsInitOptions,
): Promise<AgentsInitApplyResult> {
	const plan = await planAgentsInit(options);
	if (!plan.ok) {
		return {
			schema: AGENTS_INIT_SCHEMA,
			ok: false,
			reason: plan.reason,
			written: [],
			skipped: [],
			plan,
		};
	}
	const writable = plan.entries.flatMap((entry) =>
		entry.hunks.filter(
			(hunk) => hunk.action === "create" || hunk.action === "edit",
		),
	);
	if (writable.length === 0) {
		return {
			schema: AGENTS_INIT_SCHEMA,
			ok: true,
			reason: "already_configured",
			written: [],
			skipped: plan.entries.map((entry) => entry.id),
			plan,
		};
	}
	if (options.yes !== true) {
		return {
			schema: AGENTS_INIT_SCHEMA,
			ok: true,
			reason: "needs_confirm",
			written: [],
			skipped: [],
			plan,
		};
	}
	const written: string[] = [];
	const skipped: string[] = [];
	for (const hunk of writable) {
		if (hunk.action === "note") continue;
		try {
			mkdirSync(dirname(hunk.path), { recursive: true });
			if (existsSync(hunk.path)) {
				copyFileSync(hunk.path, `${hunk.path}.bak`);
			}
			writeFileSync(hunk.path, hunk.after, "utf8");
			written.push(hunk.path);
		} catch {
			skipped.push(hunk.path);
		}
	}
	let envScript: string | undefined;
	if (options.hoboHome) {
		writeRegistry(options.hoboHome, plan, written);
		envScript = writeAgentsEnvScript(options.hoboHome);
	}
	return {
		schema: AGENTS_INIT_SCHEMA,
		ok: skipped.length === 0,
		reason:
			written.length > 0 ? "coding_agents_configured" : "unparseable_config",
		written,
		skipped,
		plan,
		...(envScript !== undefined ? { envScript } : undefined),
	};
}

function writeAgentsEnvScript(hoboHome: string): string | undefined {
	const session = readAuthSession(hoboHome);
	if (!session?.sessionRef) return undefined;
	const path = join(hoboHome, "durable", "code", "agents", "env.sh");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`export HOBO_CODE_SESSION_REF=${JSON.stringify(session.sessionRef)}\n`,
		"utf8",
	);
	return path;
}

export async function promptAgentChecklist(
	picks: readonly AgentPick[],
	io: {
		readonly stdin: NodeJS.ReadStream;
		readonly stdout: NodeJS.WriteStream;
	},
): Promise<readonly string[] | null> {
	let state = createChecklist(picks);
	const stdin = io.stdin;
	const raw = stdin.setRawMode instanceof Function;
	if (raw) stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");
	let painted = 0;
	const paint = () => {
		const next = repaintAgentChecklist(painted, renderAgentChecklist(state));
		io.stdout.write(next.write);
		painted = next.lines;
	};
	paint();
	try {
		while (!state.done) {
			const key = await new Promise<string>((resolve) => {
				stdin.once("data", (chunk) => resolve(String(chunk)));
			});
			state = reduceChecklistKey(state, key);
			if (!state.done) paint();
		}
	} finally {
		io.stdout.write(eraseAgentChecklist(painted));
		if (raw) stdin.setRawMode(false);
		stdin.pause();
	}
	if (state.done === "abort") return null;
	return selectedPickIds(state);
}

export async function runAgentsCli(options: {
	readonly hoboHome: string;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly args: readonly string[];
	readonly flags: { [name: string]: string | boolean };
	readonly tty?: boolean;
	readonly choosePicks?: (
		picks: readonly AgentPick[],
	) => Promise<readonly string[] | null>;
}): Promise<{
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly data: JsonValue;
}> {
	const sub = options.args[0] ?? "list";
	const rest = (
		sub === "init" || sub === "list" || sub === "status"
			? options.args.slice(1)
			: options.args
	).filter((id) => !isSelfHarness(id));
	const home = options.env.HOME ?? options.cwd;
	const sidecar = isJsonString(options.flags.base)
		? options.flags.base
		: undefined;
	const common = {
		home,
		cwd: options.cwd,
		env: options.env,
		hoboHome: options.hoboHome,
		ids: rest,
		all: options.flags.all === true,
		reconfigure: options.flags.reconfigure === true,
		...(sidecar !== undefined ? { sidecarUrl: sidecar } : undefined),
	};
	if (sub === "init") {
		const dry = options.flags["dry-run"] === true;
		const tty = options.tty === true;
		const writeNow = shouldWriteAgentsInit({
			flags: options.flags,
			tty,
			env: options.env,
			dryRun: dry,
		});
		let ids = rest;
		if (ids.length === 0) {
			const defaults = buildAgentPicks({
				home,
				cwd: options.cwd,
				env: options.env,
				all: options.flags.all === true,
				eveTrees: discoverEveAgentTrees(options.cwd),
			});
			ids = defaults
				.filter((pick) => pick.selected && !isSelfHarness(pick.id))
				.map((pick) => pick.id);
		}
		if (!dry && !writeNow && tty) {
			const picks = buildAgentPicks({
				home,
				cwd: options.cwd,
				env: options.env,
				all: options.flags.all === true,
				ids: rest,
				eveTrees: discoverEveAgentTrees(options.cwd),
			});
			const chosen = options.choosePicks
				? await options.choosePicks(picks)
				: await promptAgentChecklist(picks, {
						stdin: process.stdin,
						stdout: process.stdout,
					});
			if (chosen === null) {
				return {
					ok: false,
					code: "HOBO_CODE_AGENTS_ABORTED",
					message: panelish("◎ agents init", "aborted — nothing written"),
					data: cloneAsJson({ picks }),
				};
			}
			ids = [...chosen];
		}
		const applied = await applyAgentsInit({
			...common,
			ids,
			yes: dry ? false : writeNow || tty,
		});
		if (dry) {
			const text = panelish(
				"◎ agents init · dry-run",
				formatAgentsInitPlan(applied.plan),
			);
			return {
				ok: applied.plan.ok,
				code: applied.plan.ok
					? "HOBO_CODE_AGENTS_PLAN"
					: "HOBO_CODE_AGENTS_NO_DEST",
				message: text,
				data: cloneAsJson(applied.plan),
			};
		}
		if (applied.reason === "needs_confirm") {
			return {
				ok: true,
				code: "HOBO_CODE_AGENTS_PLAN",
				message: panelish(
					"◎ agents init",
					`${formatAgentsInitPlan(applied.plan)}\nre-run with --yes to write (never mints a key)`,
				),
				data: cloneAsJson(applied.plan),
			};
		}
		return {
			ok: applied.ok,
			code: applied.ok ? "HOBO_CODE_AGENTS" : "HOBO_CODE_AGENTS_FAILED",
			message: panelish(
				applied.ok ? "✓ agents init" : "✕ agents init",
				applied.reason === "already_configured"
					? "already configured — pass --reconfigure to rewrite"
					: [
							applied.reason,
							...applied.written.map((path) => `wrote ${path}`),
							applied.envScript
								? `source ${applied.envScript}  # Codex/Claude read HOBO_CODE_SESSION_REF`
								: "hobo-code auth login --agent  # then re-run init so env.sh can export the session-ref",
						]
							.filter((row) => row.length > 0)
							.join("\n"),
			),
			data: cloneAsJson(applied),
		};
	}
	const plan = await planAgentsInit(common);
	const registryPath = agentsRegistryPath(options.hoboHome);
	let registered: { readonly agents?: unknown } | null = null;
	if (existsSync(registryPath)) {
		// SAFETY: agents registry JSON is the on-disk { agents } document.
		registered = JSON.parse(readFileSync(registryPath, "utf8")) as {
			readonly agents?: unknown;
		};
	}
	const title = sub === "status" ? "◎ agents status" : "◎ agents";
	return {
		ok: true,
		code: "HOBO_CODE_AGENTS",
		message: panelish(
			title,
			[
				formatAgentsInitPlan(
					plan.ok
						? plan
						: {
								...plan,
								ok: true,
								reason: "inventory",
								entries: [...detectedIds(common)].map((id) => ({
									id,
									kind: detectedKind(common, id),
									detected: true,
									hunks: [],
									notes: [],
								})),
							},
				),
				registered
					? `registry · ${registryPath}`
					: "registry · none yet — hobo-code agents init",
			].join("\n"),
		),
		data: cloneAsJson({ plan, registered }),
	};
}

function panelish(title: string, body: string): string {
	const rows = body.split("\n").filter((row) => row.length > 0);
	return [
		title,
		"·".repeat(16),
		...rows.map((row) => ` ${row}`),
		"─".repeat(16),
	].join("\n");
}

export function formatAgentsInitPlan(plan: AgentsInitPlan): string {
	if (!plan.ok) {
		return [plan.reason, ...plan.remediation.map((row) => `  ${row}`)].join(
			"\n",
		);
	}
	const dest = plan.destination;
	const lines = [
		dest ? `dest · ${dest.source} · ${dest.namedUrl}` : "dest · none",
		dest ? `env  · ${dest.envKey}` : "",
	].filter((row) => row.length > 0);
	for (const entry of plan.entries) {
		lines.push(
			`${entry.id} · ${entry.kind}${entry.detected ? " · detected" : ""}${
				entry.skipReason ? ` · ${entry.skipReason}` : ""
			}`,
		);
		for (const hunk of entry.hunks) {
			lines.push(`  ${hunk.action} ${hunk.path}`);
			lines.push(`  ${hunk.summary}`);
		}
	}
	return lines.join("\n");
}
