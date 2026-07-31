/** Formal metric scorecard helpers for expect / act / outcome. */

export type PrimaryScores = {
	harms: number;
	friction: number;
	uncertainty: number;
	total: number;
	max: number;
};

export type HcdKey =
	| "visibilityOfSystemStatus"
	| "matchWithMentalModel"
	| "userControlAndFreedom"
	| "consistencyAndStandards"
	| "errorPrevention"
	| "recognitionOverRecall"
	| "flexibilityAndEfficiency"
	| "aestheticAndMinimalistDesign"
	| "errorRecovery"
	| "helpAndDocumentation"
	| "accessibilityAndInclusion"
	| "trustAndSafety";

export const HCD_KEYS: HcdKey[] = [
	"visibilityOfSystemStatus",
	"matchWithMentalModel",
	"userControlAndFreedom",
	"consistencyAndStandards",
	"errorPrevention",
	"recognitionOverRecall",
	"flexibilityAndEfficiency",
	"aestheticAndMinimalistDesign",
	"errorRecovery",
	"helpAndDocumentation",
	"accessibilityAndInclusion",
	"trustAndSafety",
];

export type MetricScorecard = {
	schemaVersion: 1;
	phase: "expect" | "act" | "outcome";
	role: "predicted" | "observed" | "judged";
	persona: string;
	surface: string;
	primary: PrimaryScores;
	hcd?: Partial<Record<HcdKey, number>>;
	hcdTotal?: number;
	hcdMax?: number;
	rationale: {
		harms?: string;
		friction?: string;
		uncertainty?: string;
	};
	evidenceRefs: string[];
	scoredAt: string;
};

export type ScoreDelta = {
	harms: number;
	friction: number;
	uncertainty: number;
	total: number;
	max: number;
};

export type OutcomeComparison = {
	expectId: string;
	actId?: string;
	deltaFromExpect: ScoreDelta;
	deltaFromAct?: ScoreDelta;
	matchedExpectation: boolean;
	expectationMatch: {
		behavior: boolean;
		scoresWithinTol: boolean;
		tolerance: number;
	};
};

function isInt0to5(n: unknown): n is number {
	return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 5;
}

export function buildPrimary(
	harms: number,
	friction: number,
	uncertainty: number,
): PrimaryScores {
	return {
		harms,
		friction,
		uncertainty,
		total: harms + friction + uncertainty,
		max: Math.max(harms, friction, uncertainty),
	};
}

export function deltaPrimary(from: PrimaryScores, to: PrimaryScores): ScoreDelta {
	// positive = worse than baseline
	return {
		harms: to.harms - from.harms,
		friction: to.friction - from.friction,
		uncertainty: to.uncertainty - from.uncertainty,
		total: to.total - from.total,
		max: to.max - from.max,
	};
}

export function scoresWithinTolerance(
	predicted: PrimaryScores,
	judged: PrimaryScores,
	tolerance = 0,
): boolean {
	return (
		Math.abs(judged.harms - predicted.harms) <= tolerance &&
		Math.abs(judged.friction - predicted.friction) <= tolerance &&
		Math.abs(judged.uncertainty - predicted.uncertainty) <= tolerance
	);
}

export function validateScorecard(
	raw: unknown,
	expectedPhase?: MetricScorecard["phase"],
): string[] {
	const problems: string[] = [];
	if (!raw || typeof raw !== "object") {
		return ["scores: missing or not an object"];
	}
	const s = raw as Partial<MetricScorecard>;
	if (s.schemaVersion !== 1) problems.push("scores.schemaVersion must be 1");
	if (expectedPhase && s.phase !== expectedPhase) {
		problems.push(`scores.phase must be ${expectedPhase}`);
	} else if (!["expect", "act", "outcome"].includes(String(s.phase))) {
		problems.push("scores.phase invalid");
	}
	const roleByPhase: Record<string, string> = {
		expect: "predicted",
		act: "observed",
		outcome: "judged",
	};
	if (s.phase && s.role !== roleByPhase[s.phase]) {
		problems.push(
			`scores.role must be ${roleByPhase[s.phase!]} for phase ${s.phase}`,
		);
	}
	if (!s.persona || typeof s.persona !== "string") {
		problems.push("scores.persona required");
	}
	if (!s.surface || typeof s.surface !== "string") {
		problems.push("scores.surface required");
	}
	const p = s.primary;
	if (!p || typeof p !== "object") {
		problems.push("scores.primary required");
	} else {
		for (const k of ["harms", "friction", "uncertainty"] as const) {
			if (!isInt0to5(p[k])) problems.push(`scores.primary.${k} must be int 0-5`);
		}
		if (isInt0to5(p.harms) && isInt0to5(p.friction) && isInt0to5(p.uncertainty)) {
			const total = p.harms + p.friction + p.uncertainty;
			const max = Math.max(p.harms, p.friction, p.uncertainty);
			if (p.total !== total) {
				problems.push(`scores.primary.total must be ${total}`);
			}
			if (p.max !== max) {
				problems.push(`scores.primary.max must be ${max}`);
			}
		}
	}
	if (!s.rationale || typeof s.rationale !== "object") {
		problems.push("scores.rationale required");
	} else if (p && typeof p === "object") {
		for (const k of ["harms", "friction", "uncertainty"] as const) {
			if (isInt0to5(p[k]) && p[k]! >= 1 && !s.rationale[k]) {
				problems.push(`scores.rationale.${k} required when primary.${k} >= 1`);
			}
		}
	}
	if (!Array.isArray(s.evidenceRefs)) {
		problems.push("scores.evidenceRefs must be an array");
	}
	if (s.phase === "act" || s.phase === "outcome") {
		if (Array.isArray(s.evidenceRefs) && s.evidenceRefs.length === 0) {
			problems.push(`scores.evidenceRefs should be non-empty for ${s.phase}`);
		}
	}
	if (!s.scoredAt || typeof s.scoredAt !== "string") {
		problems.push("scores.scoredAt required");
	}
	if (s.hcd && typeof s.hcd === "object") {
		let hcdTotal = 0;
		let hcdMax = 0;
		for (const key of Object.keys(s.hcd)) {
			const v = (s.hcd as Record<string, unknown>)[key];
			if (!isInt0to5(v)) problems.push(`scores.hcd.${key} must be int 0-5`);
			else {
				hcdTotal += v;
				hcdMax = Math.max(hcdMax, v);
			}
		}
		if (s.hcdTotal !== undefined && s.hcdTotal !== hcdTotal) {
			problems.push(`scores.hcdTotal must be ${hcdTotal}`);
		}
		if (s.hcdMax !== undefined && s.hcdMax !== hcdMax) {
			problems.push(`scores.hcdMax must be ${hcdMax}`);
		}
	}
	return problems;
}

export function validateComparison(
	raw: unknown,
	expectPrimary?: PrimaryScores,
	actPrimary?: PrimaryScores,
	judged?: PrimaryScores,
): string[] {
	const problems: string[] = [];
	if (!raw || typeof raw !== "object") {
		return ["comparison: missing"];
	}
	const c = raw as Partial<OutcomeComparison>;
	if (!c.expectId) problems.push("comparison.expectId required");
	if (!c.deltaFromExpect || typeof c.deltaFromExpect !== "object") {
		problems.push("comparison.deltaFromExpect required");
	} else if (expectPrimary && judged) {
		const d = deltaPrimary(expectPrimary, judged);
		for (const k of ["harms", "friction", "uncertainty", "total", "max"] as const) {
			if (c.deltaFromExpect[k] !== d[k]) {
				problems.push(
					`comparison.deltaFromExpect.${k} must be ${d[k]} (judged - expect)`,
				);
			}
		}
	}
	if (actPrimary && judged && c.deltaFromAct) {
		const d = deltaPrimary(actPrimary, judged);
		for (const k of ["harms", "friction", "uncertainty", "total", "max"] as const) {
			if (c.deltaFromAct[k] !== d[k]) {
				problems.push(
					`comparison.deltaFromAct.${k} must be ${d[k]} (judged - act)`,
				);
			}
		}
	}
	if (!c.expectationMatch || typeof c.expectationMatch !== "object") {
		problems.push("comparison.expectationMatch required");
	} else {
		if (typeof c.expectationMatch.behavior !== "boolean") {
			problems.push("comparison.expectationMatch.behavior must be boolean");
		}
		if (typeof c.expectationMatch.scoresWithinTol !== "boolean") {
			problems.push("comparison.expectationMatch.scoresWithinTol must be boolean");
		}
		if (
			typeof c.expectationMatch.tolerance !== "number" ||
			c.expectationMatch.tolerance < 0
		) {
			problems.push("comparison.expectationMatch.tolerance must be >= 0");
		}
		if (expectPrimary && judged && typeof c.expectationMatch.tolerance === "number") {
			const within = scoresWithinTolerance(
				expectPrimary,
				judged,
				c.expectationMatch.tolerance,
			);
			if (c.expectationMatch.scoresWithinTol !== within) {
				problems.push(
					`comparison.expectationMatch.scoresWithinTol must be ${within}`,
				);
			}
			const overall =
				Boolean(c.expectationMatch.behavior) &&
				Boolean(c.expectationMatch.scoresWithinTol);
			if (c.matchedExpectation !== overall) {
				problems.push(
					`comparison.matchedExpectation must be ${overall} (behavior && scoresWithinTol)`,
				);
			}
		}
	}
	return problems;
}

export function makeScorecard(input: {
	phase: MetricScorecard["phase"];
	persona: string;
	surface: string;
	harms: number;
	friction: number;
	uncertainty: number;
	rationale?: MetricScorecard["rationale"];
	evidenceRefs?: string[];
	hcd?: MetricScorecard["hcd"];
	scoredAt?: string;
}): MetricScorecard {
	const role =
		input.phase === "expect"
			? "predicted"
			: input.phase === "act"
				? "observed"
				: "judged";
	const primary = buildPrimary(input.harms, input.friction, input.uncertainty);
	const card: MetricScorecard = {
		schemaVersion: 1,
		phase: input.phase,
		role,
		persona: input.persona,
		surface: input.surface,
		primary,
		rationale: input.rationale ?? {},
		evidenceRefs: input.evidenceRefs ?? [],
		scoredAt: input.scoredAt ?? new Date().toISOString(),
	};
	if (input.hcd) {
		card.hcd = input.hcd;
		let total = 0;
		let max = 0;
		for (const k of Object.keys(input.hcd) as HcdKey[]) {
			const v = input.hcd[k];
			if (typeof v === "number") {
				total += v;
				max = Math.max(max, v);
			}
		}
		card.hcdTotal = total;
		card.hcdMax = max;
	}
	return card;
}

export function makeComparison(input: {
	expectId: string;
	actId?: string;
	expectPrimary: PrimaryScores;
	actPrimary?: PrimaryScores;
	judgedPrimary: PrimaryScores;
	behaviorMatched: boolean;
	tolerance?: number;
}): OutcomeComparison {
	const tolerance = input.tolerance ?? 0;
	const scoresWithinTol = scoresWithinTolerance(
		input.expectPrimary,
		input.judgedPrimary,
		tolerance,
	);
	const comparison: OutcomeComparison = {
		expectId: input.expectId,
		deltaFromExpect: deltaPrimary(input.expectPrimary, input.judgedPrimary),
		matchedExpectation: input.behaviorMatched && scoresWithinTol,
		expectationMatch: {
			behavior: input.behaviorMatched,
			scoresWithinTol,
			tolerance,
		},
	};
	if (input.actId) comparison.actId = input.actId;
	if (input.actPrimary) {
		comparison.deltaFromAct = deltaPrimary(
			input.actPrimary,
			input.judgedPrimary,
		);
	}
	return comparison;
}
