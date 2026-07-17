import type { EventEnvelope, EventStore } from "@hobo/core";

// Store seam (control-plane.md "Event Store + Projections": source of truth).
// The Yard kernel persists to the core EventStore port; in tests that port is
// backed by runtime-local's sqlite engine (Decision D6). Append-only, per-stream
// seq — the kernel adds no persistence of its own, it composes the port.

export type { EventEnvelope, EventStore } from "@hobo/core";

// Drain a stream to an array (read-model rebuild / snapshot helpers).
export async function collectStream(
	store: Pick<EventStore, "read">,
	streamId: string,
	fromSeq?: number,
): Promise<EventEnvelope[]> {
	const events: EventEnvelope[] = [];
	for await (const event of store.read(streamId, fromSeq)) events.push(event);
	return events;
}
