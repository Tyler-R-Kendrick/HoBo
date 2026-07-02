import type { EventEnvelope, PrincipalRef } from "../envelope.js";

export interface Clock {
	now(): string;
}

export interface EventInput<T = unknown> {
	type: string;
	v?: number;
	data?: T;
	meta?: Record<string, unknown>;
}

export interface AppendOptions {
	expectedSeq: number;
	actor: PrincipalRef;
	tenant: string;
	project?: string;
	causationId?: string;
	correlationId?: string;
	lane?: string;
}

export interface AppendResult {
	streamId: string;
	appended: EventEnvelope[];
	deduped: EventEnvelope[];
}

export interface StreamFilter {
	streamId?: string;
	type?: string;
}

export interface Subscription {
	unsubscribe(): void;
}

export interface SnapshotRecord<S = unknown> {
	streamId: string;
	seq: number;
	state: S;
	savedAt: string;
}

export type FoldHandlers<S> = Record<
	string,
	(state: S, event: EventEnvelope) => S
>;

export interface FoldResult<S> {
	streamId: string;
	seq: number;
	state: S;
	quarantined: QuarantineRecord[];
}

export interface QuarantineRecord {
	offendingSeq: number;
	quarantineSeq: number;
	type: string;
	reason: string;
}

export interface EventStore {
	append(
		streamId: string,
		events: EventInput[],
		opts: AppendOptions,
	): Promise<AppendResult>;
	read(streamId: string, fromSeq?: number): AsyncIterable<EventEnvelope>;
	subscribe(
		filter: StreamFilter,
		handler: (event: EventEnvelope) => void | Promise<void>,
	): Subscription;
	snapshot(
		streamId: string,
		state: unknown,
		seq: number,
	): Promise<SnapshotRecord>;
}
