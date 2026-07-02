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

export {
	QUEUE_CLOCK_CONFORMANCE_CONTRACT,
	runQueueClockConformance,
} from "./queue-clock.js";
export type {
	CreateRuntimeLocalQueueClock,
	QueueClockAssertionName,
	QueueClockConformanceOptions,
	QueueClockConformanceReport,
	ReplayClockTraceFn,
} from "./queue-clock.js";

export {
	COMPONENT_HOST_CONFORMANCE_SCHEMA,
	CapabilityIsolationError,
	ComponentHostPlanningError,
	createReferenceComponentHostManifest,
	createReferenceInContainerHost,
	createReferenceRuntimeLocalHost,
	planComponentHost,
	runComponentHostConformance,
} from "./suites/component-host/index.js";
export type {
	ComponentHostAdapter,
	ComponentHostConformanceReport,
	ComponentHostManifest,
} from "./suites/component-host/index.js";

export {
	RUNTIME_PORT_CONFORMANCE_VERSION,
	proveCheckoutDurability,
	parseRuntimePortReport,
	runRuntimePortDurabilitySuite,
} from "./suites/runtime-port/index.js";
export type {
	RuntimeDurabilityBackend,
	RuntimePortConformanceReport,
} from "./suites/runtime-port/index.js";
