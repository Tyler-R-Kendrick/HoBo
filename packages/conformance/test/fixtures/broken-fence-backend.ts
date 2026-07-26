import { createInMemoryActorHost } from "../../../runtimes/runtime-local/src/actor-host/in-memory.js";
import { createRuntimeLocalDurabilityBackend } from "../../../runtimes/runtime-local/test/conformance/helpers.js";
import type { RuntimeDurabilityBackend } from "../../src/suites/runtime-port/types.js";

export function createBrokenFenceRuntimeBackend(): RuntimeDurabilityBackend {
	const base = createRuntimeLocalDurabilityBackend();

	return Object.freeze({
		...base,
		name: "runtime-local",
		actorHost: createBrokenFenceActorHost(),
	});
}

function createBrokenFenceActorHost() {
	const streams = new Map<
		string,
		{ events: Array<{ type: string; amount?: number }> }
	>();
	const leases = new Map<string, { fenceToken: bigint }>();

	return Object.freeze({
		acquire(key: string, request: { holderId?: string } = {}) {
			const actorKey = requireNonEmptyString(key, "key");
			requireNonEmptyString(request.holderId, "request.holderId");
			const prior = leases.get(actorKey);
			const lease = Object.freeze({
				key: actorKey,
				holderId: request.holderId!,
				fenceToken: (prior?.fenceToken ?? 0n) + 1n,
				expiresAt: "9999-12-31T23:59:59.999Z",
				release() {},
			});
			leases.set(actorKey, { fenceToken: lease.fenceToken });
			return lease;
		},

		state(
			key: string,
			request: {
				fold?: (
					state: unknown,
					event: { type: string; amount?: number },
				) => unknown;
				initialState?: unknown;
			} = {},
		) {
			const actorKey = requireNonEmptyString(key, "key");
			if (typeof request.fold !== "function") {
				throw new TypeError("request.fold must be a function");
			}
			const stream = getBrokenStream(streams, actorKey);
			const initialState = structuredClone(request.initialState);

			return Object.freeze({
				append(
					lease: { fenceToken?: bigint },
					event: { type: string; amount?: number },
				) {
					const record = Object.freeze({
						...structuredClone(event),
						streamId: actorKey,
						seq: stream.events.length + 1,
						fenceToken: lease?.fenceToken,
					});
					stream.events.push(record);
					return Object.freeze({
						streamId: actorKey,
						seq: record.seq,
						fenceToken: record.fenceToken ?? 0n,
					});
				},
				read() {
					let state = structuredClone(initialState) as { value: number };
					for (const event of stream.events) {
						state = request.fold!(state, structuredClone(event)) as {
							value: number;
						};
					}
					return Object.freeze({
						streamId: actorKey,
						seq: stream.events.length,
						state,
					});
				},
			});
		},
	});
}

function getBrokenStream(
	streams: Map<string, { events: Array<{ type: string; amount?: number }> }>,
	key: string,
) {
	if (!streams.has(key)) {
		streams.set(key, { events: [] });
	}
	return streams.get(key)!;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${fieldName} must be a non-empty string`);
	}
	return value;
}

// re-export for tests that need the conformant actor host
export { createInMemoryActorHost };
