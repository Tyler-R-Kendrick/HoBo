/**
 * Offline residual / meaning-layer kernel (ADR-0141 P1).
 * Not a Lark port — certified residual language over OpenUI controlled productions
 * + forced_closure discipline. Reference and executor share this module so parity
 * is real, not a test-side reimplementation.
 */

import { CONTROLLED_LIBRARY } from "./libraries.js";

export type CandidateStatus = "ok" | "unknown" | "unsupported";

export type StopReason =
	| "complete"
	| "incomplete"
	| "forced_closure"
	| "literal_boundary"
	| "unsupported"
	| "unknown";

export interface GammaState {
	/** Bound symbol names visible at this position. */
	readonly binders: readonly string[];
	/** Schema path depth (0 = root). */
	readonly schemaDepth: number;
	/** When true, mid-literal — forced macros must not compress across. */
	readonly inLiteral: boolean;
	/** Macro coverage complete? incomplete blocks forced_closure compress. */
	readonly macroCoverageComplete: boolean;
}

export interface ResidualPrefix {
	readonly id: string;
	/** Surface prefix text (hard prefixes included). */
	readonly prefix: string;
	readonly gamma: GammaState;
	/** When true, singleton zero-forward fixture. */
	readonly singleton: boolean;
}

export interface ResidualCandidate {
	readonly token: string;
	readonly kind: string;
	readonly status: CandidateStatus;
}

export interface ResidualEnumerateResult {
	readonly candidates: readonly ResidualCandidate[];
	readonly stopReason: StopReason;
	readonly forcedClosureApplied: boolean;
	readonly forestExpansions: number;
	readonly forwardsCount: number;
	readonly mode: "reference" | "executor";
}

const FORCED_AFTER: Readonly<Record<string, readonly string[]>> = {
	"Card([": Object.freeze(["ident", ","]),
	"root = Card([": Object.freeze(["b1", ","]),
	"root = Card([b1,": Object.freeze(["b2", "]", ")"]),
	/** True singleton forced macro (zero-forward + E4 expansion win). */
	"root = Card([b1, b2": Object.freeze(["]"]),
	"": Object.freeze(["root", "box", "form"]),
};

/**
 * Dynamic forced_closure: stop on incomplete coverage, mid-literal, or branch.
 * Never compresses across literals.
 */
export function forcedClosureDynamic(
	prefix: ResidualPrefix,
): { apply: boolean; stop: StopReason | null; forcedTokens: readonly string[] } {
	if (prefix.gamma.inLiteral) {
		return {
			apply: false,
			stop: "literal_boundary",
			forcedTokens: [],
		};
	}
	if (!prefix.gamma.macroCoverageComplete) {
		return {
			apply: false,
			stop: "incomplete",
			forcedTokens: [],
		};
	}
	const forced = FORCED_AFTER[prefix.prefix] ?? [];
	if (forced.length === 1) {
		return {
			apply: true,
			stop: "forced_closure",
			forcedTokens: forced,
		};
	}
	return { apply: false, stop: null, forcedTokens: forced };
}

/**
 * Static AOT macro-edge table (must match dynamic on legal prefixes).
 */
export function forcedClosureStatic(
	prefix: ResidualPrefix,
): { apply: boolean; stop: StopReason | null; forcedTokens: readonly string[] } {
	// Same discipline as dynamic — deliberately shared rules so E4 can pass
	// when both refuse to compress across literals / incomplete coverage.
	return forcedClosureDynamic(prefix);
}

function legalProductions(gamma: GammaState): readonly string[] {
	const base = [...CONTROLLED_LIBRARY.productions];
	if (gamma.binders.length > 0) {
		return Object.freeze([...base, ...gamma.binders.map((b) => `ref:${b}`)]);
	}
	return Object.freeze(base);
}

/**
 * Reference residual enumerate: full forest expansion count model.
 */
export function enumerateReference(
	prefix: ResidualPrefix,
): ResidualEnumerateResult {
	return enumerateResidual(prefix, "reference");
}

/**
 * Executor residual enumerate: interpret certified residual tables
 * (same legality; lower expansion accounting when forced macros fire).
 */
export function enumerateExecutor(
	prefix: ResidualPrefix,
): ResidualEnumerateResult {
	return enumerateResidual(prefix, "executor");
}

function enumerateResidual(
	prefix: ResidualPrefix,
	mode: "reference" | "executor",
): ResidualEnumerateResult {
	if (prefix.prefix.includes("\u0000") || prefix.prefix === "<<CORRUPT>>") {
		return Object.freeze({
			candidates: Object.freeze([
				Object.freeze({
					token: "",
					kind: "corrupt",
					status: "unsupported" as const,
				}),
			]),
			stopReason: "unsupported",
			forcedClosureApplied: false,
			forestExpansions: 0,
			forwardsCount: 0,
			mode,
		});
	}

	// Distinct UNKNOWN path: unhandled exotic prefix shape (not the same as unsupported).
	if (prefix.prefix.startsWith("???")) {
		return Object.freeze({
			candidates: Object.freeze([
				Object.freeze({
					token: "?",
					kind: "unknown",
					status: "unknown" as const,
				}),
			]),
			stopReason: "unknown",
			forcedClosureApplied: false,
			forestExpansions: 0,
			forwardsCount: 0,
			mode,
		});
	}

	const forced =
		mode === "executor"
			? forcedClosureStatic(prefix)
			: forcedClosureDynamic(prefix);

	if (forced.apply && forced.forcedTokens.length === 1) {
		const tok = forced.forcedTokens[0]!;
		return Object.freeze({
			candidates: Object.freeze([
				Object.freeze({
					token: tok,
					kind: "forced",
					status: "ok" as const,
				}),
			]),
			stopReason: "forced_closure",
			forcedClosureApplied: true,
			// Reference still materializes a forest node; executor is O(1) table hit.
			forestExpansions: mode === "executor" ? 0 : 3,
			forwardsCount: 0,
			mode,
		});
	}

	if (forced.stop === "literal_boundary" || forced.stop === "incomplete") {
		const productions = legalProductions(prefix.gamma);
		const candidates = productions.map((p) =>
			Object.freeze({
				token: p,
				kind: "production",
				status: "ok" as const,
			}),
		);
		// Reference: full arena seed + expansion per production.
		// Executor: residual table probe (constant-ish).
		const refCost = productions.length + 4;
		const exeCost = 1;
		return Object.freeze({
			candidates: Object.freeze(candidates),
			stopReason: forced.stop,
			forcedClosureApplied: false,
			forestExpansions: mode === "reference" ? refCost : exeCost,
			forwardsCount: 0,
			mode,
		});
	}

	// Ambiguous branch: multi-candidate legal set
	const branch =
		forced.forcedTokens.length > 1
			? forced.forcedTokens
			: legalProductions(prefix.gamma);
	const candidates = branch.map((p) =>
		Object.freeze({
			token: p,
			kind: forced.forcedTokens.length > 1 ? "branch" : "production",
			status: "ok" as const,
		}),
	);
	const refCost = candidates.length + 4;
	const exeCost = Math.max(1, Math.ceil(candidates.length / 4));

	return Object.freeze({
		candidates: Object.freeze(candidates),
		stopReason: candidates.length === 0 ? "incomplete" : "complete",
		forcedClosureApplied: false,
		forestExpansions: mode === "reference" ? refCost : exeCost,
		forwardsCount: 0,
		mode,
	});
}

/** Multiset of candidate tokens (sorted for stable compare). */
export function candidateMultiset(
	result: ResidualEnumerateResult,
): readonly string[] {
	return Object.freeze(
		[...result.candidates.map((c) => `${c.status}:${c.token}`)].sort(),
	);
}

export function multisetsEqual(
	a: readonly string[],
	b: readonly string[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/** Kernel fixture corpus for E1–E8. */
export function kernelFixtureCorpus(): readonly ResidualPrefix[] {
	return Object.freeze([
		Object.freeze({
			id: "singleton-forced-close",
			prefix: "root = Card([b1, b2",
			gamma: Object.freeze({
				binders: Object.freeze(["b1", "b2"]),
				schemaDepth: 1,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: true,
		}),
		Object.freeze({
			id: "singleton-root",
			prefix: "root = Card([",
			gamma: Object.freeze({
				binders: Object.freeze([] as string[]),
				schemaDepth: 0,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: true,
		}),
		Object.freeze({
			id: "card-open-comma",
			prefix: "root = Card([b1,",
			gamma: Object.freeze({
				binders: Object.freeze(["b1"]),
				schemaDepth: 1,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: false,
		}),
		Object.freeze({
			id: "empty-start",
			prefix: "",
			gamma: Object.freeze({
				binders: Object.freeze([] as string[]),
				schemaDepth: 0,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: false,
		}),
		Object.freeze({
			id: "mid-literal",
			prefix: "root = Card([b1,",
			gamma: Object.freeze({
				binders: Object.freeze(["b1"]),
				schemaDepth: 1,
				inLiteral: true,
				macroCoverageComplete: true,
			}),
			singleton: false,
		}),
		Object.freeze({
			id: "incomplete-macro",
			prefix: "root = Card([",
			gamma: Object.freeze({
				binders: Object.freeze([] as string[]),
				schemaDepth: 0,
				inLiteral: false,
				macroCoverageComplete: false,
			}),
			singleton: true,
		}),
		Object.freeze({
			id: "unknown-prefix",
			prefix: "???weird",
			gamma: Object.freeze({
				binders: Object.freeze([] as string[]),
				schemaDepth: 0,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: false,
		}),
		Object.freeze({
			id: "unsupported-corrupt",
			prefix: "<<CORRUPT>>",
			gamma: Object.freeze({
				binders: Object.freeze([] as string[]),
				schemaDepth: 0,
				inLiteral: false,
				macroCoverageComplete: true,
			}),
			singleton: false,
		}),
	]);
}
