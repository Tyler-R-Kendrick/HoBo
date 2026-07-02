export type StreamId = string & { readonly __brand: "StreamId" };
export type EventType = string & { readonly __brand: "EventType" };
export type ActionId = string & { readonly __brand: "ActionId" };
export type FenceToken = bigint & { readonly __brand: "FenceToken" };

export type QuorumFencedAppend = {
  streamId: StreamId;
  fenceToken: FenceToken;
  eventType: EventType;
  actionId: ActionId | null;
};

export type LeaderFailoverOutcome = {
  leaderNode: string;
  successorNode: string;
  recoveryMs: number;
  duplicateActionsBlocked: boolean;
};

export function parseStreamId(value: unknown): StreamId {
  return requireNonEmptyString(value, "streamId") as StreamId;
}

export function parseEventType(value: unknown): EventType {
  return requireNonEmptyString(value, "eventType") as EventType;
}

export function parseActionId(value: unknown): ActionId | null {
  if (value == null) {
    return null;
  }
  return requireNonEmptyString(value, "actionId") as ActionId;
}

export function parseFenceToken(value: unknown): FenceToken {
  if (typeof value !== "bigint") {
    throw new TypeError("fenceToken must be a bigint");
  }
  if (value < 1n) {
    throw new TypeError("fenceToken must be >= 1");
  }
  return value as FenceToken;
}

export function parseQuorumFencedAppend(value: unknown): QuorumFencedAppend {
  if (value == null || typeof value !== "object") {
    throw new TypeError("append request must be an object");
  }
  const request = value as Record<string, unknown>;
  return {
    streamId: parseStreamId(request.streamId),
    fenceToken: parseFenceToken(request.fenceToken),
    eventType: parseEventType(request.eventType),
    actionId: parseActionId(request.actionId),
  };
}

export function parseLeaderFailoverOutcome(value: unknown): LeaderFailoverOutcome {
  if (value == null || typeof value !== "object") {
    throw new TypeError("leader failover outcome must be an object");
  }
  const outcome = value as Record<string, unknown>;
  const recoveryMs = requireNonNegativeInteger(outcome.recoveryMs, "recoveryMs");
  if (recoveryMs > 30_000) {
    throw new TypeError("recoveryMs must be <= 30000");
  }
  return {
    leaderNode: requireNonEmptyString(outcome.leaderNode, "leaderNode"),
    successorNode: requireNonEmptyString(outcome.successorNode, "successorNode"),
    recoveryMs,
    duplicateActionsBlocked: requireBoolean(outcome.duplicateActionsBlocked, "duplicateActionsBlocked"),
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
  return value as number;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${fieldName} must be a boolean`);
  }
  return value;
}
