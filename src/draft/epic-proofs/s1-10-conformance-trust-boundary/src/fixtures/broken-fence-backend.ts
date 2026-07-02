import { createRuntimeLocalDurabilityBackend } from "./reference-backend.js";
import type { RuntimeDurabilityBackend } from "../runtime-port/types.js";

export function createBrokenFenceRuntimeBackend(): RuntimeDurabilityBackend {
  const base = createRuntimeLocalDurabilityBackend();

  return Object.freeze({
    ...base,
    name: "runtime-local",
    actorHost: createBrokenFenceActorHost(),
  });
}

function createBrokenFenceActorHost() {
  const streams = new Map();
  const leases = new Map();

  return Object.freeze({
    acquire(key: string, request: { holderId?: string } = {}) {
      const actorKey = requireNonEmptyString(key, "key");
      const holderId = requireNonEmptyString(request.holderId, "request.holderId");
      const prior = leases.get(actorKey);
      const lease = Object.freeze({
        key: actorKey,
        holderId,
        fenceToken: (prior?.fenceToken ?? 0n) + 1n,
        expiresAt: "9999-12-31T23:59:59.999Z",
        renew() {
          return this;
        },
        release() {},
      });
      leases.set(actorKey, lease);
      return lease;
    },

    state(key: string, request: { fold?: (state: unknown, event: { type: string; amount?: number }) => unknown; initialState?: unknown } = {}) {
      const actorKey = requireNonEmptyString(key, "key");
      if (typeof request.fold !== "function") {
        throw new TypeError("request.fold must be a function");
      }
      const stream = getBrokenStream(streams, actorKey);
      const initialState = clone(request.initialState);

      return Object.freeze({
        append(lease: { fenceToken?: bigint }, event: { type: string; amount?: number }) {
          const record = Object.freeze({
            ...clone(event),
            streamId: actorKey,
            seq: stream.events.length + 1,
            fenceToken: lease?.fenceToken,
          });
          stream.events.push(record);
          return Object.freeze({
            streamId: actorKey,
            seq: record.seq,
            fenceToken: record.fenceToken,
          });
        },
        read() {
          let state = clone(initialState) as { value: number };
          for (const event of stream.events) {
            state = request.fold!(state, clone(event)) as { value: number };
          }
          return Object.freeze({
            streamId: actorKey,
            seq: stream.events.length,
            state,
          });
        },
        passivate() {
          return this.read();
        },
      });
    },
  });
}

function getBrokenStream(streams: Map<string, { events: unknown[] }>, key: string) {
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

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
