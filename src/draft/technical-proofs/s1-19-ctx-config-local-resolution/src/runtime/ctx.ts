import type { ConfigContract } from "../bindles/types.js";
import { createConfigContext } from "./context.js";
import type { ConfigResolver } from "./resolver.js";
import type { EventStore, PersistedEvent } from "./event-store.js";
import { scrubAtCapture } from "./redaction.js";

export type RuntimeCtx<TContract extends ConfigContract> = {
  readonly config: ReturnType<typeof createConfigContext<TContract>>["config"];
  readonly log: (message: string, fields?: Record<string, unknown>) => void;
  readonly emit: (type: string, data: Record<string, unknown>) => void;
  readonly stream: (frame: Record<string, unknown>) => void;
  readonly eventStore: EventStore;
  readonly logs: readonly string[];
  readonly spans: readonly Record<string, unknown>[];
  readonly streamFrames: readonly Record<string, unknown>[];
};

export function createRuntimeCtx<TContract extends ConfigContract>(options: {
  readonly contract: TContract;
  readonly resolver: ConfigResolver;
  readonly eventStore: EventStore;
}): RuntimeCtx<TContract> {
  const { config } = createConfigContext(options.contract, options.resolver);
  const logs: string[] = [];
  const spans: Record<string, unknown>[] = [];
  const streamFrames: Record<string, unknown>[] = [];

  return {
    config,
    eventStore: options.eventStore,
    logs,
    spans,
    streamFrames,
    log(message: string, fields: Record<string, unknown> = {}) {
      const line = scrubAtCapture({ message, ...fields });
      logs.push(JSON.stringify(line));
    },
    emit(type: string, data: Record<string, unknown>) {
      const event = scrubAtCapture({
        type,
        id: `evt-${type}-${logs.length + spans.length + 1}`,
        data,
      }) as PersistedEvent;
      options.eventStore.append(event);
    },
    stream(frame: Record<string, unknown>) {
      streamFrames.push(scrubAtCapture(frame));
      spans.push(scrubAtCapture({ name: "stream.frame", attributes: frame }));
    },
  };
}
