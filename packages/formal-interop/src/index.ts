export type {
	BeqFailure,
	BeqResult,
	CertificateReplayResult,
	FormalCertificate,
	FormalMethod,
	HypothesisId,
	LibraryTier,
	MetricsLedgerRow,
	OpenUiNode,
	OpenUiPromotionDecision,
	OpenUiPromotionInput,
	OpenUiTree,
	TargetItp,
} from "./types.js";

export {
	OpenUiIrParseError,
	openUiNode,
	openUiTree,
	parseOpenUiNode,
	parseOpenUiTree,
} from "./openui-ir.js";

export { beqOpenUi } from "./beq.js";

export {
	controlledProduction,
	ecosystemProduction,
	fixtures,
	goldTree,
	hierarchyBrokenTree,
	meaningZeroTree,
} from "./fixtures.js";

export { evaluateOpenUiPromotion } from "./promotion.js";

export {
	FormalCertificateParseError,
	makeTypedCertificate,
	parseFormalCertificate,
	replayFormalCertificate,
} from "./certificate.js";

export {
	CONTROLLED_LIBRARY,
	ECOSYSTEM_LIBRARY,
	isControlledTree,
	libraryForTier,
} from "./libraries.js";

export {
	runControlledVsEcosystemAblation,
	type AblationResult,
	type AblationSample,
	type TierStats,
} from "./ablation.js";

export {
	injectLibraryMismatch,
	runMismatchSuite,
	type MismatchInjectionResult,
	type MismatchKind,
} from "./mismatch.js";

export {
	HYPOTHESES,
	appendMetricsRow,
	assertAllHypothesesPresent,
	defaultLedgerPath,
	freezeRow,
	hypothesesCovered,
	readMetricsLedger,
	requiredColumnsPresent,
	resetLedger,
} from "./metrics.js";

export {
	CONTROLLED_THEOREMS,
	MATHLIB_DEPENDENT_FIXTURE,
	checkFormalPackage,
	formalPackageRoot,
	inspectFormalPackage,
	type FormalPackageStatus,
	type LeanCheckResult,
} from "./formal-package.js";

export {
	runMultiItpHarness,
	targetItps,
	translateTheorem,
	type TranslationAttempt,
	type TranslationMethod,
	type TranslationResult,
} from "./multi-itp.js";

export {
	runFormalInteropTraining,
	type FormalInteropEvalRow,
	type FormalInteropTrainRequest,
	type FormalInteropTrainResult,
} from "./training.js";
