import type {
	EventEnvelope,
	EventStore,
	FoldHandlers,
	FoldResult,
	Queue,
	VirtualClock,
} from "@hobo/core";

export const RUNTIME_PORT_CONFORMANCE_VERSION =
	"hobo.runtime-port-conformance/v1";

export interface ActorHostLease {
	readonly key: string;
	readonly holderId: string;
	readonly fenceToken: bigint;
	readonly expiresAt: string;
	release(): void;
}

export interface ActorHostState<S = unknown> {
	append(
		lease: ActorHostLease,
		event: { type: string; [key: string]: unknown },
	): {
		streamId: string;
		seq: number;
		fenceToken: bigint;
	};
	read(): { streamId: string; seq: number; state: S };
}

export interface ActorHostPort {
	acquire(key: string, request: { holderId: string }): ActorHostLease;
	state<S>(
		key: string,
		request: {
			initialState: S;
			fold: (state: S, event: { type: string; [key: string]: unknown }) => S;
		},
	): ActorHostState<S>;
}

export interface ConformanceEventStore extends EventStore {
	fold<S>(
		streamId: string,
		opts: { initialState: S; handlers: FoldHandlers<S> },
	): Promise<FoldResult<S>>;
}

export interface RuntimeDurabilityBackend {
	readonly name: string;
	readonly eventStore: ConformanceEventStore;
	readonly queue: Queue;
	readonly clock: VirtualClock;
	readonly actorHost: ActorHostPort;
}

// domain-view: parse-dont-validate parsed/derived type (branded ids, generics, or richer domain fields); its generated *_pb.ts is the wire form (technical-standards.md, IMPL-011).
export interface ConformanceCheckResult {
	readonly checkId: string;
	readonly port: string;
	readonly tag: "local";
	readonly status: "pass" | "fail";
}

// domain-view: parse-dont-validate parsed/derived type (branded ids, generics, or richer domain fields); its generated *_pb.ts is the wire form (technical-standards.md, IMPL-011).
export interface ConformanceFailure {
	readonly checkId: string;
	readonly message: string;
}

// domain-view: parse-dont-validate parsed/derived type (branded ids, generics, or richer domain fields); its generated *_pb.ts is the wire form (technical-standards.md, IMPL-011).
export interface RuntimePortConformanceReport {
	readonly contract: typeof RUNTIME_PORT_CONFORMANCE_VERSION;
	readonly backend: string;
	readonly status: "pass" | "fail";
	readonly checks: readonly ConformanceCheckResult[];
	readonly failures: readonly ConformanceFailure[];
	readonly coverage: {
		readonly local: {
			readonly status: "pass" | "fail";
			readonly passed: number;
			readonly failed: number;
			readonly total: number;
		};
	};
}

export async function readEventStream(
	store: EventStore,
	streamId: string,
): Promise<EventEnvelope[]> {
	const events: EventEnvelope[] = [];
	for await (const event of store.read(streamId)) {
		events.push(event);
	}
	return events;
}
