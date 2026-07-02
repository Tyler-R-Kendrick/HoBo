import type {
  createInMemoryActorHost,
} from "../fixtures/actor-host-port.js";
import type {
  createManualClock as createEventStoreClock,
  createRuntimeLocalEventStore,
} from "../fixtures/eventstore-port.js";
import type { createRuntimeLocalQueueClock } from "../fixtures/queue-clock-port.js";

export const RUNTIME_PORT_CONFORMANCE_VERSION =
  "hobo.runtime-port-conformance/v1";

export type EventStorePort = ReturnType<typeof createRuntimeLocalEventStore>;
export type QueueClockBundle = ReturnType<typeof createRuntimeLocalQueueClock>;
export type QueuePort = QueueClockBundle["queue"];
export type ClockPort = QueueClockBundle["clock"];
export type ActorHostPort = ReturnType<typeof createInMemoryActorHost>;

export interface RuntimeDurabilityBackend {
  readonly name: string;
  readonly eventStore: EventStorePort;
  readonly queue: QueuePort;
  readonly clock: ClockPort;
  readonly actorHost: ActorHostPort;
}

export interface ConformanceCheckResult {
  readonly checkId: string;
  readonly port: string;
  readonly tag: "local";
  readonly status: "pass" | "fail";
}

export interface ConformanceFailure {
  readonly checkId: string;
  readonly message: string;
}

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
