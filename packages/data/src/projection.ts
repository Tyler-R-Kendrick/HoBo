import type { EventEnvelope, EventStore } from "@hobo/core";

import {
	createProjectionDeclaredEvent,
	createProjectionLaggedEvent,
	createProjectionSinkReboundEvent,
	type DataFact,
} from "./events.js";
import { ProjectionWriteError } from "./errors.js";
import type { UpcasterRegistry } from "./upcaster.js";

// A projection is the read-model fold: a deterministic, read-only `(row, event)
// -> row` per subscribed event type, keyed into rows. It is derived and
// rebuildable-from-zero; a snapshot is only a cache, never a source of truth
// (data-plane.md §Projections). The apply surface has NO write capability by
// construction — the read fold can never mutate the write model.
export type ApplyHandler<Row> = (
	row: Row | undefined,
	event: EventEnvelope,
) => Row;

export interface ProjectionDefinition<Row> {
	name: string;
	// Row identity: which read-model row an event lands in.
	key: (event: EventEnvelope) => string;
	// Per-event-type fold handlers. Object.keys(on) is the read-set.
	on: Record<string, ApplyHandler<Row>>;
	reactivityClass?: "reactive" | "non-reactive";
	upcasters?: UpcasterRegistry;
}

export interface ProjectionSnapshot<Row> {
	projection: string;
	seq: number;
	rows: Record<string, Row>;
}

export interface Projection<Row> {
	readonly name: string;
	readonly readSet: readonly string[];
	// Pure read-model fold over an event iterable (rebuildable from zero).
	fold(events: Iterable<EventEnvelope>): ProjectionSnapshot<Row>;
	// Drop the sink and replay the stream — the test that the LOG is authoritative.
	rebuildFromZero(
		store: EventStore,
		streamId: string,
	): Promise<ProjectionSnapshot<Row>>;
	// Queryable read surface over the current materialization.
	query(snapshot: ProjectionSnapshot<Row>): Row[];
	get(snapshot: ProjectionSnapshot<Row>, key: string): Row | undefined;
	// A snapshot is a cache: seed a fold with it, but rebuildFromZero ignores it.
	snapshot(state: ProjectionSnapshot<Row>): ProjectionSnapshot<Row>;
	declared(): DataFact;
	lagged(lagSeq: number, bound: number): DataFact;
	rebound(matchDecidedRef: string): DataFact;
}

function clone<T>(value: T): T {
	if (value === undefined) return value;
	return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const key of Object.keys(value as Record<string, unknown>)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}

function isQuarantineFact(event: EventEnvelope): boolean {
	return event.type.endsWith(".Quarantined");
}

export function defineProjection<Row>(
	definition: ProjectionDefinition<Row>,
): Projection<Row> {
	if (!definition.name) throw new TypeError("projection name is required");
	if (typeof definition.key !== "function") {
		throw new TypeError("projection key must be a function");
	}
	const handlers = new Map<string, ApplyHandler<Row>>(
		Object.entries(definition.on),
	);
	const readSet = Object.freeze([...handlers.keys()]);
	const reactivityClass = definition.reactivityClass ?? "reactive";

	function fold(events: Iterable<EventEnvelope>): ProjectionSnapshot<Row> {
		const rows: Record<string, Row> = {};
		const quarantinedSeqs = new Set<number>();
		const materialized = [...events];
		for (const event of materialized) {
			if (isQuarantineFact(event)) {
				const offending = (event.data as { offendingSeq?: unknown })
					?.offendingSeq;
				if (typeof offending === "number") quarantinedSeqs.add(offending);
			}
		}

		let seq = 0;
		for (const event of materialized) {
			seq = Math.max(seq, event.seq);
			if (isQuarantineFact(event) || quarantinedSeqs.has(event.seq)) continue;
			const handler = handlers.get(event.type);
			if (!handler) continue;
			const upcast = definition.upcasters
				? definition.upcasters.upcast(event)
				: event;
			const key = definition.key(upcast);
			// Read-only boundary: the handler sees frozen state + a frozen event and
			// returns the next row. It is handed no store/emit capability.
			const nextRow = handler(
				rows[key] === undefined ? undefined : deepFreeze(clone(rows[key])),
				deepFreeze(clone(upcast)),
			);
			rows[key] = clone(nextRow);
		}

		return { projection: definition.name, seq, rows };
	}

	return {
		name: definition.name,
		readSet,
		fold,

		async rebuildFromZero(store, streamId) {
			const events: EventEnvelope[] = [];
			// fromSeq omitted -> replays the whole stream from the first event.
			for await (const event of store.read(streamId)) events.push(event);
			return fold(events);
		},

		query(snapshot) {
			return Object.values(snapshot.rows);
		},

		get(snapshot, key) {
			return snapshot.rows[key];
		},

		snapshot(state) {
			return clone(state);
		},

		declared() {
			return createProjectionDeclaredEvent({
				projection: definition.name,
				readSet,
				reactivityClass,
			});
		},

		lagged(lagSeq, bound) {
			return createProjectionLaggedEvent({
				projection: definition.name,
				lagSeq,
				bound,
			});
		},

		rebound(matchDecidedRef) {
			return createProjectionSinkReboundEvent({
				projection: definition.name,
				matchDecidedRef,
			});
		},
	};
}

export { ProjectionWriteError };
