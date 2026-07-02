export {
	createDefaultWrpcLinkLayer,
	createWrpcLinkLayer,
} from "./wrpc/link-layer.js";
export { createInProcessTransport, createJsonWitCodec } from "./wrpc/in-process-transport.js";
export {
	createRuntimeLocalComponentHost,
	HTTP_INCOMING_HANDLER,
	type RuntimeLocalComponentHostOptions,
} from "./component-host.js";
export { ComponentHostError, ComponentTrapError } from "./errors.js";
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
