/**
 * Plain-English Claude Code → hobo-code map for non-developer app builders.
 *
 * Not a reimplementation of Anthropic Claude Code. Gives advanced Claude Code
 * users (who may not know traditional engineering) a discoverable bridge to
 * hobo-code verbs: workflows, remote, channels, routines, reviews, browser,
 * fork, btw, etc.
 */

export interface ClaudeCodeFeatureMapRow {
	/** Claude Code–shaped name the persona already knows. */
	readonly claudeCode: string;
	/** What hobo-code offers (or residual). */
	readonly hoboCode: string;
	/** Concrete next command(s), plain English. */
	readonly try: string;
	/** supported | partial | residual */
	readonly status: "supported" | "partial" | "residual";
}

export interface ClaudeCodeGuide {
	readonly schema: "hobo.code.claude-guide/v1";
	readonly audience: "claude-code-advanced-app-builder";
	readonly plainIntro: string;
	readonly happyPath: readonly string[];
	readonly map: readonly ClaudeCodeFeatureMapRow[];
	readonly residual: readonly string[];
	readonly legend: string;
	readonly latestNotes: readonly string[];
}

/** Canonical map Claude Code SOTA language → hobo-code surfaces. */
export function claudeCodeGuide(): ClaudeCodeGuide {
	return {
		schema: "hobo.code.claude-guide/v1",
		audience: "claude-code-advanced-app-builder",
		plainIntro:
			"If you already use Claude Code to build apps but are not a traditional developer: hobo-code is a HoBo app-building agent CLI. Same job (build/refine an app with an agent), different product names. Use this guide as your cheat sheet.",
		happyPath: [
			"hobo-code auth login          # like signing in so the agent knows your Station",
			"hobo-code scaffold --name app # start an OpenUI/Astryx app skeleton",
			'hobo-code "add a settings page"  # default = dispatch (your main prompt)',
			"hobo-code session             # see agent panes + handback (like a work session)",
			"hobo-code tasks               # background-ish task board (workflows glance)",
			"hobo-code promote <runId>     # finish / gate a run (review-shaped checklist)",
		],
		map: [
			{
				claudeCode: "workflows",
				hoboCode:
					"tasks board + durable Local World workflow steps (plan→implement→verify→handback)",
				try: "hobo-code tasks · hobo-code tasks --json",
				status: "partial",
			},
			{
				claudeCode: "remote connect",
				hoboCode:
					"attach = named endpoint + reattach story (local or overlay/Tailscale-shaped)",
				try: "hobo-code attach · hobo-code attach --mode overlay",
				status: "partial",
			},
			{
				claudeCode: "channels",
				hoboCode:
					"not a multi-chat product; use status/session panes for parallel agent streams",
				try: "hobo-code status · hobo-code session",
				status: "partial",
			},
			{
				claudeCode: "routines",
				hoboCode:
					"isolate → work → promote is the repeatable recipe; no separate scheduler verb yet",
				try: "hobo-code isolate my-run · hobo-code promote my-run",
				status: "partial",
			},
			{
				claudeCode: "automated reviews / ultrareview",
				hoboCode:
					"promote gate checklist + Eve reviewer subagent surface (multi-agent review shape)",
				try: "hobo-code promote --help · hobo-code session --json",
				status: "partial",
			},
			{
				claudeCode: "browser control (Chrome)",
				hoboCode:
					"visual evidence / OpenUI scaffold for first-paint; full Claude-for-Chrome drive is residual L",
				try: "hobo-code scaffold --name demo",
				status: "residual",
			},
			{
				claudeCode: "deep-research",
				hoboCode:
					"dispatch a research-first prompt; no separate deep-research product verb",
				try: 'hobo-code "research options then propose a plan for …"',
				status: "partial",
			},
			{
				claudeCode: "fork",
				hoboCode:
					"isolate creates a mediated sandbox/worktree so main stays safe",
				try: "hobo-code isolate my-run",
				status: "supported",
			},
			{
				claudeCode: "btw (aside / tip)",
				hoboCode:
					"guide asides + help notes; dense power-user chrome is opt-in (--dense)",
				try: "hobo-code guide · hobo-code help",
				status: "supported",
			},
			{
				claudeCode: "login / identity",
				hoboCode: "auth login (local Station auto, or remote tenant+domain)",
				try: "hobo-code auth login · hobo-code auth status",
				status: "supported",
			},
			{
				claudeCode: "plan mode",
				hoboCode: "isolate work then promote through gates (plan/apply-shaped)",
				try: "hobo-code isolate · hobo-code promote",
				status: "partial",
			},
			{
				claudeCode: "slash commands / skills",
				hoboCode:
					"flat verbs (dispatch, scaffold, tasks, …); skills live in repo agent tooling",
				try: "hobo-code help · hobo-code guide",
				status: "partial",
			},
		],
		residual: [
			"Full Claude-for-Chrome browser automation (extension-driven) is not shipped as a hobo-code verb — residual L.",
			"Claude Code cloud channels / Anthropic-hosted routines marketplace are product-different; hobo-code stays local/Station app-building.",
			"True multi-agent PR ultrareview at Anthropic research-preview depth is residual beyond promote gates + Eve reviewer shape.",
		],
		legend: "claude-code map · plain English · next steps",
		latestNotes: [
			"Claude Code advanced users often chase: workflows, remote connect, channels, routines, automated/ultrareview, Chrome browser control, deep-research, fork, btw.",
			"hobo-code maps those ideas to attach/tasks/session/isolate/promote/scaffold — honest partial/residual status in guide --json.",
			"Non-developer path: auth → scaffold → prompt → session/tasks → promote.",
		],
	};
}

/** Human panel for guide (plain, scannable). */
export function renderClaudeCodeGuideText(guide: ClaudeCodeGuide = claudeCodeGuide()): string {
	const rows: string[] = [
		"▣ guide",
		"····················",
		" Claude Code → hobo-code",
		` ${guide.legend}`,
		"",
		" Happy path:",
		...guide.happyPath.map((s) => `  ${s}`),
		"",
		" Feature map:",
	];
	for (const m of guide.map) {
		const led =
			m.status === "supported" ? "●" : m.status === "partial" ? "◐" : "○";
		rows.push(`  ${led} ${m.claudeCode}`);
		rows.push(`     → ${m.hoboCode}`);
		rows.push(`     try · ${m.try}`);
	}
	rows.push("");
	rows.push(" Residual (honest gaps):");
	for (const r of guide.residual) {
		rows.push(`  · ${r}`);
	}
	rows.push("────────────────────");
	return rows.join("\n");
}
