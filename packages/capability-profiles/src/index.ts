export {
	type CapabilityProfileDescriptor,
	CapabilityProfileError,
	type EvidenceSourceRef,
	type FeatureDescriptor,
	type GuaranteeDescriptor,
	type ParsedCapabilityProfile,
	type ProfileMaturity,
	parseCapabilityProfile,
} from "./descriptor.js";
export {
	BINDLE_PRIMITIVES,
	BINDLE_RUNTIMES,
	type BindlePrimitive,
	type BindleRuntime,
	isBindlePrimitive,
	isBindleRuntime,
	type ParsedProfileId,
	type ProfileId,
	ProfileIdError,
	parseProfileId,
	REALIZATION_KINDS,
	type RealizationKind,
	tryParseProfileId,
} from "./ids.js";

export {
	type CapabilityProfileRegistry,
	createCapabilityProfileRegistry,
} from "./registry.js";

export {
	type CapabilityRequirement,
	CapabilityRequirementError,
	type CapabilityRequirementInput,
	type PortabilityRequirementInput,
	type ProfileConstraint,
	type ProfileConstraintInput,
	parseCapabilityRequirement,
	type StructuredFeatureRequirementInput,
	type StructuredGuaranteeRequirementInput,
	type WeightedPreference,
	type WeightedPreferenceInput,
} from "./requirement.js";
export {
	type ClaimAtomicity,
	type ContinuityGrade,
	type CreatorAuthorityAfterClaim,
	DEFAULT_TRUST_POLICY,
	type ProfileImplementation,
	type ProviderClass,
	REJECTION_CODES,
	type RejectionCode,
	type SelectionCandidate,
	type SelectionInput,
	type SelectionRejection,
	type SelectionResult,
	selectCapabilityImplementation,
	type TrustPolicy,
} from "./selection.js";
export { STANDARD_CAPABILITY_PROFILES } from "./standard-profiles.js";
