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
	if (!query) {
		return {
			ok: false,
			code: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
			message: "template needs a query or --id",
			data: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0 },
		};
	}
	const search = searchPatterns({ catalog, vocabulary, query });
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
		const applied = applyPatternPlan({
			catalog,
			patternId: id,
			isolationRoot,
			targetPath:
				(typeof input.flags.path === "string" && input.flags.path) ||
				"src/bindle.ts",
			isolationRunId:
				(typeof input.flags.run === "string" && input.flags.run) ||
				"template-apply",
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
		const rendered = renderPattern({ catalog, pattern });
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
	"search",
	"show",
	"render",
	"explain",
	"compose",
	"apply",
]);
