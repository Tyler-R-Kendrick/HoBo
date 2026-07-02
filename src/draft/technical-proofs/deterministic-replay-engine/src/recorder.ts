import type { EventEnvelope } from "./types.js";
import type { EventStoreWriter } from "./store.js";

export async function recordEffect(
  store: EventStoreWriter,
  envelope: EventEnvelope,
  expectedSeq?: number,
): Promise<EventEnvelope> {
  await store.append(envelope, expectedSeq);
  return envelope;
}

export function nextEnvelope(
  streamId: string,
  seq: number,
  type: string,
  data: unknown,
  options: { id?: string; meta?: Record<string, unknown>; ts?: string } = {},
): EventEnvelope {
  return Object.freeze({
    id: options.id ?? `${streamId}-${seq}`,
    streamId,
    seq,
    type,
    data,
    ts: options.ts,
    meta: options.meta,
  });
}
