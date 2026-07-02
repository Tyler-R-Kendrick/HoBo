export {
	createRuntimeLocalComponentHost,
	HTTP_INCOMING_HANDLER,
	type RuntimeLocalComponentHostOptions,
} from "./component-host.js";
export { ComponentHostError, ComponentTrapError } from "./errors.js";
export {
	createLocalBindingResolver,
	HELLO_BINDLE_LOCAL_ENDPOINTS,
} from "./binding-resolver.js";
export {
	createInProcessWasmtimeEngine,
	createWasmtimeCliEngine,
} from "./engine/wasmtime.js";
export {
	isInterfaceId,
	parseComponentDescriptor,
	parseLinkRequest,
	parseProviderDescriptor,
	type ParsedLinkRequest,
	type ParsedProviderDescriptor,
} from "./parse.js";
