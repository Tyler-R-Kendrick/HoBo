/**
 * Plain-English Cursor → hobo-code map for Cursor power users.
 *
 * Not a reimplementation of the Cursor IDE. Maps Agent / Composer / Background
 * Agent / BugBot / MCP / Rules / Hooks to hobo-code verbs with honest status.
 */

export interface CursorFeatureMapRow {
	readonly cursor: string;
	readonly hoboCode: string;
	readonly try: string;
	readonly status: "supported" | "partial" | "residual";
}

export interface CursorGuide {
	readonly schema: "hobo.code.cursor-guide/v1";
	readonly audience: "cursor-power-user";
	readonly plainIntro: string;
	readonly happyPath: readonly string[];
	readonly map: readonly CursorFeatureMapRow[];
	readonly residual: readonly string[];
	readonly legend: string;
	readonly latestNotes: readonly string[];
}

export function cursorGuide(): CursorGuide {
	return {
		schema: "hobo.code.cursor-guide/v1",
		audience: "cursor-power-user",
		plainIntro:
			"If Cursor is your home IDE (Agent, Composer, Background Agent, BugBot, MCP, Rules): hobo-code is a HoBo app-building agent CLI. Same job (build/refine with an agent), different surface. Use this map as your cheat sheet.",
		happyPath: [
			"hobo-code auth login                 # Station identity (like signing into Cursor cloud)",
			'hobo-code "fix the settings form"  # Agent-mode-shaped dispatch (default verb)',
			"hobo-code scaffold --name demo       # Composer-like first multi-file app skeleton",
			"hobo-code isolate my-run             # Background-Agent-shaped sandbox / worktree",
			"hobo-code session | tasks            # agent board / multi-agent glance",
			"hobo-code promote my-run             # BugBot/PR-gate-shaped checklist (squash-only)",
		],
		map: [
			{
				cursor: "Agent mode",
				hoboCode:
					"dispatch (default prompt) — long agent loop via harness; not full IDE Agent UI",
				try: 'hobo-code "…" · hobo-code dispatch "…"',
				status: "partial",
			},
			{
				cursor: "Composer (multi-file edit)",
				hoboCode:
					"scaffold + dispatch edits; isolate keeps multi-file work off main until promote",
				try: "hobo-code scaffold --name demo · hobo-code isolate my-run",
				status: "partial",
			},
			{
				cursor: "Tab autocomplete",
				hoboCode:
					"IDE-native residual — hobo-code is CLI/TUI; use Cursor Tab inside the editor still",
				try: "hobo-code help  # no Tab clone; pair with editor",
				status: "residual",
			},
			{
				cursor: "Background Agent (cloud sandbox → PR)",
				hoboCode:
					"isolate mediated sandbox + promote gates; durable handback under $HOBO_HOME (local Station, not Cursor cloud)",
				try: "hobo-code isolate my-run · hobo-code promote my-run · hobo-code attach",
				status: "partial",
			},
			{
				cursor: "BugBot (PR review)",
				hoboCode:
					"promote gate checklist + Eve reviewer-shaped surface; not Cursor BugBot SaaS comments",
				try: "hobo-code promote --help · hobo-code session --json",
				status: "partial",
			},
			{
				cursor: "MCP servers",
				hoboCode:
					"session/harness MCP expose path; repo .mcp.json / agent tooling (Serena, headroom, …)",
				try: "hobo-code session --json  # mcp field · project .mcp.json",
				status: "partial",
			},
			{
				cursor: "Rules (.cursor/rules)",
				hoboCode:
					"AGENTS.md / repo skills / harness customization — project conventions, not .cursor/rules format",
				try: "see repo AGENTS.md · hobo-code help",
				status: "partial",
			},
			{
				cursor: "Hooks",
				hoboCode:
					"repo githooks / agent hooks (prepare-hooks); not Cursor Hooks beta UI",
				try: "pnpm run prepare-hooks  # when in this monorepo",
				status: "partial",
			},
			{
				cursor: "Memories",
				hoboCode:
					"durable session-end / handback under $HOBO_HOME; no Cursor Memories product",
				try: "hobo-code session --json  # persistence paths",
				status: "partial",
			},
			{
				cursor: "Automations / Slack agents",
				hoboCode:
					"no Slack automation product; script dispatch/isolate via shell/CI (headless --json)",
				try: "hobo-code dispatch --json · hobo-code help",
				status: "residual",
			},
			{
				cursor: "Multi-model / Cursor Router",
				hoboCode:
					"models + cost cheapest-capable routing; HOBO_CODE_MODEL / BYOK / free-local",
				try: "hobo-code models · hobo-code cost",
				status: "partial",
			},
			{
				cursor: "Headless CLI",
				hoboCode:
					"all verbs support --json for scripts/CI — Cursor CLI analogue for automation",
				try: "hobo-code status --json · hobo-code tasks --json",
				status: "supported",
			},
			{
				cursor: "Multi-agent / agent board",
				hoboCode:
					"status panes + tasks board (Herdr/Grok Build–shaped multi-agent chrome)",
				try: "hobo-code status · hobo-code tasks",
				status: "supported",
			},
		],
		residual: [
			"Cursor Tab inline autocomplete is IDE-native — not cloned in hobo-code CLI.",
			"Cursor cloud Background Agent fleet + BugBot SaaS + Slack Automations are product-different; hobo-code stays local/Station app-building.",
			"Full .cursor/rules + Cursor Hooks UI format is residual; use AGENTS.md / repo skills.",
		],
		legend: "cursor map · agent · sandbox · PR gates",
		latestNotes: [
			"Cursor 2025–2026: Agent mode default, Background Agents, BugBot, one-click MCP, Automations, Router, Composer models.",
			"hobo-code maps those ideas to dispatch/isolate/promote/tasks/models/cost — honest partial/residual in guide --cursor.",
		],
	};
}

/** Human panel for cursor guide. */
export function renderCursorGuideText(
	guide: CursorGuide = cursorGuide(),
): string {
	const rows: string[] = [
		"▣ guide · cursor",
		"····················",
		" Cursor → hobo-code",
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
		rows.push(`  ${led} ${m.cursor}`);
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
