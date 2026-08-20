/**
 * Navigable `/agents` harness catalog — picker + browse tree.
 *
 * Top-level: registered harnesses (Hobo Bo / hobo-code first).
 * Children of Hobo Bo: Eve vfs agents under `.hobo/agents` (+ legacy `agent/`).
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { must } from "@hobo/core/total-access";
import type { HarnessSpec } from "./agent-harness-adapters.js";
import { isHostSpec } from "./harness-spec.js";

export type AgentsCatalogNodeKind = "harness" | "eve-agent" | "eve-subagent";

export type EveAgentSource = "hobo-agents" | "legacy-agent";

export interface ProjectEveAgent {
	readonly id: string;
	readonly path: string;
	readonly source: EveAgentSource;
	readonly parentId?: string;
	readonly description?: string;
	readonly children: readonly ProjectEveAgent[];
}

export interface AgentsCatalogNode {
	readonly id: string;
	readonly kind: AgentsCatalogNodeKind;
	readonly label: string;
	readonly harnessId?: string;
	readonly path?: string;
	readonly description?: string;
	readonly children: readonly AgentsCatalogNode[];
}

export interface AgentsCatalogFlatRow {
	readonly id: string;
	readonly kind: AgentsCatalogNodeKind;
	readonly label: string;
	readonly depth: number;
	readonly expandable: boolean;
	readonly expanded: boolean;
	readonly harnessId?: string;
	readonly path?: string;
	readonly description?: string;
}

export interface AgentsCatalogState {
	readonly roots: readonly AgentsCatalogNode[];
	readonly cursor: number;
	readonly scroll: number;
	readonly expanded: ReadonlySet<string>;
}

export type AgentsCatalogPick =
	| {
			readonly kind: "configure-harness";
			readonly harnessId: string;
			readonly label: string;
	  }
	| {
			readonly kind: "configure-hobo-bo";
			readonly label: "Hobo Bo";
	  }
	| {
			readonly kind: "configure-eve";
			readonly id: string;
			readonly path: string;
			readonly label: string;
			readonly description?: string;
	  };

export interface AgentsCatalogKeyResult {
	readonly state: AgentsCatalogState;
	readonly pick?: AgentsCatalogPick;
	readonly close?: boolean;
	readonly openSlash?: boolean;
}

export interface AgentsCatalogFs {
	readonly exists: (path: string) => boolean;
	readonly isDirectory: (path: string) => boolean;
	readonly readdir: (path: string) => readonly string[];
	readonly readText: (path: string) => string | null;
}

const defaultFs: AgentsCatalogFs = {
	exists: existsSync,
	isDirectory: (path) => {
		try {
			return existsSync(path) && statSync(path).isDirectory();
		} catch {
			return false;
		}
	},
	readdir: (path) => {
		try {
			return readdirSync(path);
		} catch {
			return [];
		}
	},
	readText: (path) => {
		try {
			return readFileSync(path, "utf8");
		} catch {
			return null;
		}
	},
};

function looksLikeEveAgent(dir: string, fs: AgentsCatalogFs): boolean {
	return (
		fs.exists(join(dir, "instructions.md")) || fs.exists(join(dir, "agent.ts"))
	);
}

function firstDescriptionLine(
	dir: string,
	fs: AgentsCatalogFs,
): string | undefined {
	const md = fs.readText(join(dir, "instructions.md"));
	if (!md) return undefined;
	for (const line of md.split(/\r?\n/u)) {
		const trimmed = line.replace(/^#+\s*/u, "").trim();
		if (trimmed) return trimmed.slice(0, 96);
	}
	return undefined;
}

function readEveSubtree(
	dir: string,
	id: string,
	source: EveAgentSource,
	fs: AgentsCatalogFs,
	parentId?: string,
): ProjectEveAgent | null {
	if (!fs.isDirectory(dir) || !looksLikeEveAgent(dir, fs)) return null;
	const children: ProjectEveAgent[] = [];
	const subRoot = join(dir, "subagents");
	if (fs.isDirectory(subRoot)) {
		for (const name of fs.readdir(subRoot)) {
			const childPath = join(subRoot, name);
			const child = readEveSubtree(childPath, name, source, fs, id);
			if (child) children.push(child);
		}
	}
	const description = firstDescriptionLine(dir, fs);
	return {
		id,
		path: dir,
		source,
		...(parentId !== undefined ? { parentId } : undefined),
		...(description !== undefined ? { description } : undefined),
		children,
	};
}

/**
 * Discover Eve-shaped agents under `<project>/.hobo/agents` and legacy `agent/`.
 * Same id prefers `.hobo/agents`.
 */
export function discoverProjectEveAgents(
	projectDir: string,
	fs: AgentsCatalogFs = defaultFs,
): readonly ProjectEveAgent[] {
	const byId = new Map<string, ProjectEveAgent>();

	const hoboRoot = join(projectDir, ".hobo", "agents");
	if (fs.isDirectory(hoboRoot)) {
		for (const name of fs.readdir(hoboRoot)) {
			const path = join(hoboRoot, name);
			const tree = readEveSubtree(path, name, "hobo-agents", fs);
			if (tree) byId.set(tree.id, tree);
		}
	}

	const legacyRoot = join(projectDir, "agent");
	if (fs.isDirectory(legacyRoot) && looksLikeEveAgent(legacyRoot, fs)) {
		const legacyChildren: ProjectEveAgent[] = [];
		const sub = join(legacyRoot, "subagents");
		if (fs.isDirectory(sub)) {
			for (const name of fs.readdir(sub)) {
				if (byId.has(name)) continue;
				const child = readEveSubtree(
					join(sub, name),
					name,
					"legacy-agent",
					fs,
					"agent",
				);
				if (child) legacyChildren.push(child);
			}
		}
		if (!byId.has("agent")) {
			const description = firstDescriptionLine(legacyRoot, fs);
			byId.set("agent", {
				id: "agent",
				path: legacyRoot,
				source: "legacy-agent",
				...(description !== undefined ? { description } : undefined),
				children: legacyChildren,
			});
		} else {
			for (const child of legacyChildren) {
				if (!byId.has(child.id)) byId.set(child.id, child);
			}
		}
	} else if (fs.isDirectory(legacyRoot)) {
		const sub = join(legacyRoot, "subagents");
		if (fs.isDirectory(sub)) {
			for (const name of fs.readdir(sub)) {
				if (byId.has(name)) continue;
				const child = readEveSubtree(
					join(sub, name),
					name,
					"legacy-agent",
					fs,
					"agent",
				);
				if (child) byId.set(child.id, child);
			}
		}
	}

	return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** DNS-ish Eve agent id: lowercase start, then alnum/hyphen, ≤63 chars. */
export function isValidEveAgentId(id: string): boolean {
	return /^[a-z][a-z0-9-]{0,62}$/u.test(id);
}

export type CreateEveAgentResult =
	| { readonly ok: true; readonly agent: ProjectEveAgent }
	| { readonly ok: false; readonly error: string };

/**
 * Create a top-level Eve vfs agent at `<project>/.hobo/agents/<id>/instructions.md`.
 */
export function createProjectEveAgent(
	projectDir: string,
	rawId: string,
): CreateEveAgentResult {
	const id = rawId.trim().toLowerCase();
	if (!isValidEveAgentId(id)) {
		return {
			ok: false,
			error:
				"id must be lowercase, start with a letter, then a-z 0-9 -, max 63 chars",
		};
	}
	const dir = join(projectDir, ".hobo", "agents", id);
	if (existsSync(dir)) {
		return { ok: false, error: `agent already exists: .hobo/agents/${id}` };
	}
	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "instructions.md"),
			`# ${id}\n\nSubagent for HoBo Bo.\n`,
			"utf8",
		);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
	const agent = readEveSubtree(dir, id, "hobo-agents", defaultFs);
	if (!agent) {
		return { ok: false, error: "created files but discovery failed" };
	}
	return { ok: true, agent };
}

function eveNodeId(agent: ProjectEveAgent): string {
	const base = agent.source === "hobo-agents" ? "eve:hobo" : "eve:legacy";
	return agent.parentId
		? `${base}:${agent.parentId}:${agent.id}`
		: `${base}:${agent.id}`;
}

function eveToCatalogNode(agent: ProjectEveAgent): AgentsCatalogNode {
	return {
		id: eveNodeId(agent),
		kind: agent.parentId ? "eve-subagent" : "eve-agent",
		label: agent.id,
		path: agent.path,
		...(agent.description !== undefined
			? { description: agent.description }
			: undefined),
		children: agent.children.map(eveToCatalogNode),
	};
}

function sortHarnesses(specs: readonly HarnessSpec[]): HarnessSpec[] {
	const host = specs.filter(
		(spec) => isHostSpec(spec) || spec.id === "hobo-code",
	);
	// inference = how HoBo Bo reaches models — not a harness row.
	// eve-agent = Vercel Eve shape — shown under HoBo Bo, not a top-level section.
	const rest = specs
		.filter(
			(spec) =>
				!isHostSpec(spec) &&
				spec.id !== "hobo-code" &&
				spec.kind !== "inference" &&
				spec.kind !== "eve-agent",
		)
		.slice()
		.sort((left, right) => {
			const seatDelta = (left.seat ?? 100) - (right.seat ?? 100);
			if (seatDelta !== 0) return seatDelta;
			return left.id.localeCompare(right.id);
		});
	const hobo =
		host.find((spec) => spec.id === "hobo-code") ??
		host[0] ??
		({
			id: "hobo-code",
			label: "Hobo Bo",
			kind: "harness" as const,
			host: true,
		} satisfies HarnessSpec);
	return [hobo, ...rest];
}

export function buildAgentsCatalog(
	specs: readonly HarnessSpec[],
	eveTrees: readonly ProjectEveAgent[],
): AgentsCatalogState {
	const eveChildren = eveTrees.map(eveToCatalogNode);
	const roots: AgentsCatalogNode[] = [];
	for (const spec of sortHarnesses(specs)) {
		const id = `harness:${spec.id}`;
		const label = spec.id === "hobo-code" ? "Hobo Bo" : spec.label || spec.id;
		roots.push({
			id,
			kind: "harness",
			label,
			harnessId: spec.id,
			children: spec.id === "hobo-code" || isHostSpec(spec) ? eveChildren : [],
		});
	}
	return {
		roots,
		cursor: 0,
		scroll: 0,
		expanded: new Set(),
	};
}

export function flattenVisible(
	state: AgentsCatalogState,
): readonly AgentsCatalogFlatRow[] {
	const out: AgentsCatalogFlatRow[] = [];
	const walk = (nodes: readonly AgentsCatalogNode[], depth: number) => {
		for (const node of nodes) {
			const expandable = node.children.length > 0;
			const expanded = expandable && state.expanded.has(node.id);
			out.push({
				id: node.id,
				kind: node.kind,
				label: node.label,
				depth,
				expandable,
				expanded,
				...(node.harnessId !== undefined
					? { harnessId: node.harnessId }
					: undefined),
				...(node.path !== undefined ? { path: node.path } : undefined),
				...(node.description !== undefined
					? { description: node.description }
					: undefined),
			});
			if (expanded) walk(node.children, depth + 1);
		}
	};
	walk(state.roots, 0);
	return out;
}

function clampCatalog(
	state: AgentsCatalogState,
	viewportRows: number,
): AgentsCatalogState {
	const rows = flattenVisible(state);
	const maxCursor = Math.max(0, rows.length - 1);
	const cursor = Math.max(0, Math.min(state.cursor, maxCursor));
	const view = Math.max(1, viewportRows);
	let scroll = state.scroll;
	if (cursor < scroll) scroll = cursor;
	if (cursor >= scroll + view) scroll = cursor - view + 1;
	scroll = Math.max(0, Math.min(scroll, Math.max(0, rows.length - view)));
	return { ...state, cursor, scroll };
}

function toggleExpanded(
	state: AgentsCatalogState,
	id: string,
): AgentsCatalogState {
	const next = new Set(state.expanded);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return { ...state, expanded: next };
}

function pickFromRow(row: AgentsCatalogFlatRow): AgentsCatalogPick | undefined {
	if (row.kind === "harness") {
		if (row.harnessId === "hobo-code") {
			return { kind: "configure-hobo-bo", label: "Hobo Bo" };
		}
		if (row.harnessId) {
			return {
				kind: "configure-harness",
				harnessId: row.harnessId,
				label: row.label,
			};
		}
		return undefined;
	}
	if ((row.kind === "eve-agent" || row.kind === "eve-subagent") && row.path) {
		return {
			kind: "configure-eve",
			id: basename(row.path),
			path: row.path,
			label: row.label,
			...(row.description !== undefined
				? { description: row.description }
				: undefined),
		};
	}
	return undefined;
}

export function reduceAgentsCatalogKey(
	state: AgentsCatalogState,
	key: string,
	viewportRows: number,
): AgentsCatalogKeyResult {
	if (key === "\x1b" || key === "q") {
		return { state, close: true };
	}
	if (key === "/") {
		return { state, close: true, openSlash: true };
	}

	const rows = flattenVisible(state);
	const current = rows[state.cursor];

	if (key === "\r" || key === "\n") {
		if (!current) return { state };
		const pick = pickFromRow(current);
		// Keep catalog open under configure — Esc from form returns here.
		return pick ? { state, pick } : { state };
	}

	if (key === " " || key === "\x1b[C" || key === "l") {
		if (current?.expandable) {
			const wasExpanded = state.expanded.has(current.id);
			let next = clampCatalog(toggleExpanded(state, current.id), viewportRows);
			// Expanding into children: land cursor on first child so ↓ isn't required
			// to "find" subagents (common focus-loss complaint).
			if (!wasExpanded) {
				const rowsAfter = flattenVisible(next);
				const child = rowsAfter[state.cursor + 1];
				if (child && child.depth > current.depth) {
					next = clampCatalog(
						{ ...next, cursor: state.cursor + 1 },
						viewportRows,
					);
				}
			}
			return { state: next };
		}
		return { state };
	}

	if (key === "\x1b[D" || key === "h") {
		if (current?.expandable && state.expanded.has(current.id)) {
			return {
				state: clampCatalog(toggleExpanded(state, current.id), viewportRows),
			};
		}
		if (current && current.depth > 0) {
			for (let i = state.cursor - 1; i >= 0; i -= 1) {
				const row = must(rows[i]);
				if (row.depth < current.depth) {
					return {
						state: clampCatalog({ ...state, cursor: i }, viewportRows),
					};
				}
			}
		}
		return { state };
	}

	if (key === "\x1b[B" || key === "j") {
		const rowsNow = flattenVisible(state);
		if (rowsNow.length === 0) return { state };
		if (state.cursor >= rowsNow.length - 1) {
			return { state: clampCatalog(state, viewportRows) };
		}
		return {
			state: clampCatalog({ ...state, cursor: state.cursor + 1 }, viewportRows),
		};
	}
	if (key === "\x1b[A" || key === "k") {
		if (state.cursor <= 0) {
			return { state: clampCatalog({ ...state, cursor: 0 }, viewportRows) };
		}
		return {
			state: clampCatalog({ ...state, cursor: state.cursor - 1 }, viewportRows),
		};
	}
	if (key === "\x1b[5~" || key === "\x1b[6~") {
		const delta = key === "\x1b[5~" ? -viewportRows : viewportRows;
		return {
			state: clampCatalog(
				{ ...state, cursor: state.cursor + delta },
				viewportRows,
			),
		};
	}

	return { state };
}

// SAFETY: parsed or fixture value is the named domain type after this assertion.
/** Format subagent inspect pick as product chat lines. */
export function formatEveInspectPick(
	pick: Extract<AgentsCatalogPick, { kind: "configure-eve" }>,
): string {
	const lines = [`subagent · ${pick.label}`, `  path  ${pick.path}`];
	if (pick.description) lines.push(`  ${pick.description}`);
	return lines.join("\n");
}

// public-contract: /agents catalog command-rail key legend
export const AGENTS_CATALOG_KEY_LEGEND =
	"configure · ↑↓ · → expand · Enter edit · Esc close · /mux for terminals";
