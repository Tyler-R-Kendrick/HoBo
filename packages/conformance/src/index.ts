export const HOBO_CONFORMANCE_PACKAGE = "@hobo/conformance";

export * from "./boundaries.js";
export * from "./diff.js";
export * from "./golden-ir.js";
export * from "./registry.js";
export * from "./report.js";
export * from "./runner.js";
export * from "./sdk-parity.js";
export * from "./seed.js";
export * from "./suite.js";
export * from "./types.js";

export { capabilityEnforcementSuite } from "./capability-enforcement/suite.js";
export type {
	CapabilityHostFactory,
	CapabilityHostFactoryOptions,
} from "./capability-enforcement/suite.js";
export {
	CAMP_EVENTSTORE_RUNTIME_PORT_CONTRACT_VERSION,
	runEventStoreConformance,
} from "./suites/eventstore.js";
export type {
	AssertionStatus,
	CreateRuntimeLocalEventStore,
	EventStoreConformanceAssertion,
	EventStoreConformanceReport,
} from "./suites/eventstore.js";

export {
	STREAMER_CONFORMANCE_CONTRACT,
	runStreamerConformance,
} from "./streamer.js";
export type {
	StreamerAssertionName,
	StreamerConformanceReport,
} from "./streamer.js";
