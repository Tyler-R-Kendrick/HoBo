export {
	CAN_DEPLOY_SCHEMA_VERSION,
	type CanDeployInput,
	type CanDeployResult,
	type CandidateDeployment,
	COMPAT_GATE_FAILED,
	COMPAT_GATE_PASSED,
	type CompatibilityMatrixRow,
	type DeployedContractState,
	type DeploymentPlanInput,
	evaluateCanDeploy,
	type ResourcePlanRef,
	replayCanDeployDecision,
} from "./can-deploy.js";
export {
	type BoundaryContract,
	type BoundaryContractInput,
	CONTRACT_EDGE_KINDS,
	CONTRACT_IR_SCHEMA_VERSION,
	CONTRACT_MODES,
	type CompatibilityReason,
	type CompatibilityResult,
	type ContractEdge,
	type ContractEdgeKind,
	ContractIrValidationError,
	type ContractMode,
	canonicalJson,
	checkCompatibility,
	createBoundaryContract,
	isCompatible,
	parseBoundaryContract,
	type RequiredShape,
	serializeBoundaryContract,
} from "./contract-ir.js";
export {
	type CostQuotaInput,
	type CostQuotaRecord,
	evaluateGatekeeper,
	GATEKEEPER_DECIDED_EVENT,
	GATEKEEPER_SCHEMA_VERSION,
	type GatekeeperDecision,
	type GatekeeperEffect,
	type GatekeeperInput,
	type MachineReadableReason,
	type ObligationRecord,
	type SecretlessConfigGateVerdict,
} from "./gatekeeper.js";
export {
	createPermissiveDefaultPack,
	definePolicyRule,
	EFFECT_RANK,
	evaluatePolicyPack,
	POLICY_DECIDED_EVENT_TYPE,
	POLICY_PACK_ENGINE_ID,
	type PolicyDecisionRequest,
	type PolicyEffect,
	type PolicyEvaluation,
	type PolicyPack,
	type PolicyRule,
	type PolicyRuleOutcome,
} from "./policy-pack.js";

export {
	CONTRACT_ENGINE_INTERFACE,
	CONTRACT_ENGINE_PORT,
	GATEKEEPER_INTERFACE,
	GATEKEEPER_PORT,
} from "./port.js";

// public-contract: the package id consumers assert against.
export const HOBO_CONTRACTS_PACKAGE = "@hobo/contracts";
