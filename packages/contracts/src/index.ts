export {
	CONTRACT_IR_SCHEMA_VERSION,
	CONTRACT_MODES,
	CONTRACT_EDGE_KINDS,
	ContractIrValidationError,
	canonicalJson,
	checkCompatibility,
	createBoundaryContract,
	isCompatible,
	parseBoundaryContract,
	serializeBoundaryContract,
	type BoundaryContract,
	type BoundaryContractInput,
	type CompatibilityReason,
	type CompatibilityResult,
	type ContractEdge,
	type ContractEdgeKind,
	type ContractMode,
	type RequiredShape,
} from "./contract-ir.js";

export {
	CAN_DEPLOY_SCHEMA_VERSION,
	COMPAT_GATE_FAILED,
	COMPAT_GATE_PASSED,
	evaluateCanDeploy,
	replayCanDeployDecision,
	type CanDeployInput,
	type CanDeployResult,
	type CandidateDeployment,
	type CompatibilityMatrixRow,
	type DeployedContractState,
	type DeploymentPlanInput,
	type ResourcePlanRef,
} from "./can-deploy.js";

export {
	EFFECT_RANK,
	POLICY_DECIDED_EVENT_TYPE,
	POLICY_PACK_ENGINE_ID,
	createPermissiveDefaultPack,
	definePolicyRule,
	evaluatePolicyPack,
	type PolicyDecisionRequest,
	type PolicyEffect,
	type PolicyEvaluation,
	type PolicyPack,
	type PolicyRule,
	type PolicyRuleOutcome,
} from "./policy-pack.js";

export {
	GATEKEEPER_DECIDED_EVENT,
	GATEKEEPER_SCHEMA_VERSION,
	evaluateGatekeeper,
	type CostQuotaInput,
	type CostQuotaRecord,
	type GatekeeperDecision,
	type GatekeeperEffect,
	type GatekeeperInput,
	type MachineReadableReason,
	type ObligationRecord,
} from "./gatekeeper.js";

export {
	CONTRACT_ENGINE_INTERFACE,
	CONTRACT_ENGINE_PORT,
	GATEKEEPER_INTERFACE,
	GATEKEEPER_PORT,
} from "./port.js";

export const HOBO_CONTRACTS_PACKAGE = "@hobo/contracts";
