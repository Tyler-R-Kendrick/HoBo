#!/usr/bin/env node
/**
 * OptimizeXP init — traverse the repo, seed UX/DX/AX personas from product signals,
 * then scaffold feature folders/scenarios/bindings for discovered journeys.
 *
 * node --import tsx .agents/skills/optimizexp/harness/init.mts --help
 * node --experimental-strip-types .agents/skills/optimizexp/harness/init.mts --dry-run
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { writeJson } from "./lib/media.mts";
import { optimizexpRoot, repoRoot } from "./lib/paths.mts";
import {
	discoverProduct,
	filterDiscovery,
	type Experience,
	type ProductDiscovery,
} from "./lib/repo-discover.mts";
import { assessNeedsInit } from "./lib/needs-init.mts";
import { listProjects, resolveProjects } from "./lib/projects.mts";

function parseArgs(argv: string[]) {
	const out: Record<string, string> = { mode: "init" };
	const projectTokens: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") out.help = "1";
		else if (a === "--mode") out.mode = argv[++i] ?? "init";
		else if (a === "--dry-run") out.dryRun = "1";
		else if (a === "--force") out.force = "1";
		else if (a === "--skip-features") out.skipFeatures = "1";
		else if (a === "--skip-personas") out.skipPersonas = "1";
		else if (a === "--skip-implement") out.skipImplement = "1";
		else if (a === "--experiences") out.experiences = argv[++i] ?? "ux,dx,ax";
		else if (a === "--max-features") out.maxFeatures = argv[++i] ?? "12";
		else if (a === "--max-personas") out.maxPersonas = argv[++i] ?? "12";
		else if (a === "--report") out.report = argv[++i] ?? "";
		else if (a === "--projects" || a === "--project") {
			const v = argv[++i] ?? "";
			if (v) projectTokens.push(v);
		} else if (a === "--all-projects") {
			projectTokens.push("all");
		} else if (a === "needs-init" || a === "--needs-init") out.mode = "needs-init";
		else if (a === "list-projects" || a === "--list-projects")
			out.mode = "list-projects";
	}
	if (projectTokens.length) out.projects = projectTokens.join(",");
	return out;
}

function help() {
	console.log(`optimizexp init

Traverse the repo for product signals, then:
  1) Create UX / DX / AX personas aligned with what the product does
  2) Scaffold feature folders, Gherkin scenarios, bindings, and (best-effort) implementations

Usage:
  init.mts [--experiences ux,dx,ax] [--projects all|site,cli,…] [--dry-run] [--force]
           [--skip-personas] [--skip-features] [--skip-implement]
           [--max-personas N] [--max-features N]
           [--report .optimizexp/init-report.json]
  init.mts --mode needs-init     # exit 0 if init recommended, 1 if ready to review
  init.mts --mode list-projects  # list discovered multi-project ids

--projects defaults to all-projects when omitted.

Maps to skill flags: /optimizexp --init [--projects site,cli]
Bare /optimizexp (no flags) runs needs-init first; if needed, init (all projects) then full ux+dx+ax review.

Does not overwrite existing persona/feature files unless --force.
`);
}

function skillHarness(root: string, file: string): string {
	const a = path.join(root, ".agents/skills/optimizexp/harness", file);
	if (existsSync(a)) return a;
	return path.join(root, ".claude/skills/optimizexp/harness", file);
}

function runNodeScript(
	root: string,
	scriptRel: string,
	args: string[],
): { status: number | null; stdout: string; stderr: string } {
	const script = skillHarness(root, scriptRel);
	const r = spawnSync(
		process.execPath,
		["--experimental-strip-types", script, ...args],
		{ cwd: root, encoding: "utf8", timeout: 120_000 },
	);
	return {
		status: r.status,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
	};
}

function personaExists(root: string, id: string): boolean {
	return existsSync(path.join(optimizexpRoot(root), "personas", `${id}.md`));
}

function featureExists(root: string, id: string): boolean {
	return existsSync(
		path.join(optimizexpRoot(root), "features", id, "feature.json"),
	);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help === "1") {
		help();
		return;
	}
	const root = repoRoot();

	if (args.mode === "needs-init") {
		const assessment = assessNeedsInit(root);
		console.log(JSON.stringify({ ok: true, ...assessment }, null, 2));
		// exit 0 = needs init; exit 1 = ready to review without init
		process.exitCode = assessment.needsInit ? 0 : 1;
		return;
	}

	if (args.mode === "list-projects") {
		const projects = listProjects(root);
		console.log(
			JSON.stringify(
				{
					ok: true,
					default: "all",
					count: projects.length,
					projects: projects.map((p) => ({
						id: p.id,
						path: p.path || ".",
						kind: p.kind,
						label: p.label,
						packageName: p.packageName ?? null,
					})),
				},
				null,
				2,
			),
		);
		return;
	}

	const experiences = (args.experiences || "ux,dx,ax")
		.split(/[,\s]+/)
		.filter((e): e is Experience => ["ux", "dx", "ax"].includes(e));
	const dry = args.dryRun === "1";
	const force = args.force === "1";
	const maxPersonas = Math.max(1, Number(args.maxPersonas || 12));
	const maxFeatures = Math.max(1, Number(args.maxFeatures || 12));
	const projectSelection = resolveProjects(args.projects, root);
	if (projectSelection.unknown.length) {
		console.error(
			`Unknown --projects id(s): ${projectSelection.unknown.join(", ")}. Use --mode list-projects.`,
		);
		process.exit(2);
	}

	let discovery = discoverProduct(root, projectSelection);
	discovery = filterDiscovery(discovery, experiences);
	discovery.personaPlans = discovery.personaPlans.slice(0, maxPersonas);
	discovery.featurePlans = discovery.featurePlans.slice(0, maxFeatures);

	const report: {
		ok: boolean;
		dryRun: boolean;
		productName: string;
		experiences: Experience[];
		projects: string[];
		discovery: ProductDiscovery;
		createdPersonas: string[];
		skippedPersonas: string[];
		createdFeatures: string[];
		skippedFeatures: string[];
		errors: string[];
	} = {
		ok: true,
		dryRun: dry,
		productName: discovery.productName,
		experiences,
		projects: discovery.selectedProjects,
		discovery,
		createdPersonas: [],
		skippedPersonas: [],
		createdFeatures: [],
		skippedFeatures: [],
		errors: [],
	};

	if (dry) {
		console.log(
			JSON.stringify(
				{
					ok: true,
					dryRun: true,
					productName: discovery.productName,
					productSummary: discovery.productSummary,
					projects: discovery.selectedProjects,
					projectIds: discovery.projectIds,
					signals: discovery.signals,
					personaPlans: discovery.personaPlans.map((p) => ({
						id: p.id,
						experiences: p.experiences,
						projects: p.projects,
						seed: p.seed.slice(0, 120),
					})),
					featurePlans: discovery.featurePlans.map((f) => ({
						id: f.id,
						driver: f.driver,
						projects: f.projects,
						seed: f.seed.slice(0, 120),
						surfaces: f.surfaces,
					})),
					notes: discovery.notes,
				},
				null,
				2,
			),
		);
		return;
	}

	mkdirSync(path.join(optimizexpRoot(root), "personas"), { recursive: true });
	mkdirSync(path.join(optimizexpRoot(root), "features"), { recursive: true });

	// 1) Personas
	if (args.skipPersonas !== "1") {
		for (const plan of discovery.personaPlans) {
			if (personaExists(root, plan.id) && !force) {
				report.skippedPersonas.push(plan.id);
				continue;
			}
			const r = runNodeScript(root, "generate-persona.mts", [
				"--seed",
				plan.seed,
				"--id",
				plan.id,
				"--experiences",
				plan.experiences.join(","),
				"--priority",
				String(plan.priority),
				...(force ? ["--force"] : []),
			]);
			if (r.status === 0) {
				report.createdPersonas.push(plan.id);
				// Enrich with product name in a small note file? persona scaffold is enough.
			} else {
				report.errors.push(
					`persona ${plan.id}: ${r.stderr || r.stdout || "failed"}`.slice(0, 400),
				);
				report.ok = false;
			}
		}
	}

	// Build persona id list for feature fan-out: created + existing product-* + all matching experiences
	const personaIdsForFeatures = discovery.personaPlans.map((p) => p.id);

	// 2) Features
	if (args.skipFeatures !== "1") {
		for (const plan of discovery.featurePlans) {
			if (featureExists(root, plan.id) && !force) {
				report.skippedFeatures.push(plan.id);
				continue;
			}
			// Personas whose experiences intersect this feature
			const personas = personaIdsForFeatures.filter((id) => {
				const planP = discovery.personaPlans.find((p) => p.id === id);
				if (!planP) return false;
				return planP.experiences.some((e) =>
					plan.personaExperiences.includes(e),
				);
			});
			const personaArg =
				personas.length > 0
					? personas
					: personaIdsForFeatures.length > 0
						? personaIdsForFeatures
						: ["product-app-developer"];

			const genArgs = [
				"--seed",
				plan.seed,
				"--id",
				plan.id,
				"--title",
				plan.title,
				"--experiences",
				plan.experiences.join(","),
				"--personas",
				personaArg.join(","),
				"--driver",
				plan.driver,
				"--projects",
				(plan.projects?.length ? plan.projects : ["root"]).join(","),
			];
			const r = runNodeScript(root, "generate-feature.mts", genArgs);
			if (r.status === 0) {
				report.createdFeatures.push(plan.id);
				if (args.skipImplement !== "1") {
					const impl = runNodeScript(root, "generate-feature.mts", [
						"--mode",
						"implement",
						"--id",
						plan.id,
					]);
					if (impl.status !== 0) {
						report.errors.push(
							`implement ${plan.id}: ${(impl.stderr || impl.stdout).slice(0, 300)}`,
						);
					}
				}
			} else {
				report.errors.push(
					`feature ${plan.id}: ${(r.stderr || r.stdout || "failed").slice(0, 400)}`,
				);
				report.ok = false;
			}
		}
	}

	const reportPath =
		args.report ||
		path.join(optimizexpRoot(root), "init-report.json");
	writeJson(reportPath, {
		...report,
		// discovery is large; keep full for agent rewrite
	});

	// Human index
	const indexMd = path.join(optimizexpRoot(root), "INIT.md");
	writeFileSync(
		indexMd,
		`# OptimizeXP init report

Product: **${discovery.productName}**

${discovery.productSummary}

Scanned: ${discovery.scannedAt}

## Signals

| Signal | Value |
|---|---|
| site | ${discovery.signals.hasSite} |
| DESIGN.md | ${discovery.signals.hasDesignMd} |
| CLI packages | ${discovery.signals.hasCli} |
| MCP | ${discovery.signals.hasMcp} |
| AGENTS.md | ${discovery.signals.hasAgentsMd} |
| package scripts | ${discovery.signals.scriptNames.slice(0, 8).join(", ")} |

## Personas created

${report.createdPersonas.map((id) => `- \`${id}\``).join("\n") || "_none_"}

Skipped (already existed): ${report.skippedPersonas.join(", ") || "_none_"}

## Features created

${report.createdFeatures.map((id) => `- \`${id}\``).join("\n") || "_none_"}

Skipped: ${report.skippedFeatures.join(", ") || "_none_"}

## Next

1. Agent-refine persona bodies for product vocabulary (optional quality pass).
2. Refine Gherkin scenarios to match real journeys.
3. Run a review: \`/optimizexp --personas ${report.createdPersonas.slice(0, 3).join(",") || "product-app-developer"} --features ${report.createdFeatures.slice(0, 2).join(",") || "…"}\`
4. Full report JSON: \`${path.relative(root, reportPath)}\`

## Notes

${discovery.notes.map((n) => `- ${n}`).join("\n") || "_none_"}
${report.errors.length ? `\n## Errors\n\n${report.errors.map((e) => `- ${e}`).join("\n")}` : ""}
`,
		"utf8",
	);

	console.log(
		JSON.stringify(
			{
				ok: report.ok,
				productName: discovery.productName,
				projects: discovery.selectedProjects,
				report: path.relative(root, reportPath),
				index: path.relative(root, indexMd),
				createdPersonas: report.createdPersonas,
				skippedPersonas: report.skippedPersonas,
				createdFeatures: report.createdFeatures,
				skippedFeatures: report.skippedFeatures,
				errors: report.errors,
				notes: discovery.notes,
			},
			null,
			2,
		),
	);
	if (!report.ok) process.exitCode = 1;
}

main();
