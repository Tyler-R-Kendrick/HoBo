/**
 * Shared persona selection for --persona / --personas / experience intersection.
 * Reads global `.optimizexp/personas/` plus selected project-local
 * `<project>/.optimizexp/personas/` trees.
 * Project-local personas shadow global when the same id exists in both.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	GLOBAL_SCOPE_ID,
	globalScope,
	personasDir,
	relFromRepo,
	repoRoot,
	scopesForSelection,
	type OptimizexpScope,
} from "./paths.mts";
import type { ProjectSelection } from "./projects.mts";
import {
	parseExperienceTypesFromYaml,
	personaMatchesExperiences,
	type ExperienceType,
} from "./experience-types.mts";
import {
	applyPersonaConfigFilter,
	resolveConfig,
} from "./config.mts";

export type PersonaMeta = {
	id: string;
	/**
	 * Formal experience-type binding from frontmatter `experiences:`
	 * (alias `experienceTypes:`). Non-empty subset of ux | dx | ax.
	 * Persona is only selected when this intersects the run's experience set.
	 */
	experiences: ExperienceType[];
	/** Validation problems on the experiences field (empty = valid) */
	experienceProblems: string[];
	priority: number;
	interfaces: string[];
	/** Absolute path to the persona markdown file */
	path: string;
	/** `global` or project id */
	scopeId: string;
	/** Absolute path to the owning `.optimizexp/` */
	scopeDir: string;
	/** true when loaded from repo-root global tree */
	global: boolean;
	/** Repo-relative path for display */
	relPath: string;
};

export function personasDirGlobal(root = repoRoot()): string {
	return personasDir(globalScope(root));
}

/** @deprecated use personasDir(scope) — kept for call sites that only mean global */
export function personasDirLegacy(root = repoRoot()): string {
	return personasDirGlobal(root);
}

function parsePersonaFile(
	filePath: string,
	scope: OptimizexpScope,
	root: string,
): PersonaMeta | null {
	const text = readFileSync(filePath, "utf8");
	const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return null;
	const yaml = fm[1]!;
	const base = path.basename(filePath, ".md");
	const id = yaml.match(/^id:\s*(\S+)/m)?.[1] || base;
	const expParsed = parseExperienceTypesFromYaml(yaml);
	const priority = Number(yaml.match(/^priority:\s*(\d+)/m)?.[1] || 100);
	const intRaw = yaml.match(/^interfaces:\s*\[([^\]]*)\]/m)?.[1] || "";
	const interfaces = intRaw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	// Optional frontmatter scope override (must match folder if set)
	const fmScope = yaml.match(/^scope:\s*(\S+)/m)?.[1];
	const scopeId = fmScope || scope.id;
	return {
		id,
		experiences: expParsed.ok,
		experienceProblems: expParsed.problems,
		priority,
		interfaces,
		path: filePath,
		scopeId,
		scopeDir: scope.optimizexpDir,
		global: scope.global,
		relPath: relFromRepo(filePath, root),
	};
}

function listPersonasInScope(
	scope: OptimizexpScope,
	root: string,
): PersonaMeta[] {
	const dir = personasDir(scope);
	if (!existsSync(dir)) return [];
	const out: PersonaMeta[] = [];
	for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
		const meta = parsePersonaFile(path.join(dir, f), scope, root);
		if (meta) out.push(meta);
	}
	return out;
}

/**
 * List personas for a project selection.
 * Always includes **global**; merges selected project scopes.
 * **Shadowing:** project-local id wins over global when both exist.
 */
export function listPersonaMetas(
	root = repoRoot(),
	selection?: ProjectSelection,
): PersonaMeta[] {
	const scopes = scopesForSelection(selection, root);
	const byId = new Map<string, PersonaMeta>();
	// Global first
	for (const s of scopes.filter((x) => x.global)) {
		for (const m of listPersonasInScope(s, root)) {
			byId.set(m.id, m);
		}
	}
	// Project scopes overwrite
	for (const s of scopes.filter((x) => !x.global)) {
		for (const m of listPersonasInScope(s, root)) {
			byId.set(m.id, m);
		}
	}
	return [...byId.values()].sort(
		(a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
	);
}

/**
 * Resolve which personas participate in this invocation.
 * Matches skill flag resolution (after persona seeds have been written to disk).
 */
export function resolvePersonaIds(input: {
	/** Explicit --personas / --use-personas */
	personasFlag?: string[];
	/** Ids generated this run via --persona seeds */
	generatedIds?: string[];
	/** Resolved experience set */
	experiences: string[];
	maxPersonas?: number;
	root?: string;
	/** Multi-project selection — controls which project .optimizexp trees are scanned */
	selection?: ProjectSelection;
	/** Skip loading config prefer/exclude */
	skipConfig?: boolean;
}): { ids: string[]; reason: string; metas: PersonaMeta[] } {
	const root = input.root ?? repoRoot();
	const all = listPersonaMetas(root, input.selection);
	const byId = new Map(all.map((m) => [m.id, m]));
	let ids: string[] = [];
	let reason = "";

	const focusProject =
		input.selection &&
		!input.selection.allProjects &&
		input.selection.projects.length === 1
			? input.selection.projects[0]!
			: null;
	const cfg = input.skipConfig
		? null
		: resolveConfig({ root, focusProject }).resolved;

	if (input.personasFlag && input.personasFlag.length > 0) {
		ids = [...input.personasFlag];
		reason = "explicit --personas";
		const missing = ids.filter((id) => !byId.has(id));
		if (missing.length) {
			throw new Error(
				`Unknown persona id(s): ${missing.join(", ")}. Generate with --persona or add personas under global .optimizexp/personas/ or <project>/.optimizexp/personas/`,
			);
		}
	} else if (input.generatedIds && input.generatedIds.length > 0) {
		ids = [...input.generatedIds];
		reason = "generated this invocation via --persona";
	} else {
		// Formal binding: persona.experiences ∩ run experiences ≠ ∅.
		const valid = all.filter((m) => m.experiences.length > 0);
		ids = valid
			.filter((m) =>
				personaMatchesExperiences(m.experiences, input.experiences),
			)
			.map((m) => m.id);
		reason =
			"personas whose frontmatter experiences ∩ [" +
			input.experiences.join(",") +
			"] (formal experienceTypes binding; global + project scopes)";
		if (ids.length === 0) {
			const invalidCount = all.filter((m) => m.experiences.length === 0).length;
			reason +=
				`; zero matches` +
				(invalidCount
					? ` (${invalidCount} persona(s) missing valid experiences: frontmatter)`
					: "");
		}
	}

	if (cfg) {
		ids = applyPersonaConfigFilter(ids, cfg);
		const cfgSources = cfg.sources.filter(
			(s) => s !== "<skill-builtin-defaults>",
		);
		if (cfgSources.length || cfg.personas.prefer.length || cfg.personas.exclude.length) {
			reason += `; config prefer/exclude (${cfgSources.join(" + ") || "builtins"})`;
		}
	}

	if (!cfg?.personas.prefer.length) {
		ids = [...new Set(ids)].sort((a, b) => {
			const pa = byId.get(a)?.priority ?? 100;
			const pb = byId.get(b)?.priority ?? 100;
			return pa - pb || a.localeCompare(b);
		});
	} else {
		ids = [...new Set(ids)];
	}

	const maxCap =
		input.maxPersonas && input.maxPersonas > 0
			? input.maxPersonas
			: cfg?.defaults.maxPersonas;
	if (maxCap && maxCap > 0 && ids.length > maxCap) {
		ids = ids.slice(0, maxCap);
		reason += `; truncated to maxPersonas=${maxCap}`;
	}

	const metas = ids.map((id) => byId.get(id)!).filter(Boolean);
	return { ids, reason, metas };
}

export function findPersona(
	id: string,
	root = repoRoot(),
	selection?: ProjectSelection,
): PersonaMeta | null {
	return listPersonaMetas(root, selection).find((m) => m.id === id) ?? null;
}

export { GLOBAL_SCOPE_ID };
