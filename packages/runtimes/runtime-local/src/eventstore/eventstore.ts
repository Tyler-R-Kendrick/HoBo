import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
	AppendOptions,
	AppendResult,
	Clock,
	EventEnvelope,
	EventInput,
	EventStore,
	FoldHandlers,
	FoldResult,
	SnapshotRecord,
	StreamFilter,
	Subscription,
} from "@hobo/core";
import { parseEventEnvelope } from "@hobo/core";

import {
	parseAppendContext,
	parseEventInput,
	parseEventInputs,
	parseExpectedSeq,
	parseStreamId,
	type ParsedAppendContext,
	type ParsedEventInput,
} from "./parse.js";
import {
	defaultDbPath,
	SnapshotAheadError,
	SqliteEventStore,
	StaleSequenceError,
} from "./sqlite-store.js";
import { createUlidGenerator } from "./ulid.js";

export class OptimisticSequenceConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OptimisticSequenceConflictError";
	}
}

export interface ManualClock extends Clock {
	advance(deltaMs: number): string;
}

export function createManualClock(startInstant = "2026-06-26T00:00:00.000Z"): ManualClock {
	let nowMs = Date.parse(startInstant);
	if (Number.isNaN(nowMs)) {
		throw new TypeError("startInstant must be a valid ISO-8601 string");
	}

	return Object.freeze({
		now() {
			return new Date(nowMs).toISOString();
		},
		advance(deltaMs: number) {
			if (!Number.isSafeInteger(deltaMs) || deltaMs < 0) {
				throw new TypeError("deltaMs must be a non-negative safe integer");
			}
			nowMs += deltaMs;
			return this.now();
		},
	});
}

export interface RuntimeLocalEventStoreOptions {
	dataDir: string;
	clock?: Clock;
}

export interface RuntimeLocalEventStore extends EventStore {
	fold<S>(
		streamId: string,
		opts: { initialState: S; handlers: FoldHandlers<S> },
	): Promise<FoldResult<S>>;
	loadSnapshot<S>(streamId: string): Promise<SnapshotRecord<S> | undefined>;
	close(): void;
}

interface LiveSubscription {
	filter: StreamFilter;
	handler: (event: EventEnvelope) => void | Promise<void>;
}

export function createRuntimeLocalEventStore(
	options: RuntimeLocalEventStoreOptions,
): RuntimeLocalEventStore {
	const clock = options.clock ?? createManualClock();
	const dataDir = options.dataDir;
	mkdirSync(dataDir, { recursive: true });
	const storage = new SqliteEventStore(defaultDbPath(dataDir));
	const nextUlid = createUlidGenerator(clock);
	const subscriptions = new Set<LiveSubscription>();
	const quarantinedSeqs = new Set<string>();

	const createEnvelope = (
		input: ParsedEventInput,
		seq: number,
		context: ParsedAppendContext,
	): EventEnvelope =>
		parseEventEnvelope({
			id: nextUlid(),
			streamId: context.streamId,
			seq,
			type: input.type,
			v: input.v,
			ts: clock.now(),
			actor: context.actor,
			tenant: context.tenant,
			project: context.project,
			causationId: context.causationId,
			correlationId: context.correlationId,
			lane: context.lane,
			data: cloneJson(input.data),
			meta: cloneJson(input.meta),
		});

	return Object.freeze({
		async append(
			streamId: string,
			events: EventInput[],
			appendOptions: AppendOptions,
		): Promise<AppendResult> {
			const context = parseAppendContext(streamId, appendOptions);
			const inputs = parseEventInputs(events);
			const deduped: EventEnvelope[] = [];
			const pending: ParsedEventInput[] = [];
			const pendingByKey = new Map<string, ParsedEventInput>();
			const pendingDuplicateKeys: string[] = [];

			for (const input of inputs) {
				if (input.idempotencyKey) {
					const previous = storage.findByIdempotencyKey(
						context.streamId,
						input.idempotencyKey,
					);
					if (previous) {
						deduped.push(previous);
						continue;
					}
					if (pendingByKey.has(input.idempotencyKey)) {
						pendingDuplicateKeys.push(input.idempotencyKey);
						continue;
					}
					pendingByKey.set(input.idempotencyKey, input);
				}
				pending.push(input);
			}

			if (pending.length === 0) {
				return Object.freeze({
					streamId: context.streamId,
					appended: [],
					deduped: cloneJson(deduped),
				});
			}

			let appended: EventEnvelope[] = [];
			try {
				const result = storage.appendBatch(context, pending, createEnvelope);
				appended = result.appended;
				deduped.push(...result.deduped);
			} catch (error) {
				if (error instanceof StaleSequenceError) {
					throw new OptimisticSequenceConflictError(error.message);
				}
				throw error;
			}

			const appendedByKey = new Map<string, EventEnvelope>();
			for (const envelope of appended) {
				const key = envelope.meta?.idempotencyKey;
				if (typeof key === "string" && key.length > 0) {
					appendedByKey.set(key, envelope);
				}
				publish(subscriptions, envelope);
			}
			for (const key of pendingDuplicateKeys) {
				const envelope = appendedByKey.get(key);
				if (envelope) {
					deduped.push(envelope);
				}
			}

			return Object.freeze({
				streamId: context.streamId,
				appended: cloneJson(appended),
				deduped: cloneJson(deduped),
			});
		},

		read(streamId: string, fromSeq = 1) {
			const parsedStreamId = parseStreamId(streamId);
			const startSeq = parseExpectedSeq(fromSeq, "fromSeq");
			return readIterable(storage, parsedStreamId, startSeq);
		},

		subscribe(filter: StreamFilter, handler: (event: EventEnvelope) => void | Promise<void>) {
			if (typeof handler !== "function") {
				throw new TypeError("handler must be a function");
			}
			const subscription: LiveSubscription = {
				filter: Object.freeze({ ...filter }),
				handler,
			};
			subscriptions.add(subscription);
			return Object.freeze({
				unsubscribe() {
					subscriptions.delete(subscription);
				},
			}) satisfies Subscription;
		},

		async snapshot(streamId: string, state: unknown, seq: number) {
			const parsedStreamId = parseStreamId(streamId);
			const snapshotSeq = parseExpectedSeq(seq, "seq");
			const record: SnapshotRecord = {
				streamId: parsedStreamId,
				seq: snapshotSeq,
				state: cloneJson(state),
				savedAt: clock.now(),
			};
			try {
				return storage.saveSnapshot(record);
			} catch (error) {
				if (error instanceof SnapshotAheadError) {
					throw new OptimisticSequenceConflictError(error.message);
				}
				throw error;
			}
		},

		async loadSnapshot<S>(streamId: string) {
			return storage.loadSnapshot<S>(parseStreamId(streamId));
		},

		async fold<S>(
			streamId: string,
			foldOptions: { initialState: S; handlers: FoldHandlers<S> },
		): Promise<FoldResult<S>> {
			const parsedStreamId = parseStreamId(streamId);
			const handlers = normalizeHandlers(foldOptions.handlers);
			let state = cloneRequired(foldOptions.initialState, "foldOptions.initialState");
			const quarantined: FoldResult<S>["quarantined"] = [];
			const events = storage.readStream(parsedStreamId);

			for (const event of events) {
				const quarantineKey = `${parsedStreamId}:${event.seq}`;
				if (isQuarantineEvent(event) || quarantinedSeqs.has(quarantineKey)) {
					continue;
				}
				const handler = handlers.get(event.type);
				if (!handler) {
					continue;
				}

				try {
					state = cloneJson(handler(cloneJson(state), cloneJson(event)));
				} catch (cause) {
					const quarantine = appendQuarantine({
						storage,
						streamId: parsedStreamId,
						event,
						cause,
						clock,
						nextUlid,
						quarantinedSeqs,
						subscriptions,
					});
					quarantined.push({
						offendingSeq: event.seq,
						quarantineSeq: quarantine.seq,
						type: quarantine.type,
						reason: String((quarantine.data as { reason?: string }).reason ?? ""),
					});
				}
			}

			return Object.freeze({
				streamId: parsedStreamId,
				seq: storage.getStreamLength(parsedStreamId),
				state: cloneJson(state),
				quarantined,
			});
		},

		close() {
			storage.close();
		},
	});
}

function appendQuarantine({
	storage,
	streamId,
	event,
	cause,
	clock,
	nextUlid,
	quarantinedSeqs,
	subscriptions,
}: {
	storage: SqliteEventStore;
	streamId: string;
	event: EventEnvelope;
	cause: unknown;
	clock: Clock;
	nextUlid: () => string;
	quarantinedSeqs: Set<string>;
	subscriptions: Set<LiveSubscription>;
}): EventEnvelope {
	const quarantineKey = `${streamId}:${event.seq}`;
	if (quarantinedSeqs.has(quarantineKey)) {
		const existing = storage
			.readStream(streamId)
			.find(
				(candidate) =>
					isQuarantineEvent(candidate) &&
					(candidate.data as { offendingSeq?: number }).offendingSeq === event.seq,
			);
		return existing as EventEnvelope;
	}

	quarantinedSeqs.add(quarantineKey);
	const reason = cause instanceof Error ? cause.message : String(cause);
	const aggregate = event.type.split(".")[0] ?? "event";
	const input = parseEventInput({
		type: `${aggregate}.Quarantined`,
		data: {
			offendingSeq: event.seq,
			offendingType: event.type,
			reason,
		},
		meta: {
			quarantines: event.id,
		},
	});
	const context = parseAppendContext(streamId, {
		expectedSeq: storage.getStreamLength(streamId),
		actor: { kind: "system", id: "runtime-local" },
		tenant: event.tenant,
		causationId: event.id,
		correlationId: event.correlationId,
	});
	const quarantine = storage.appendSingle(context, input, (_parsed, seq, ctx) =>
		parseEventEnvelope({
			id: nextUlid(),
			streamId: ctx.streamId,
			seq,
			type: input.type,
			v: input.v,
			ts: clock.now(),
			actor: ctx.actor,
			tenant: ctx.tenant,
			causationId: ctx.causationId,
			correlationId: ctx.correlationId,
			data: cloneJson(input.data),
			meta: cloneJson(input.meta),
		}),
	);
	publish(subscriptions, quarantine);
	return quarantine;
}

async function* readIterable(
	storage: SqliteEventStore,
	streamId: string,
	fromSeq: number,
): AsyncIterable<EventEnvelope> {
	for (const event of storage.readStream(streamId, fromSeq)) {
		yield cloneJson(event);
	}
}

function publish(subscriptions: Set<LiveSubscription>, envelope: EventEnvelope): void {
	for (const subscription of subscriptions) {
		if (matches(subscription.filter, envelope)) {
			void subscription.handler(cloneJson(envelope));
		}
	}
}

function matches(filter: StreamFilter, envelope: EventEnvelope): boolean {
	return (
		(!filter.streamId || filter.streamId === envelope.streamId) &&
		(!filter.type || filter.type === envelope.type)
	);
}

function normalizeHandlers<S>(handlers: FoldHandlers<S>): Map<string, FoldHandlers<S>[string]> {
	if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
		throw new TypeError("foldOptions.handlers must be an object");
	}
	return new Map(
		Object.entries(handlers).filter((entry): entry is [string, FoldHandlers<S>[string]] => {
			return typeof entry[1] === "function";
		}),
	);
}

function isQuarantineEvent(event: EventEnvelope): boolean {
	return event.type.endsWith(".Quarantined");
}

function cloneJson<T>(value: T): T {
	if (value === undefined) {
		return value;
	}
	return typeof structuredClone === "function"
		? structuredClone(value)
		: (JSON.parse(JSON.stringify(value)) as T);
}

function cloneRequired<T>(value: T, fieldName: string): T {
	if (value === undefined) {
		throw new TypeError(`${fieldName} is required`);
	}
	return cloneJson(value);
}

export async function collectStream(
	store: Pick<RuntimeLocalEventStore, "read">,
	streamId: string,
	fromSeq?: number,
): Promise<EventEnvelope[]> {
	const events: EventEnvelope[] = [];
	for await (const event of store.read(streamId, fromSeq)) {
		events.push(event);
	}
	return events;
}
