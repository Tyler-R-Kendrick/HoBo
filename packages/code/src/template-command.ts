import {
	applyPatternPlan,
	buildHoboVocabulary,
	composePatterns,
	explainPatternMatch,
	loadPatternCatalog,
	PatternKind,
	PatternMaturity,
	renderPattern,
	searchPatterns,
	validateRenderedPattern,
} from "@hobo/patterns";
import {
	isJsonNumber,
	isJsonObject,
	isJsonString,
	type JsonValue,
} from "./json.js";

export function runTemplateCommand(input: {
	readonly args: readonly string[];
	readonly flags: { readonly [name: string]: string | boolean };
}) {
	const catalog = loadPatternCatalog();
	const vocabulary = buildHoboVocabulary();
	const sub = input.args[0];
	const rest = input.args.slice(sub && TEMPLATE_SUB.has(sub) ? 1 : 0);
	const query =
		(isJsonString(input.flags.id) && input.flags.id) || rest.join(" ");
	const action = resolveAction(sub, input.flags);
	if (action === "list" || (action === "search" && !query)) {
		const rows = catalog.patterns.flatMap((item) => {
			const label = (item.intent || item.title || "").trim();
			return label ? [item.id, `  ${label}`] : [item.id];
		});
		const ids = catalog.patterns.map((item) => item.id);
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: [
				`templates · ${ids.length}`,
				"",
				...rows,
				"",
				"/template <id> to preview · /template apply <id> --out <dir>",
				"0 LLM calls · 0 LLM tokens",
			].join("\n"),
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
			code: "HOBO_CODE_TEMPLATE_USAGE",
			message:
				"template needs a query, --id, or list\n\n0 LLM calls · 0 LLM tokens",
			data: { llmCalls: 0, llmInputTokens: 0, llmOutputTokens: 0 },
		};
	}
	const params = templateParams(input.flags);
	const search = searchPatterns({
		catalog,
		vocabulary,
		query: {
			query,
			id: isJsonString(input.flags.id) ? input.flags.id : "",
			autoSelect: true,
			topK: input.flags["top-k"],
			kind: input.flags.kind,
			maturity: input.flags.maturity,
			language: input.flags.language,
			context: input.flags.context,
			allowDense:
				input.flags.dense === true && input.flags["no-dense"] !== true,
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
			message: `${composed.chosenIds.join(" ") || composed.reasonCode}\n\n0 LLM calls · 0 LLM tokens`,
			data: composed,
		};
	}
	if (action === "explain" || input.flags.explain === true) {
		const id = search.selectedId || search.candidates[0]?.patternId || query;
		const explanation = explainPatternMatch({
			catalog,
			vocabulary,
			query,
			patternId: id,
		});
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: `${explanation}\n\n0 LLM calls · 0 LLM tokens`,
			data: search,
		};
	}
	if (action === "apply") {
		const id = search.selectedId || search.candidates[0]?.patternId;
		const isolationRoot = isJsonString(input.flags.out)
			? input.flags.out
			: isJsonString(input.flags.isolation)
				? input.flags.isolation
				: "";
		if (!id || !isolationRoot) {
			return {
				ok: false,
				code: "HOBO_CODE_TEMPLATE_INDEX_INVALID",
				message:
					"apply needs a selected pattern and --out isolation root\n\n0 LLM calls · 0 LLM tokens",
				data: search,
			};
		}
		const pattern = catalog.patterns.find((item) => item.id === id);
		const applied = applyPatternPlan({
			catalog,
			patternId: id,
			isolationRoot,
			targetPath:
				(isJsonString(input.flags.target) && input.flags.target) ||
				(isJsonString(input.flags.path) && input.flags.path) ||
				pattern?.renderings[0]?.outputFiles[0] ||
				"src/bindle.ts",
			isolationRunId:
				(isJsonString(input.flags.run) && input.flags.run) || "template-apply",
			...(Object.keys(params).length > 0 ? { params } : undefined),
		});
		return {
			ok: applied.status === 1,
			code: "HOBO_CODE_TEMPLATE",
			message: `${applied.reasonCode}\n\n0 LLM calls · 0 LLM tokens`,
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
				message: `${search.reasonCode}\n\n0 LLM calls · 0 LLM tokens`,
				data: search,
			};
		}
		const rendered = renderPattern({
			catalog,
			pattern,
			...(isJsonString(input.flags.format)
				? { renderingId: input.flags.format }
				: undefined),
			...(Object.keys(params).length > 0 ? { params } : undefined),
		});
		const validation = validateRenderedPattern({ pattern, rendered });
		const maturity =
			PatternMaturity[pattern.maturity] ?? String(pattern.maturity);
		const kind = PatternKind[pattern.kind] ?? String(pattern.kind);
		return {
			ok: true,
			code: "HOBO_CODE_TEMPLATE",
			message: [
				`${pattern.id} v${pattern.version} ${maturity.toLowerCase()} ${kind.toLowerCase()}`,
				pattern.intent,
				rendered.files[0]?.contents ?? "",
				`validation: ${validation.ok ? "ok" : validation.issues.join("; ")}`,
				"0 LLM calls · 0 LLM tokens",
				`hobo-code template explain ${pattern.id}`,
			].join("\n"),
			data: rendered,
		};
	}
	const selected = catalog.patterns.find(
		(item) => item.id === search.selectedId,
	);
	const preview =
		selected && search.selectedId
			? renderPattern({
					catalog,
					pattern: selected,
					...(Object.keys(params).length > 0 ? { params } : undefined),
				})
			: undefined;
	const validation =
		selected && preview
			? validateRenderedPattern({ pattern: selected, rendered: preview })
			: undefined;
	return {
		ok: search.status === 1 || search.candidates.length > 0,
		code: "HOBO_CODE_TEMPLATE",
		message: [
			search.selectedId ||
				search.candidates.map((item) => item.patternId).join(" ") ||
				search.reasonCode,
			search.reasonCode,
			preview?.files[0]?.contents ?? "",
			validation
				? `validation: ${validation.ok ? "ok" : validation.issues.join("; ")}`
				: "",
			"0 LLM calls · 0 LLM tokens",
			search.selectedId
				? `hobo-code template explain ${search.selectedId}`
				: "",
		]
			.filter(Boolean)
			.join("\n"),
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

function resolveAction(
	sub: string | undefined,
	flags: { readonly [name: string]: string | boolean },
): string {
	if (sub && TEMPLATE_SUB.has(sub)) return sub;
	if (flags.apply === true) return "apply";
	if (flags.explain === true) return "explain";
	return "search";
}

function templateParams(flags: { readonly [name: string]: string | boolean }) {
	const out = {};
	if (isJsonString(flags.name) && flags.name) {
		Object.assign(out, { name: flags.name, resourceName: flags.name });
	}
	if (isJsonString(flags.params) && flags.params) {
		// SAFETY: --params is JSON text at the CLI boundary.
		const parsed = JSON.parse(flags.params) as JsonValue;
		if (parsed && isJsonObject(parsed) && !Array.isArray(parsed)) {
			for (const [key, value] of Object.entries(parsed)) {
				if (
					isJsonString(value) ||
					isJsonNumber(value) ||
					value === true ||
					value === false
				) {
					Object.assign(out, { [key]: String(value) });
				}
			}
		}
	}
	return out;
}
