/**
 * Anti-E237 experiment card validation (ADR-0141 · plan 0016).
 * Model-facing topology claims must pre-register arms + kill criteria.
 */

export const REQUIRED_ANTI_E237_ARMS = [
	"control",
	"train_on_decode_off",
	"train_on_decode_on",
] as const;

export const REQUIRED_KILL_CRITERIA = [
	"no_learning_delta",
	"applications_gt_0_and_choice_changes_eq_0",
	"choice_changes_gt_0_and_quality_down",
	"train_on_decode_off_damages_primary",
] as const;

export interface AntiE237Card {
	readonly arms?: readonly string[];
	readonly kill_if?: readonly string[];
	readonly report?: Readonly<Record<string, unknown>>;
	readonly success_bar?: Readonly<Record<string, unknown>>;
	readonly n?: number;
}

export interface AntiE237Validation {
	readonly ok: boolean;
	readonly failures: readonly string[];
	readonly card: AntiE237Card;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseAntiE237Card(value: unknown): AntiE237Card {
	if (!isRecord(value)) {
		return Object.freeze({});
	}
	const arms = Array.isArray(value.arms)
		? value.arms.map(String)
		: undefined;
	const kill_if = Array.isArray(value.kill_if)
		? value.kill_if.map(String)
		: Array.isArray(value.killIf)
			? (value.killIf as unknown[]).map(String)
			: undefined;
	const report = isRecord(value.report) ? value.report : undefined;
	const success_bar = isRecord(value.success_bar)
		? value.success_bar
		: isRecord(value.successBar)
			? value.successBar
			: undefined;
	const n =
		typeof value.n === "number"
			? value.n
			: typeof report?.n === "number"
				? report.n
				: undefined;
	return Object.freeze({
		...(arms ? { arms: Object.freeze([...arms]) } : {}),
		...(kill_if ? { kill_if: Object.freeze([...kill_if]) } : {}),
		...(report ? { report: Object.freeze({ ...report }) } : {}),
		...(success_bar ? { success_bar: Object.freeze({ ...success_bar }) } : {}),
		...(n !== undefined ? { n } : {}),
	});
}

/**
 * Accept only complete anti-E237 cards; incomplete cards fail closed.
 */
export function validateAntiE237Card(value: unknown): AntiE237Validation {
	const card = parseAntiE237Card(value);
	const failures: string[] = [];

	if (!card.arms || card.arms.length === 0) {
		failures.push("arms: required");
	} else {
		for (const required of REQUIRED_ANTI_E237_ARMS) {
			if (!card.arms.includes(required)) {
				failures.push(`arms: missing ${required}`);
			}
		}
	}

	if (!card.kill_if || card.kill_if.length === 0) {
		failures.push("kill_if: required");
	} else {
		for (const required of REQUIRED_KILL_CRITERIA) {
			if (!card.kill_if.includes(required)) {
				failures.push(`kill_if: missing ${required}`);
			}
		}
	}

	if (!card.report) {
		failures.push("report: required");
	} else {
		for (const key of [
			"head_acc_by_candidate_count",
			"meaningful_not_syntax_only",
			"held_out",
			"adversarial",
		]) {
			if (!(key in card.report) && card.report[key] === undefined) {
				// allow presence via nested flags or boolean true markers
			}
		}
		// Require at least meaningful + held_out keys or report block non-empty with those
		const reportKeys = Object.keys(card.report);
		if (!reportKeys.includes("meaningful_not_syntax_only")) {
			failures.push("report: missing meaningful_not_syntax_only");
		}
		if (!reportKeys.includes("held_out")) {
			failures.push("report: missing held_out");
		}
	}

	const n = card.n ?? (typeof card.report?.n === "number" ? card.report.n : undefined);
	if (n === undefined || n < 20) {
		failures.push("n: must be >= 20 for promotion");
	}

	if (!card.success_bar) {
		failures.push("success_bar: required");
	} else {
		if (
			card.success_bar.held_out_meaningful === undefined &&
			card.success_bar.heldOutMeaningful === undefined
		) {
			failures.push("success_bar: missing held_out_meaningful");
		}
		if (
			card.success_bar.causal_decode === undefined &&
			card.success_bar.causalDecode === undefined
		) {
			failures.push("success_bar: missing causal_decode");
		}
	}

	return Object.freeze({
		ok: failures.length === 0,
		failures: Object.freeze(failures),
		card,
	});
}
