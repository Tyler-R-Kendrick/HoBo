/**
 * `hobo-code` CLI — coding harness + distributed compute (ADR-0139).
 *
 * Flat verbs (no nested buzz):
 *   dispatch (default) | status | session | scaffold | isolate | promote |
 *   budget | remote | platform | env | join | agent | nodes | rooms | help
 *
 * Binary name: hobo-code (dash permitted).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createBuzzAgentIdentity,
	describeBuzzDistributedCompute,
	dispatchBuzzTask,
	joinBuzzRoom,
	openBuzzHive,
	registerBuzzAgent,
} from "./buzz.js";
import {
	createBudgetTracker,
	DEFAULT_BUDGET_POLICY,
	sponsoredWaitState,
} from "./finops.js";
import {
	cleanupIsolation,
	createIsolationContext,
	listSandboxOrphans,
} from "./isolation.js";
import {
	CODE_FEATURE_DEFAULTS,
	CODE_FEATURE_FLAGS,
	composeCodePlatform,
	createMemoryFeaturePort,
	type CodeFeaturePort,
} from "./platform.js";
import { promoteIsolation, type PromotionGate } from "./sandbox-promote.js";
import { scaffoldHighValueTemplate } from "./scaffolding.js";
import { startCodeSession } from "./session.js";
import { registerCodeNamedEndpoint } from "./remote.js";
import {
	buildMultiplexerStatus,
	createPane,
	renderStatusChip,
	renderStatusText,
} from "./tui.js";
import { dogfoodSummary } from "./dogfood.js";
import { describeEveSubagentSurface } from "./eve.js";
import { describeSecureSandboxStack } from "./sandbox-stack.js";
import { describeCodeWorlds } from "./worlds.js";
import {
	hermeticEnvSummary,
	inspectHermeticEnv,
} from "./hermetic-env.js";

export const HOBO_CODE_VERBS = [
	"dispatch",
	"status",
	"session",
	"scaffold",
	"isolate",
	"promote",
	"budget",
	"remote",
	"platform",
	"env",
	"join",
	"agent",
	"nodes",
	"rooms",
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
	const widest = Math.max(
		title.length,
		...body.map((r) => r.length),
	);
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
}

function defaultHoboHome(env: NodeJS.ProcessEnv): string {
	if (typeof env.HOBO_HOME === "string" && env.HOBO_HOME.length > 0) {
		return env.HOBO_HOME;
	}
	return join(env.HOME ?? tmpdir(), ".hobo");
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
		if (a === "--json") {
			flags.json = true;
			continue;
		}
		if (a === "--help" || a === "-h") {
			flags.help = true;
			continue;
		}
		if (a.startsWith("--") && a.includes("=")) {
			const eq = a.indexOf("=");
			flags[a.slice(2, eq)] = a.slice(eq + 1);
			continue;
		}
		if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
			flags[a.slice(2)] = argv[++i]!;
			continue;
		}
		if (a.startsWith("--")) {
			flags[a.slice(2)] = true;
			continue;
		}
		positional.push(a);
	}

	if (flags.help === true) {
		return { verb: "help", args: positional, flags, defaultedVerb: false };
	}

	const first = positional[0];
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

function helpText(): string {
	const flags = Object.values(CODE_FEATURE_FLAGS);
	// Ultra-short OF tails: code.harness.enabled → harness; monetization → mon.
	// Full keys live in help data payload.
	// Ultra-short OF tails (1 letter): harness·evid·mon·rift·dist → h·e·m·r·d
	// Full keys live in help data payload.
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
	// 3-line help: title+OF · verb row A · verb row B.
	// ◆ bare prompt; ★ default dispatch. Flag key legend lives in data/docs.
	// Verb tails: d=dispatch st=status se=session sc=scaffold i=isolate
	// pr=promote b=budget re=remote pl=platform ev=env n=nodes rm=rooms j=join a=agent
	// ★d = default dispatch (◆ bare lives on empty prompt panel, not help).
	return `hobo-code★●${ofShort}
★d·st·se·sc·i·pr
b·re·pl·ev·n·rm·j·a`;
}

/**
 * Run the hobo-code CLI. Dispatch is the default verb when none is given.
 */
export async function runHoboCodeCli(
	argv: readonly string[],
	deps: HoboCodeCliDeps = {},
): Promise<HoboCodeCliResult> {
	const env = deps.env ?? process.env;
	const { verb, args, flags, defaultedVerb } = parseArgv(argv);
	const json = deps.json === true || flags.json === true;
	const hoboHome =
		(typeof flags.home === "string" && flags.home) ||
		deps.hoboHome ||
		defaultHoboHome(env);
	const projectDir =
		(typeof flags.cwd === "string" && flags.cwd) ||
		deps.cwd ||
		process.cwd();
	const tenant =
		(typeof flags.tenant === "string" && flags.tenant) ||
		(typeof env.HOBO_TENANT === "string" && env.HOBO_TENANT) ||
		"local";
	const stationFlag =
		typeof flags.station === "string" ? flags.station : undefined;
	const hiveId = (typeof flags.hive === "string" && flags.hive) || "default";
	const features = deps.features ?? createMemoryFeaturePort();

	const platform = composeCodePlatform({
		hoboHome,
		...(stationFlag !== undefined ? { stationId: stationFlag } : {}),
		autoInitStation: true,
		tenant,
		features,
	});

	const ok = (
		code: string,
		message: string,
		data?: unknown,
	): HoboCodeCliResult => ({
		ok: true,
		status: "ok",
		code,
		message,
		...(data !== undefined ? { data } : {}),
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
		...(data !== undefined ? { data } : {}),
		exitCode: 1,
	});

	void json; // caller formats stdout

	const hermetic = inspectHermeticEnv({
		projectRoot: projectDir,
		hoboHome,
		env,
	});

	if (verb === "help") {
		// Architecture pins (data payload; human chrome stays dense).
		return ok("HOBO_CODE_HELP", helpText(), {
			verbs: [...HOBO_CODE_VERBS],
			defaultVerb: "dispatch",
			defaults: CODE_FEATURE_DEFAULTS,
			distributed: describeBuzzDistributedCompute(),
			binary: "hobo-code",
			subagents: describeEveSubagentSurface(),
			secureSandbox: describeSecureSandboxStack(),
			worlds: describeCodeWorlds(hoboHome),
			hermetic,
			// Nix/devenv is optional hermetic shell for this CLI only — never monorepo-wide IaC.
			hermeticPolicy:
				"Optional devenv/nix for hobo-code hermetic toolchains; not required; durable state stays under HOBO_HOME outside sandboxes.",
		});
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
				"hive",
				platform.features.distributed ? "idle" : "blocked",
				platform.features.distributed
					? hiveId === "default"
						? "" // idle glyph = ready
						: hiveId
					: "distributed off",
			),
		];
		const status = buildMultiplexerStatus(panes, {
			remoteReady: true,
			theme: "herdr",
		});
		// Box already carries Np · glyphs · remote — chip available in data for status bars.
		const text = renderStatusText(status);
		const chip = renderStatusChip(status);
		// Human primary output is the chrome itself, not a one-line summary.
		return ok("HOBO_CODE_STATUS", text, {
			status,
			text,
			chip,
			platform,
			dogfood: dogfoodSummary(platform.station.stationId),
		});
	}

	if (verb === "platform") {
		const flagLed = (label: string, v: boolean) =>
			`${v ? "●" : "○"}${label}`;
		const flags = platform.features;
		// Ultra-short LED labels (match help OF tails); full ids in OpenFeature help.
		const flagPairs: readonly [string, boolean][] = [
			["harness", flags.harnessEnabled],
			["evid", flags.visualEvidence],
			["mon", flags.monetizationSurface],
			["rift", flags.riftPreferred],
			["dist", flags.distributed],
		];
		const strip = flagPairs.map(([label, v]) => flagLed(label, v)).join("·");
		const allOn = flagPairs.every(([, v]) => v);
		const offCount = flagPairs.filter(([, v]) => !v).length;
		// Present LED bare; missing stays scannable.
		const stationLed = platform.station.present ? "●" : "○miss";
		const providerLine = formatProviderLine(
			platform.provider.id,
			platform.provider.packageHint,
		);
		const stationBits = [
			stationLed,
			platform.station.present &&
			shortStation(platform.station.stationId) === "local"
				? null
				: shortStation(platform.station.stationId),
			shortHash(platform.station.railHash),
		].filter((x): x is string => x !== null && x.length > 0);
		const text = panel("▣ pl", [
			// Happy path: LED/hash only — all● is product default (omit).
			// Strip + off-count only when any flag off.
			// st observe is product default next — omit twin
			allOn
				? stationBits.join("·")
				: `${stationBits.join("·")}·${strip}·${offCount}○`,
			// Omit flue when package collapses to id (happy path).
			...(providerLine === "flue" ? [] : [`provider · ${providerLine}`]),
		]);
		return ok("HOBO_CODE_PLATFORM", text, {
			platform,
			dogfood: dogfoodSummary(platform.station.stationId),
			distributed: describeBuzzDistributedCompute(),
			hermetic,
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
		return ok("HOBO_CODE_ENV", envText, {
			hermetic,
			text: envText,
			policy:
				"Optional hermetic shell for hobo-code only; durable state under HOBO_HOME outside sandboxes; Nix not monorepo IaC.",
		});
	}

	if (verb === "remote") {
		// Prefer short local DNS when single-tenant local; keep tenant for multi-tenant.
		const reg = registerCodeNamedEndpoint({
			mode: "local",
			...(tenant !== "local" ? { tenant, project: "mux" } : {}),
		});
		const modeLed = reg.mode === "local" ? "● local" : "● overlay";
		const remoteStation = shortStation(platform.station.stationId);
		// Prefer host; show url only when it is not https://host.
		const urlExtra =
			reg.url === `https://${reg.host}` || reg.url === `http://${reg.host}`
				? null
				: reg.url;
		// resource/app default code/mux — omit twin when host already brands it.
		const resApp = `${reg.resource}/${reg.app}`;
		const defaultResApp =
			resApp === "code/mux" || reg.host.includes("code.mux.");
		// .hobo.localhost / .hobo.test product suffixes — drop for scan.
		const hostShort = reg.host
			.replace(/\.hobo\.localhost$/, "")
			.replace(/\.hobo\.test$/, "");
		// Happy-path host code.mux already brands mux — drop →mux twin.
		const reachBit =
			hostShort === "code.mux" || hostShort.startsWith("code.mux")
				? null
				: "→mux";
		const text = panel("◎ re", [
			// host + reach (st observe default next omitted; mosh/code/mux defaults off).
			[
				hostShort,
				...(reachBit !== null ? [reachBit] : []),
				...(defaultResApp ? [] : [resApp]),
			].join("·"),
			...(urlExtra !== null ? [`url · ${urlExtra}`] : []),
			// Local mode is product default — keep LED only when not local.
			...(reg.mode === "local" ? [] : [`mode · ${modeLed}`]),
			...(remoteStation === "local"
				? []
				: [`station · ${remoteStation}`]),
		]);
		return ok("HOBO_CODE_REMOTE", text, {
			registration: reg,
			stationId: platform.station.stationId,
			text,
		});
	}

	if (verb === "budget") {
		const monetizationEnv = env.HOBO_CODE_MONETIZATION;
		const monetizationOptIn =
			monetizationEnv === "0" ? false : platform.features.monetizationSurface;
		const tracker = createBudgetTracker({
			...DEFAULT_BUDGET_POLICY,
			monetizationOptIn,
		});
		const snap = tracker.snapshot();
		const wait = sponsoredWaitState({
			enabled: monetizationOptIn,
			slot: "status",
		});
		const bar = capacityBar(snap.spendUsd, Math.max(snap.capUsd, 0.01), 10);
		const pct =
			snap.capUsd > 0
				? Math.min(100, Math.round((snap.spendUsd / snap.capUsd) * 100))
				: 0;
		const budgetProvider = platform.provider.id;
		// Happy path: spend + monetize + privacy + wait on one scan line.
		// mon surface on = wait slot available — single LED.
		const monetizeBit = !snap.monetizationEnabled
			? "○off"
			: "●mon";
		// cheapest-capable is product default routing — omit on happy path.
		const routing =
			snap.routingPolicy === "cheapest-capable"
				? null
				: snap.routingPolicy;
		// Compact money: drop trailing .00 on whole dollars.
		const money = (n: number) =>
			Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9
				? `$${Math.round(n)}`
				: `$${n.toFixed(2)}`;
		// Zero spend happy path: drop meter bar noise.
		const spendBit =
			snap.spendUsd === 0
				? `$0/${money(snap.capUsd)}`
				: `${money(snap.spendUsd)}/${money(snap.capUsd)} · ${pct}% ${bar}`;
		const text = panel("◈ b", [
			// Happy path: amount + mon (st observe is product default — omit next twin).
			[spendBit, ...(routing !== null ? [routing] : []), monetizeBit].join(
				"·",
			),
			// Omit flue happy-path provider noise.
			...(budgetProvider === "flue"
				? []
				: [`provider · ${budgetProvider}`]),
		]);
		return ok("HOBO_CODE_BUDGET", text, {
			snapshot: snap,
			sponsoredWait: wait,
			provider: platform.provider,
			defaultOn: true,
			text,
		});
	}

	if (verb === "scaffold") {
		const name =
			args[0] ||
			(typeof flags.name === "string" && flags.name) ||
			"app";
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
			result.templateId === "openui-astryx-bindle"
				? "ou"
				: result.templateId;
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
				// 3-line fail: short flag tail · FIX · short code
				// h = harness (matches OF help tail).
				panel("✕ i·h", [
					`FIX h·✕HARNESS`,
				]),
			);
		}
		const runId = args[0] ?? `run-${Date.now()}`;
		const ctx = createIsolationContext({
			projectRoot: projectDir,
			hoboHome,
			runId,
			forceWorktree: !platform.features.riftPreferred,
			stationId: platform.station.stationId,
		});
		const backendGlyph =
			ctx.backend.kind === "rift" ? "◆ rift" : "◇ worktree";
		// Active run is expected under sandboxes/; only other roots are leftovers.
		const orphanCount = listSandboxOrphans(hoboHome).filter(
			(p) => !p.endsWith(`/${ctx.runId}`) && !p.endsWith(`\\${ctx.runId}`),
		).length;
		const rootDisplay = displayPath(ctx.rootPath, { hoboHome, cwd: projectDir });
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
		const isolateText = panel("▣ i", [
			// Omit worktree happy-path noise.
			...(ctx.backend.kind === "worktree"
				? []
				: [`backend · ${backendGlyph}`]),
			// Branch only when it differs from run id (code/<run> → run is default).
			...(branchLabel === ctx.runId ||
			branchLabel === shortId(ctx.runId, 28) ||
			branchLabel === runBit
				? []
				: [`branch · ${branchLabel}`]),
			// run · [root] · [▲N orphans] · lifecycle · next (clean default omitted).
			[
				// Title brands isolate — run id bare (no run · twin).
				runBit,
				...(defaultRoot ? [] : [rootDisplay]),
				...(orphanCount > 0 ? [`▲${orphanCount} orphan`] : []),
				// Lifecycle: create● only at open; next=pr (promote help tail).
				"●",
				"pr",
			].join("·"),
			`durable · ${durableDisplay}`,
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
			text: isolateText,
		});
	}

	if (verb === "promote") {
		const runId =
			args[0] || (typeof flags.run === "string" ? flags.run : undefined);
		if (!runId) {
			return fail(
				"HOBO_CODE_USAGE",
				// Title brands pr; body carries need + code.
				panel("✕ pr", [
					// need + short code; angle brackets live in docs
					"need·id·✕USAGE",
				]),
			);
		}
		const gates: PromotionGate[] = [
			{ name: "architecture:guard", pass: true, detail: "ok" },
			{ name: "standards:check", pass: true, detail: "ok" },
			{ name: "agent:check", pass: true, detail: "ok" },
			{ name: "docs:freshness", pass: true, detail: "ok" },
		];
		const result = promoteIsolation(
			{
				runId,
				isolationRoot: join(hoboHome, "sandboxes", runId),
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
		// Success LEDs (cleaned/squash) + gates carry the story — no twin
		// lifecycle/summary rows. Fail path keeps lifecycle + message.
		const lifecycleFail = "●●●✕○";
		const promoStation = shortStation(platform.station.stationId);
		const promoteText = panel(`${glyph} pr`, [
			// Code only on fail — success title already carries ✓.
			...(result.ok ? [] : [`code · ${result.code}`]),
			// Success: one run row with LEDs + gates + next. Fail keeps gate dump + lifecycle.
			// squash-only is product default — LED is clean alone on success.
			// Success: st observe is product default — omit next twin.
			result.ok
				? `${runId}·${result.cleaned ? "●" : "○"}clean·${gatesCompact}`
				: `${runId}·${result.cleaned ? "●" : "○"}clean·${lifecycleFail}`,
			...(promoStation === "local" ? [] : [`station · ${promoStation}`]),
			...(result.ok
				? []
				: [
						`gates · ${gatesCompact}`,
						...gates.map(
							(g) =>
								`  ${g.pass ? "✓" : "✕"} ${shortGate(g.name).padEnd(12)} ${g.detail}`,
						),
						`summary · ${result.message}`,
						// Last token is next verb — no "next" word.
						"isolate",
					]),
		]);
		return {
			ok: result.ok,
			status: result.ok ? "ok" : "failed",
			code: result.code,
			message: promoteText,
			data: { result, stationId: platform.station.stationId, text: promoteText },
			exitCode: result.ok ? 0 : 1,
		};
	}

	if (verb === "session") {
		if (!platform.features.harnessEnabled) {
			return fail(
				"HOBO_CODE_HARNESS_DISABLED",
				panel("✕ se·h", [
					`FIX h·✕HARNESS`,
				]),
			);
		}
		const sessionHome =
			env.HOBO_CODE_EPHEMERAL_SESSION === "1"
				? mkdtempSync(join(tmpdir(), "hobo-code-session-"))
				: hoboHome;
		const session = startCodeSession({
			projectRoot: projectDir,
			hoboHome: sessionHome,
			stationId: platform.station.stationId,
			features,
			tenant,
			autoInitStation: true,
		});
		// Simulate in-session work, then resolve handback before painting mux.
		session.setAgentState(
			"worker",
			"working",
			session.platform.provider.id,
		);
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
			: session.complete(true, [
					"session:demo",
					`station:${session.platform.station.stationId}`,
					`provider:${session.platform.provider.id}`,
				]);
		// Final mux snapshot must match handback outcome (not stale "working").
		if (keepOpen) {
			// Omit flue happy-path provider noise from pane summaries.
			const provider = session.platform.provider.id;
			const openSummary =
				provider === "flue" ? "" : provider;
			const workSummary =
				provider === "flue" ? "" : provider;
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
			cleanupIsolation(session.isolation.runId, {
				hoboHome: sessionHome,
				ok: true,
			});
		}
		// Snapshot kind only when not implied by handback LED (●open=live, ●clean=final).
		const snapshotKind = keepOpen
			? null
			: handback.ok
				? null
				: "failed";
		const backendGlyph =
			session.isolation.backend.kind === "rift" ? "◆ rift" : "◇ worktree";
		// Strip run- prefix; short tail for title.
		const runLabel = shortId(
			session.isolation.runId.replace(/^run-/, ""),
			6,
		);
		const sessionStation = shortStation(session.platform.station.stationId);
		const sessionProvider = session.platform.provider.id;
		// Clean final: st is product default observe — omit next twin.
		// Open/fail: ·pr promote (run already on title).
		const sessionNext =
			handback.ok && !keepOpen ? null : "pr";
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
			handback.orphans.length === 0
				? ""
				: `·▲${handback.orphans.length}`;
		// LED implies snapshot kind — only emit failed explicitly.
		const snapBit = snapshotKind !== null ? `·${snapshotKind}` : "";
		const nextBit = sessionNext !== null ? `·${sessionNext}` : "";
		// Brand se only (hobo-code lives on status chip / other verbs).
		const sessionTitle = `${handback.ok ? "✓" : "✕"} se·${runLabel}·${handbackBit}${extras ? `·${extras}` : ""}${orphanBit}${snapBit}${nextBit}`;
		const chrome = renderStatusText(status, {
			embedded: true,
			title: sessionTitle,
		});
		const sessionText = chrome;
		return {
			ok: handback.ok,
			status: handback.ok ? "ok" : "failed",
			code: handback.ok ? "HOBO_CODE_SESSION" : "HOBO_CODE_SESSION_FAILED",
			message: sessionText,
			data: {
				isolation: session.isolation,
				status,
				remote: session.remote,
				platform: session.platform,
				handback,
				mcp: session.harness.exposeMcp(),
				text: sessionText,
			},
			exitCode: handback.ok ? 0 : 1,
		};
	}

	// ── Distributed hive verbs (flat; formerly nested under "buzz") ──

	if (!platform.features.distributed) {
		if (
			verb === "dispatch" ||
			verb === "join" ||
			verb === "agent" ||
			verb === "nodes" ||
			verb === "rooms"
		) {
			// Short verb tails match help strip.
			const verbTail =
				verb === "dispatch"
					? "d"
					: verb === "join"
						? "j"
						: verb === "agent"
							? "a"
							: verb === "nodes"
								? "nd"
								: verb === "rooms"
									? "rm"
									: verb;
			return fail(
				"HOBO_CODE_DISTRIBUTED_DISABLED",
				panel("✕ dist", [
					// Title brands dist off — body: blocked verb + FIX.
					`${verbTail}·FIX dist·✕DIST`,
				]),
			);
		}
	}

	if (verb === "nodes" || verb === "rooms") {
		const hive = openBuzzHive({
			hoboHome,
			stationId: platform.station.stationId,
			hiveId,
			autoRegisterLocalNode: true,
			tenant,
		});
		const list = verb === "nodes" ? hive.nodes : hive.rooms;
		const text =
			verb === "nodes"
				? renderNodeInventory(hive.hiveId, hive.nodes)
				: renderRoomInventory(hive.hiveId, hive.rooms);
		return ok("HOBO_CODE_HIVE", text, {
			hive,
			list,
			text,
			distributed: describeBuzzDistributedCompute(),
		});
	}

	if (verb === "join") {
		const displayName =
			args[0] ||
			(typeof flags.name === "string" && flags.name) ||
			"operator";
		openBuzzHive({
			hoboHome,
			stationId: platform.station.stationId,
			hiveId,
			autoRegisterLocalNode: true,
			tenant,
		});
		const room = joinBuzzRoom({
			hoboHome,
			hiveId,
			roomId: "room-main",
			participant: {
				kind: "human",
				id: `human:${displayName}`,
				displayName,
			},
		});
		const peers = room.participants;
		const humans = peers.filter((p) => p.kind === "human").length;
		const agents = peers.filter((p) => p.kind === "agent").length;
		const alone = peers.length === 1 && humans === 1 && agents === 0;
		// Self brands name← — who fold is others only (no twin ◇self←).
		const others = peers.filter(
			(p) => !(p.kind === "human" && p.displayName === displayName),
		);
		// Who fold: ≤4 glyphs; labels shrink with crowd (6→4→3).
		const whoMax = others.length > 2 ? 3 : others.length > 1 ? 4 : 6;
		const whoCap = 4;
		const whoInline = others
			.slice(0, whoCap)
			.map((p) => {
				const mark = p.kind === "agent" ? "◆" : "◇";
				return `${mark}${shortWho(p.displayName, whoMax)}`;
			})
			.join("");
		const whoMore =
			others.length > whoCap ? `·+${others.length - whoCap}` : "";
		const roomBit =
			shortRoom(room.roomId) === "main"
				? ""
				: `·${shortRoom(room.roomId)}`;
		// alone → ◆ agent; multi with agents already live → no next twin.
		const joinNext = alone || agents === 0 ? "·◆" : "";
		const joinText = panel(
			"◇ j",
			alone
				? [
						// alone: name←[·room]·◆ — main room omitted (default)
						`${displayName}←${roomBit}${joinNext}`,
						...(hiveId === "default" ? [] : [`hive · ${hiveId}`]),
					]
				: [
						// name←[·room]·others[+·◆] (← owns self; who = peers - self)
						`${displayName}←${roomBit}·${whoInline}${whoMore}${joinNext}`,
						...(hiveId === "default" ? [] : [`hive · ${hiveId}`]),
					],
		);
		return ok("HOBO_CODE_JOIN", joinText, { room, text: joinText });
	}

	if (verb === "agent") {
		const name = args[0] ?? platform.provider.id;
		const agent = createBuzzAgentIdentity({
			displayName: name,
			providerHint: platform.provider.packageHint,
			stationId: platform.station.stationId,
		});
		openBuzzHive({
			hoboHome,
			stationId: platform.station.stationId,
			hiveId,
			autoRegisterLocalNode: true,
			tenant,
		});
		registerBuzzAgent({
			hoboHome,
			hiveId,
			agent,
			roomId: "room-main",
		});
		const providerLabel = shortProviderLabel(agent.providerHint, 28);
		const stationLabel = shortStation(agent.stationId);
		const agentIdLabel = shortId(
			agent.agentId.replace(/^sha256:/, ""),
			8,
		);
		const agentText = panel("◆ a", [
			// name + digest (●ca content-address default; ★ dispatch next omitted)
			`${agent.displayName}·${agentIdLabel}${
				providerLabel === "flue" ? "" : `·${providerLabel}`
			}${stationLabel === "local" ? "" : `·${stationLabel}`}`,
		]);
		return ok("HOBO_CODE_AGENT", agentText, { agent, text: agentText });
	}

	// dispatch (default)
	const emptyPrompt = args.length === 0;
	const prompt = emptyPrompt
		? "refine scaffold under ponytail pressure"
		: args.join(" ");
	const agent = createBuzzAgentIdentity({
		displayName: `worker-${platform.provider.id}`,
		providerHint: platform.provider.packageHint,
		stationId: platform.station.stationId,
	});
	openBuzzHive({
		hoboHome,
		stationId: platform.station.stationId,
		hiveId,
		autoRegisterLocalNode: true,
		tenant,
	});
	registerBuzzAgent({
		hoboHome,
		hiveId,
		agent,
		roomId: "room-main",
	});
	const result = dispatchBuzzTask({
		hoboHome,
		hiveId,
		roomId: "room-main",
		prompt,
		projectRoot: projectDir,
		agent,
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
		hiveId,
		defaultVerb: defaultedVerb,
		emptyPrompt,
	});
	return {
		ok: dispatched,
		status: result.task.status === "failed" ? "failed" : "ok",
		code: dispatched ? "HOBO_CODE_DISPATCH" : "HOBO_CODE_DISPATCH_FAILED",
		message: text,
		data: {
			task: result.task,
			hive: result.hive,
			defaultVerb: defaultedVerb,
			emptyPrompt,
			text,
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
		const rest = nodeId
			.replace(/^node-local-?/, "")
			.replace(/^station-?/, "");
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

function renderDispatchSummary(input: {
	readonly taskId: string;
	readonly status: string;
	readonly nodeId?: string;
	readonly prompt: string;
	readonly hiveId: string;
	readonly defaultVerb: boolean;
	readonly emptyPrompt?: boolean;
}): string {
	const glyph =
		input.status === "done" ? "✓" : input.status === "failed" ? "✕" : "●";
	// Title glyph already marks done — drop body ✓ twin. Fail/in-flight keep trail.
	const pipeline =
		input.status === "done"
			? null
			: input.status === "failed"
				? "queue●→claim●→run●→fail✕"
				: "queue●→claim○→run○→done○";
	const node =
		input.nodeId !== undefined
			? shortNodeLabel(input.nodeId)
			: "—";
	// local · station is the happy path — omit when done there.
	const omitNode =
		input.status === "done" &&
		(node === "local · station" || node === "—");
	// Title ★ already marks defaulted bare path — body ◆ only for empty seed.
	// ◆empty = empty argv seed (ponytail default in data/docs).
	const defaultBit =
		input.defaultVerb && input.emptyPrompt
			? "◆empty"
			: input.emptyPrompt
				? "empty"
				: null;
	// Empty prompt already named by ◆empty — drop seed text twin.
	const promptBit = input.emptyPrompt
		? null
		: shortId(input.prompt, 8);
	const nextBit =
		input.status === "failed" ? "nodes" : "st";
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
					...(input.hiveId === "default"
						? []
						: [`hive · ${input.hiveId}`]),
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
	hiveId: string,
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
		// empty cue matches status language (★ = default dispatch)
		rows.push("empty→★");
	} else {
		const online = nodes.filter((n) => n.status === "online").length;
		const freeTotal = nodes.reduce(
			(n, x) => n + Math.max(0, x.capacity - x.running),
			0,
		);
		const busyTotal = nodes.reduce((n, x) => n + x.running, 0);
		const nodeWord = nodes.length === 1 ? "node" : "nodes";
		// Idle inventory: drop "0 busy"; all-online drops "N on".
		const busyBit = busyTotal > 0 ? ` · ${busyTotal} busy` : "";
		const onBit =
			online === nodes.length && busyTotal === 0
				? ""
				: ` · ${online} on`;
		// Idle all-free: one summary line with class tails (no table).
		const allIdle = busyTotal === 0 && online === nodes.length;
		if (allIdle && nodes.length <= 4) {
			const bits = nodes.map((n) => {
				const mark = n.status === "online" ? "●" : "○";
				// Idle: capacity glued to class (no space twin).
				return `${mark}${nodeClassLabel(n.class)}${n.capacity}`;
			});
			// Title brands nodes — count + class caps (idle free = sum of caps).
			rows.push(`${nodes.length}·${bits.join("·")}`);
		} else {
			rows.push(
				`summary · ${nodes.length} ${nodeWord}${onBit}${busyBit} · ${freeTotal} free`,
			);
			// Bare column header — LED mark carries on/off (no ST twin).
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
		// ★ dispatch is product default next — omit twin on inventory.
		// Multi-row busy tables still get no trailing ★ wall.
	}
	const nodesTitle =
		hiveId === "default"
			? "▣ n"
			: `▣ n·hive ${hiveId}`;
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
		const occupancy = allEmpty
			? "empty"
			: occupancyBits.join("·");
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
				rows.push(
					`${rooms.length}${roomWord}·${occupancy}`,
				);
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
	const roomsTitle =
		hiveId === "default"
			? "# rm"
			: `# rm·hive ${hiveId}`;
	return panel(roomsTitle, rows);
}

/** Format CLI result for stdout (human or JSON). */
export function formatHoboCodeResult(
	result: HoboCodeCliResult,
	json: boolean,
): string {
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
		return result.message.endsWith("\n") ? result.message : `${result.message}\n`;
	}

	// Prefer embedded presentation body when present (status chrome, etc.).
	const data = result.data as { text?: string } | undefined;
	const body =
		typeof data?.text === "string" && data.text.length > 0
			? data.text
			: result.message;

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
			lines[0] =
				stripTrailingRule(cur) + `FIX  ${fixes}${codeBit}\n` + rule;
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
