// Promoted from src/draft/technical-proofs/evals-training-promotion-gates-poc
// (src/lint/use-training-lint.ts): the grounding lint ADR-0025 point 2
// requires — a "use training" method must carry intent + contract + rubric.

const REQUIRED_GROUNDINGS = ["intent", "contract", "rubric"] as const;

export interface UseTrainingLintFinding {
	readonly kind: (typeof REQUIRED_GROUNDINGS)[number];
	readonly message: string;
	readonly severity: "error";
}

export interface UseTrainingLintResult {
	readonly ok: boolean;
	readonly findings: readonly UseTrainingLintFinding[];
	readonly required?: readonly string[];
}

export function lintUseTrainingSource(source: string): UseTrainingLintResult {
	if (typeof source !== "string" || source.length === 0) {
		throw new TypeError("source must be a non-empty string");
	}

	if (
		!source.includes('"use training"') &&
		!source.includes("'use training'")
	) {
		return { ok: true, findings: [] };
	}

	const findings: UseTrainingLintFinding[] = [];
	const hasIntent = /@intent\b/.test(source) || /\bintent\s*:/.test(source);
	const hasContract =
		/\bcontract\s*:/.test(source) ||
		/\bContract\b/.test(source) ||
		/contractRef/.test(source);
	const hasRubric = /\brubric\s*:/.test(source) || /rubricRef/.test(source);

	if (!hasIntent) {
		findings.push(
			finding(
				"intent",
				"missing @intent docstring or training() intent option",
			),
		);
	}
	if (!hasContract) {
		findings.push(
			finding(
				"contract",
				"missing contract grounding (contract: or Contract type)",
			),
		);
	}
	if (!hasRubric) {
		findings.push(finding("rubric", "missing rubric thresholds or rubricRef"));
	}

	return {
		ok: findings.length === 0,
		findings,
		required: [...REQUIRED_GROUNDINGS],
	};
}

function finding(
	kind: UseTrainingLintFinding["kind"],
	message: string,
): UseTrainingLintFinding {
	return { kind, message, severity: "error" };
}
