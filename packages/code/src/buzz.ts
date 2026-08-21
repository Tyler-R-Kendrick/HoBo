import type { JsonValue } from "./json.js";

/**
 * @deprecated Buzz product/hive surface was removed from hobo-code.
 * Use `./distributed.js` for multi-node compute dispatch only.
 *
 * Kept as thin compatibility aliases so accidental imports fail loudly in types
 * but still resolve during migration. Prefer the distributed.* names.
 */
export {
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	COMPUTE_ISOLATION_CLASSES as BUZZ_ISOLATION_CLASSES,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	COMPUTE_POOL_SCHEMA as BUZZ_HIVE_SCHEMA,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	COMPUTE_TASK_SCHEMA as BUZZ_TASK_SCHEMA,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type ComputeNode as BuzzNode,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type ComputeNodeClass as BuzzNodeClass,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type ComputePool as BuzzHive,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type ComputeTask as BuzzTask,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type DispatchComputeTaskInput as DispatchBuzzTaskInput,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type DispatchComputeTaskResult as DispatchBuzzTaskResult,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	describeDistributedCompute as describeBuzzDistributedCompute,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	dispatchComputeTask as dispatchBuzzTask,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	type OpenComputePoolOptions as OpenBuzzHiveOptions,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	openComputePool as openBuzzHive,
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	registerComputeNode as registerBuzzNode,
} from "./distributed.js";

/** @deprecated No agent/room hive identity — removed with buzz product surface. */
export function createBuzzAgentIdentity(_input: {
	readonly displayName: string;
	readonly providerHint: string;
	readonly stationId: string;
	readonly publicKeyPem?: string;
}): never {
	throw new Error(
		"createBuzzAgentIdentity removed: hobo-code no longer integrates a buzz/hive product. Use dispatchComputeTask + compute nodes only.",
	);
}

/** @deprecated */
export function joinBuzzRoom(_input: JsonValue): never {
	throw new Error(
		"joinBuzzRoom removed: hobo-code no longer exposes hive rooms. Use openComputePool / registerComputeNode.",
	);
}

/** @deprecated */
export function registerBuzzAgent(_input: JsonValue): never {
	throw new Error(
		"registerBuzzAgent removed: hobo-code no longer exposes hive agent roster. Use compute nodes only.",
	);
}
