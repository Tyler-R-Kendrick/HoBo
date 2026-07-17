export {
	ADAPTER_ID,
	IAC_PROGRAM_API_VERSION,
	PINNED_PULUMI_AUTOMATION_VERSION,
	PulumiApplyError,
	PulumiProgramError,
	PulumiStateError,
	createInMemoryAutomationEngine,
	createInMemoryStateBackend,
	createPerResourceStackKey,
	createPulumiAutomationAdapter,
	createStateBackendConfig,
	createTrivialIacProgram,
	outputsToBindings,
	runIacBackendConformance,
	validateIacProgram,
} from "./iac-pulumi-automation-adapter.js";

export type { IacProvider } from "./port.js";
export { IAC_PULUMI_INTERFACE, IAC_PULUMI_PORT } from "./port.js";

export const HOBO_IAC_PULUMI_PACKAGE = "@hobo/iac-pulumi";
