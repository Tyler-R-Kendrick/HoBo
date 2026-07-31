/**
 * Shared persona selection for --persona / --personas / experience intersection.
 * Used by feature generation and documented in references/flags.md.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { optimizexpRoot, repoRoot } from "./paths.mts";

export type PersonaMeta = {
	id: string;
	experiences: string[];
	priority: number;
	interfaces: string[];
	path: string;
};

export function personasDir(root = repoRoot()): string {
	return path.join(optimizexpRoot(root), "personas");
}

export function listPersonaMetas(root = repoRoot()): PersonaMeta[] {
	const dir = personasDir(root);
	if (!existsSync(dir)) return [];
	const out: PersonaMeta[] = [];
	for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
		const p = path.join(dir, f);
		const text = readFileSync(p, "utf8");
		const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fm) continue;
		const yaml = fm[1]!;
		const id = yaml.match(/^id:\s*(\S+)/m)?.[1] || f.replace(/\.md$/, "");
		const expRaw = yaml.match(/^experiences:\s*\[([^\]]*)\]/m)?.[1] || "";
		const experiences = expRaw
			.split(",")
			.map((s) => s.trim())
			.filter((s) => ["ux", "dx", "ax"].includes(s));
		const priority = Number(yaml.match(/^priority:\s*(\d+)/m)?.[1] || 100);
		const intRaw = yaml.match(/^interfaces:\s*\[([^\]]*)\]/m)?.[1] || "";
		const interfaces = intRaw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		out.push({
			id,
			experiences,
			priority,
			interfaces,
			path: p,
		});
	}
	return out.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
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
}): { ids: string[]; reason: string; metas: PersonaMeta[] } {
	const root = input.root ?? repoRoot();
	const all = listPersonaMetas(root);
	const byId = new Map(all.map((m) => [m.id, m]));
	let ids: string[] = [];
	let reason = "";

	if (input.personasFlag && input.personasFlag.length > 0) {
		ids = [...input.personasFlag];
		reason = "explicit --personas";
		const missing = ids.filter((id) => !byId.has(id));
		if (missing.length) {
			throw new Error(
				`Unknown persona id(s): ${missing.join(", ")}. Generate with --persona or add personas/*.md`,
			);
		}
	} else if (input.generatedIds && input.generatedIds.length > 0) {
		ids = [...input.generatedIds];
		reason = "generated this invocation via --persona";
	} else {
		ids = all
			.filter((m) => m.experiences.some((e) => input.experiences.includes(e)))
			.map((m) => m.id);
		reason =
			"all personas intersecting experiences [" + input.experiences.join(",") + "]";
		// If none match (empty repo or mismatch), fall back to literally all personas
		if (ids.length === 0 && all.length > 0) {
			ids = all.map((m) => m.id);
			reason = "all personas on disk (no experience intersection)";
		}
	}

	// stable order by priority
	ids = [...new Set(ids)].sort((a, b) => {
		const pa = byId.get(a)?.priority ?? 100;
		const pb = byId.get(b)?.priority ?? 100;
		return pa - pb || a.localeCompare(b);
	});

	if (input.maxPersonas && input.maxPersonas > 0 && ids.length > input.maxPersonas) {
		ids = ids.slice(0, input.maxPersonas);
		reason += `; truncated to maxPersonas=${input.maxPersonas}`;
	}

	const metas = ids.map((id) => byId.get(id)!).filter(Boolean);
	return { ids, reason, metas };
}
