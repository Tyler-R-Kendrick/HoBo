export const HOBO_RUNTIME_PACKAGE = "@hobo/runtime";

// Trainable-method authoring surface (ADR-0025 / ADR-0125): the promised
// `import { training } from "@hobo/runtime"` (sdk-api.md §Trainable methods).
export {
	applyTrainingArtifact,
	type FieldMetadata,
	getAppliedArtifact,
	getTrainable,
	isTrainable,
	lintUseTrainingSource,
	listTrainables,
	type RecordedTrainableCall,
	resetTrainables,
	stub,
	TRAINABLE,
	TRAINABLE_METADATA,
	type Trainable,
	type TrainableManifestFact,
	type TrainableRecord,
	TrainingArtifactError,
	type TrainingContract,
	type TrainingExample,
	TrainingGroundingError,
	type TrainingOptions,
	trainable,
	training,
	USE_TRAINING_LINT_SCHEMA,
	type UseTrainingLintFinding,
	type UseTrainingLintResult,
} from "./training/index.js";
