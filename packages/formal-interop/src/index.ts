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

export {
	evaluateClaimClassGate,
	NON_PROMOTABLE_COLD_CLAIM_CLASSES,
	type ClaimClass,
	type ClaimClassGateInput,
	type ClaimClassGateResult,
} from "./claim-class.js";

export {
	REQUIRED_ANTI_E237_ARMS,
	REQUIRED_KILL_CRITERIA,
	parseAntiE237Card,
	validateAntiE237Card,
	type AntiE237Card,
	type AntiE237Validation,
} from "./anti-e237.js";

export {
	candidateMultiset,
	enumerateExecutor,
	enumerateReference,
	forcedClosureDynamic,
	forcedClosureStatic,
	kernelFixtureCorpus,
	multisetsEqual,
	type CandidateStatus,
	type GammaState,
	type ResidualCandidate,
	type ResidualEnumerateResult,
	type ResidualPrefix,
	type StopReason,
} from "./residual-kernel.js";

export {
	appendExperimentRow,
	buildResidualArtifact,
	checkResidualArtifact,
	defaultExperimentLedgerPath,
	readExperimentLedger,
	runAntiE237Validation,
	runE1Parity,
	runE2Cold,
	runE3LoadCheck,
	runE4StaticMacros,
	runE8ZeroForward,
	runE9ClaimHygiene,
	runExperimentSuite,
	type E1ParityReport,
	type E2ColdReport,
	type E3LoadReport,
	type E4MacroReport,
	type E8ZeroForwardReport,
	type E9HygieneReport,
	type ExperimentId,
	type ExperimentRow,
	type ExperimentSuiteResult,
} from "./experiments.js";
