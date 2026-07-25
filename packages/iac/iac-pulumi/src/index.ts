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
export {
	createPulumiCliAutomationEngine,
	PULUMI_CLI_MISSING,
	PULUMI_UNSUPPORTED_RESOURCE,
	PULUMI_YAML_TYPE_TOKENS,
	PulumiEngineUnavailableError,
	renderPulumiYamlProgram,
	type PulumiCliEngineOptions,
} from "./pulumi-cli-engine.js";

export type { IacProvider } from "./port.js";
export { IAC_PULUMI_INTERFACE, IAC_PULUMI_PORT } from "./port.js";

export const HOBO_IAC_PULUMI_PACKAGE = "@hobo/iac-pulumi";
