export {
	BINDLE_PRIMITIVES,
	BINDLE_RUNTIMES,
	REALIZATION_KINDS,
	ProfileIdError,
	isBindlePrimitive,
	isBindleRuntime,
	parseProfileId,
	tryParseProfileId,
	type BindlePrimitive,
	type BindleRuntime,
	type ParsedProfileId,
	type ProfileId,
	type RealizationKind,
} from "./ids.js";

export {
	CapabilityProfileError,
	parseCapabilityProfile,
	type CapabilityProfileDescriptor,
	type EvidenceSourceRef,
	type FeatureDescriptor,
	type GuaranteeDescriptor,
	type ParsedCapabilityProfile,
	type ProfileMaturity,
} from "./descriptor.js";

export {
	createCapabilityProfileRegistry,
	type CapabilityProfileRegistry,
} from "./registry.js";

export {
	CapabilityRequirementError,
	parseCapabilityRequirement,
	type CapabilityRequirement,
	type CapabilityRequirementInput,
	type PortabilityRequirementInput,
	type ProfileConstraint,
	type ProfileConstraintInput,
	type StructuredFeatureRequirementInput,
	type StructuredGuaranteeRequirementInput,
	type WeightedPreference,
	type WeightedPreferenceInput,
} from "./requirement.js";

export { STANDARD_CAPABILITY_PROFILES } from "./standard-profiles.js";

export {
	DEFAULT_TRUST_POLICY,
	REJECTION_CODES,
	selectCapabilityImplementation,
	type ClaimAtomicity,
	type ContinuityGrade,
	type CreatorAuthorityAfterClaim,
	type ProfileImplementation,
	type ProviderClass,
	type RejectionCode,
	type SelectionCandidate,
	type SelectionInput,
	type SelectionRejection,
	type SelectionResult,
	type TrustPolicy,
} from "./selection.js";
