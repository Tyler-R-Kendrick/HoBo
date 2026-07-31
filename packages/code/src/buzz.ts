/**
 * @deprecated Buzz product/hive surface was removed from hobo-code.
 * Use `./distributed.js` for multi-node compute dispatch only.
 *
 * Kept as thin compatibility aliases so accidental imports fail loudly in types
 * but still resolve during migration. Prefer the distributed.* names.
 */
export {
	COMPUTE_ISOLATION_CLASSES as BUZZ_ISOLATION_CLASSES,
	COMPUTE_POOL_SCHEMA as BUZZ_HIVE_SCHEMA,
	COMPUTE_TASK_SCHEMA as BUZZ_TASK_SCHEMA,
	describeDistributedCompute as describeBuzzDistributedCompute,
	dispatchComputeTask as dispatchBuzzTask,
	openComputePool as openBuzzHive,
	registerComputeNode as registerBuzzNode,
	type ComputeNode as BuzzNode,
	type ComputeNodeClass as BuzzNodeClass,
	type ComputePool as BuzzHive,
	type ComputeTask as BuzzTask,
	type DispatchComputeTaskInput as DispatchBuzzTaskInput,
	type DispatchComputeTaskResult as DispatchBuzzTaskResult,
	type OpenComputePoolOptions as OpenBuzzHiveOptions,
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
export function joinBuzzRoom(_input: unknown): never {
	throw new Error(
		"joinBuzzRoom removed: hobo-code no longer exposes hive rooms. Use openComputePool / registerComputeNode.",
	);
}

/** @deprecated */
export function registerBuzzAgent(_input: unknown): never {
	throw new Error(
		"registerBuzzAgent removed: hobo-code no longer exposes hive agent roster. Use compute nodes only.",
	);
}
