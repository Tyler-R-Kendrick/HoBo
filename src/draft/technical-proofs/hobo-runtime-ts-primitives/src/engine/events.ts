import { createHash } from "node:crypto";

const RUN_EVENT_TYPES = new Set([
  "run.Started",
  "run.StepScheduled",
  "run.StepCompleted",
  "run.StepFailed",
  "run.SleepScheduled",
  "run.HookCreated",
  "run.HookResumed",
  "run.Suspended",
  "run.Completed",
  "run.Failed",
]);

const ACTOR_EVENT_TYPES = new Set([
  "actor.Activated",
  "actor.StateAppended",
  "actor.Passivated",
]);

const SAGA_EVENT_TYPES = new Set([
  "saga.Started",
  "saga.StepEmitted",
  "saga.Compensated",
  "saga.Completed",
]);

export class EventParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventParseError";
  }
}

export interface ParsedEnvelope {
  id: string;
  type: string;
  streamId: string;
  seq: number;
  runId: string;
  data: Record<string, unknown>;
}

export function parseRuntimeEnvelope(raw: unknown): ParsedEnvelope {
  return parseEnvelope(raw, { requireCatalogType: true });
}

export function parseEnvelope(raw: unknown, opts: { requireCatalogType?: boolean } = {}): ParsedEnvelope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EventParseError("envelope must be an object");
  }
  const source = raw as Record<string, unknown>;
  const type = requireNonEmptyString(source.type, "type");
  const streamId = requireNonEmptyString(source.streamId, "streamId");
  const id = requireNonEmptyString(source.id, "id");
  const seq = requirePositiveInt(source.seq, "seq");
  const data = parseData(source.data);

  if (opts.requireCatalogType && !isCatalogEventType(type)) {
    throw new EventParseError(`unknown catalog event type: ${type}`);
  }

  const runId = typeof data.runId === "string" && data.runId.length > 0 ? data.runId : streamId.replace(/^run:/, "");

  if (runId.length === 0) {
    throw new EventParseError("runId must be non-empty");
  }

  return Object.freeze({ id, type, streamId, seq, runId, data: Object.freeze(data) });
}

export function isCatalogEventType(type: string): boolean {
  return RUN_EVENT_TYPES.has(type) || ACTOR_EVENT_TYPES.has(type) || SAGA_EVENT_TYPES.has(type);
}

export function stableIdempotencyKey(parts: unknown[]): string {
  return createHash("sha256").update(stableStringify(parts)).digest("hex").slice(0, 32);
}

function parseData(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EventParseError("data must be an object");
  }
  return structuredClone(value as Record<string, unknown>);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EventParseError(`${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInt(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new EventParseError(`${field} must be a positive integer`);
  }
  return value as number;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
