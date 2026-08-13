import {
	applyPatternPlan,
	buildHoboVocabulary,
	composePatterns,
	explainPatternMatch,
	loadPatternCatalog,
	renderPattern,
	searchPatterns,
} from "@hobo/patterns";

export function runTemplateCommand(input: {
	readonly args: readonly string[];
	readonly flags: Readonly<Record<string, string | boolean>>;
}): {
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly data: unknown;
} {
	const catalog = loadPatternCatalog();
	const vocabulary = buildHoboVocabulary();
	const sub = input.args[0];
	const rest = input.args.slice(sub && TEMPLATE_SUB.has(sub) ? 1 : 0);
	const query =
		(typeof input.flags.id === "string" && input.flags.id) || rest.join(" ");
	const action = TEMPLATE_SUB.has(sub ?? "") ? sub : "search";
	if (
		action === "list" ||
		(action === "search" && !query && input.flags.all === true)
	) {
		const ids = catalog.patterns.map((item) => item.id);
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: ids.join("\n"),
			data: {
				ids,
				count: ids.length,
				llmCalls: 0,
				llmInputTokens: 0,
				llmOutputTokens: 0,
			},
		};
	}
	if (!query) {
		return {
			ok: false,
			code: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
			message: "template needs a query, --id, or list",
			data: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0 },
		};
	}
	const params = templateParams(input.flags);
	const search = searchPatterns({
		catalog,
		vocabulary,
		query: {
			query,
			id: typeof input.flags.id === "string" ? input.flags.id : "",
			autoSelect: true,
		},
	});
	if (action === "compose") {
		const composed = composePatterns({ catalog, vocabulary, query });
		return {
			ok: composed.status === 1,
			code:
				composed.status === 1
					? "HOBO_CODE_TEMPLATE"
					: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
			message: composed.chosenIds.join(" ") || composed.reasonCode,
			data: composed,
		};
	}
	if (action === "explain") {
		const id = search.selectedId || search.candidates[0]?.patternId || query;
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: explainPatternMatch({
				catalog,
				vocabulary,
				query,
				patternId: id,
			}),
			data: search,
		};
	}
	if (action === "apply") {
		const id = search.selectedId || search.candidates[0]?.patternId;
		const isolationRoot =
			(typeof input.flags.out === "string" && input.flags.out) ||
			(typeof input.flags.isolation === "string" && input.flags.isolation);
		if (!id || !isolationRoot) {
			return {
				ok: false,
				code: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
				message: "apply needs a selected pattern and --out isolation root",
				data: search,
			};
		}
		const pattern = catalog.patterns.find((item) => item.id === id);
		const applied = applyPatternPlan({
			catalog,
			patternId: id,
			isolationRoot,
			targetPath:
				(typeof input.flags.path === "string" && input.flags.path) ||
				pattern?.renderings[0]?.outputFiles[0] ||
				"src/bindle.ts",
			isolationRunId:
				(typeof input.flags.run === "string" && input.flags.run) ||
				"template-apply",
			...(Object.keys(params).length > 0 ? { params } : {}),
		});
		return {
			ok: applied.status === 1,
			code: "HOBO_CODE_TEMPLATE",
			message: applied.reasonCode,
			data: applied,
		};
	}
	if (action === "render" || action === "show") {
		const id = search.selectedId || search.candidates[0]?.patternId;
		const pattern = catalog.patterns.find((item) => item.id === id);
		if (!pattern) {
			return {
				ok: false,
				code: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
				message: search.reasonCode,
				data: search,
			};
		}
		const rendered = renderPattern({
			catalog,
			pattern,
			...(Object.keys(params).length > 0 ? { params } : {}),
		});
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: rendered.files[0]?.contents ?? "",
			data: rendered,
		};
	}
	return {
		ok: search.status === 1 || search.candidates.length > 0,
		code: "HOBO_CODE_TEMPLATE",
		message:
			search.selectedId ||
			search.candidates.map((item) => item.patternId).join(" "),
		data: search,
	};
}

const TEMPLATE_SUB = new Set([
	"list",
	"search",
	"show",
	"render",
	"explain",
	"compose",
	"apply",
]);

function templateParams(
	flags: Readonly<Record<string, string | boolean>>,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (typeof flags.name === "string" && flags.name) {
		out.name = flags.name;
		out.resourceName = flags.name;
	}
	if (typeof flags.params === "string" && flags.params) {
		const parsed = JSON.parse(flags.params) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			for (const [key, value] of Object.entries(parsed)) {
				if (
					typeof value === "string" ||
					typeof value === "number" ||
					typeof value === "boolean"
				) {
					out[key] = String(value);
				}
			}
		}
	}
	return out;
}
