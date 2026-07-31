/** Library / experiment tiers used across H1–H7. */
export type LibraryTier = "controlled" | "ecosystem" | "mismatch";

export type HypothesisId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7";

export type FormalMethod =
	| "zero-shot-frontier"
	| "constrained-slm"
	| "hybrid-ir"
	| "multi-itp-context"
	| "single-prover"
	| "semantic-beq"
	| "ablation"
	| "mismatch-inject"
	| "certificate-replay"
	| "specialized-slm";

export type TargetItp = "rocq" | "isabelle" | "hol-light";

/** OpenUI tree node: structure + semantic role/binder. */
export interface OpenUiNode {
	readonly kind: string;
	readonly role: string;
	readonly binder: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly children: readonly OpenUiNode[];
	/** False for syntax-perfect but meaning-zero shells. */
	readonly meaningBearing: boolean;
}

export interface OpenUiTree {
	readonly id: string;
	readonly root: OpenUiNode;
	readonly libraryTier: LibraryTier;
}

export interface BeqFailure {
	readonly path: string;
	readonly reason: string;
}

export interface BeqResult {
	readonly ok: boolean;
	readonly score: number;
	readonly failures: readonly BeqFailure[];
}

export interface FormalCertificate {
	readonly claimId: string;
	readonly theoremName: string;
	readonly irDigest: string;
	readonly proofDigest: string;
	readonly sourceItp: string;
	readonly typed: boolean;
}

export interface CertificateReplayResult {
	readonly ok: boolean;
	readonly code?: string;
	readonly detail?: string;
}

export interface MetricsLedgerRow {
	readonly hypothesis: HypothesisId;
	readonly tier: LibraryTier;
	readonly method: FormalMethod | string;
	readonly pass_at_1: number;
	readonly pass_at_k: number;
	readonly beq_or_fidelity: number;
	readonly agentv_scores: Readonly<Record<string, number>>;
	readonly preflight_reject_rate: number;
	readonly cost_usd: number;
	readonly latency_ms: number;
	readonly seed: string;
	readonly model: string;
	readonly prompt_digest: string;
}

export interface OpenUiPromotionInput {
	readonly candidateId: string;
	readonly artifactKind: "openui" | "other";
	readonly generated?: OpenUiTree;
	readonly goldOrIntent?: OpenUiTree;
	/** When false, semantic gate is skipped (non-OpenUI). Default: on for openui. */
	readonly semanticGateEnabled?: boolean;
	readonly certificate?: FormalCertificate | null;
	readonly formalPackagePresent?: boolean;
	readonly conformance?: boolean;
	readonly policy?: boolean;
	/**
	 * Evidence claim_class (ADR-0141). Cold-start claims fail closed when
	 * missing or fixture_or_scratch / request_local_memo_reuse.
	 */
	readonly claimClass?: string;
	/** When true, claimClass is evaluated under cold-start promotion rules. */
	readonly coldStartClaim?: boolean;
}

export interface OpenUiPromotionDecision {
	readonly ok: boolean;
	readonly candidateId: string;
	readonly failures: readonly string[];
	readonly beq?: BeqResult;
}
