export const CQRS_COMMAND_AGGREGATE_CONTRACT_VERSION =
  "hobo.cqrs-command-aggregate-contract/v1";

export class CommandInvariantError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandInvariantError";
  }
}

export class OptimisticSequenceConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "OptimisticSequenceConflictError";
  }
}

export class ForbiddenCommandSideEffectError extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenCommandSideEffectError";
  }
}

export class StaleFenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "StaleFenceError";
  }
}

export class LeaseConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "LeaseConflictError";
  }
}

export function command(type, spec, handler) {
  const commandType = requireNonEmptyString(type, "type");
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new TypeError("spec must be an object");
  }
  if (typeof spec.key !== "function") {
    throw new TypeError("spec.key must be a function");
  }
  if (!("initialState" in spec)) {
    throw new TypeError("spec.initialState is required");
  }
  if (typeof spec.fold !== "function") {
    throw new TypeError("spec.fold must be a function");
  }
  if (typeof handler !== "function") {
    throw new TypeError("handler must be a function");
  }

  return Object.freeze({
    type: commandType,
    streamId(input) {
      return requireNonEmptyString(spec.key(input), "command key");
    },
    initialState: structuredClone(spec.initialState),
    fold: spec.fold,
    handler,
  });
}

export function createCommandRuntime() {
  const streams = new Map();
  const leases = new Map();
  const leaseRecords = new WeakMap();

  function acquireFence(streamId, options = {}) {
    const normalizedStreamId = requireNonEmptyString(streamId, "streamId");
    const holderId = requireNonEmptyString(options.holderId ?? "command-runtime", "options.holderId");
    const current = leases.get(normalizedStreamId);

    if (current && !current.released && options.replace !== true) {
      throw new LeaseConflictError(`lease conflict for ${normalizedStreamId}`);
    }

    const record = {
      streamId: normalizedStreamId,
      holderId,
      fenceToken: (current?.fenceToken ?? 0n) + 1n,
      released: false,
    };
    leases.set(normalizedStreamId, record);

    const lease = Object.freeze({
      streamId: record.streamId,
      holderId: record.holderId,
      fenceToken: record.fenceToken,
    });
    leaseRecords.set(lease, record);
    return lease;
  }

  function execute(definition, input, options = {}) {
    const normalized = normalizeCommandDefinition(definition);
    const streamId = normalized.streamId(input);
    const stream = getStream(streams, streamId);
    const expectedSeq = normalizeExpectedSeq(options.expectedSeq ?? stream.events.length);

    assertExpectedSeq(streamId, stream, expectedSeq);

    const lease = options.lease ?? acquireFence(streamId, {
      holderId: options.holderId ?? normalized.type,
    });
    const ownsLease = !options.lease;
    const pending = [];
    const state = foldStream(normalized, stream.events);
    const context = createCommandContext({
      commandType: normalized.type,
      streamId,
      expectedSeq,
      state,
      pending,
    });

    let value;
    try {
      validateFence(streamId, lease);
      value = normalized.handler(input, context);
      assertExpectedSeq(streamId, stream, expectedSeq);
      validateFence(streamId, lease);
      stream.events.push(...pending);
    } finally {
      if (ownsLease) {
        releaseFence(lease);
      }
    }

    return {
      commandType: normalized.type,
      streamId,
      seq: pending.at(-1)?.seq ?? expectedSeq,
      emitted: structuredClone(pending),
      value: structuredClone(value),
    };
  }

  function emit(type, data, options = {}) {
    const streamId = requireNonEmptyString(options.streamId, "options.streamId");
    const stream = getStream(streams, streamId);
    const expectedSeq =
      options.expectedSeq === undefined ? stream.events.length : normalizeExpectedSeq(options.expectedSeq);

    assertExpectedSeq(streamId, stream, expectedSeq);
    if (options.lease) {
      validateFence(streamId, options.lease);
    }

    const event = createEvent({
      streamId,
      seq: stream.events.length + 1,
      type,
      data,
      meta: {},
    });
    stream.events.push(event);

    return {
      streamId,
      seq: event.seq,
    };
  }

  function readStream(streamId) {
    const stream = streams.get(requireNonEmptyString(streamId, "streamId"));
    return structuredClone(stream?.events ?? []);
  }

  function readAggregate(definition, input) {
    const normalized = normalizeCommandDefinition(definition);
    const streamId = normalized.streamId(input);
    const stream = getStream(streams, streamId);

    return {
      streamId,
      seq: stream.events.length,
      state: foldStream(normalized, stream.events),
    };
  }

  function validateFence(streamId, lease) {
    const record = leaseRecords.get(lease);
    const current = leases.get(streamId);

    if (
      !record ||
      !current ||
      record.streamId !== streamId ||
      current !== record ||
      record.released
    ) {
      throw new StaleFenceError(`stale fence for ${streamId}`);
    }

    return record;
  }

  function releaseFence(lease) {
    const record = leaseRecords.get(lease);
    if (record) {
      record.released = true;
    }
  }

  return Object.freeze({
    acquireFence,
    emit,
    execute,
    readAggregate,
    readStream,
  });
}

function createCommandContext({ commandType, streamId, expectedSeq, state, pending }) {
  const frozenState = deepFreeze(structuredClone(state));

  return Object.freeze({
    state: frozenState,
    streamId,
    expectedSeq,
    emit(type, data, options = {}) {
      const event = createEvent({
        streamId,
        seq: expectedSeq + pending.length + 1,
        type,
        data,
        meta: {
          ...structuredClone(options.meta ?? {}),
          commandType,
        },
      });
      pending.push(event);
      return {
        streamId,
        seq: event.seq,
      };
    },
    step(name) {
      throw new ForbiddenCommandSideEffectError(
        `command handlers cannot call step(${String(name)}) inside the aggregate write path`,
      );
    },
    externalWrite(target) {
      throw new ForbiddenCommandSideEffectError(
        `command handlers cannot write ${String(target)} outside ctx.emit`,
      );
    },
  });
}

function normalizeCommandDefinition(definition) {
  if (
    !definition ||
    typeof definition !== "object" ||
    typeof definition.type !== "string" ||
    typeof definition.streamId !== "function" ||
    typeof definition.fold !== "function" ||
    typeof definition.handler !== "function" ||
    !("initialState" in definition)
  ) {
    throw new TypeError("definition must be created by command(...)");
  }

  return definition;
}

function getStream(streams, streamId) {
  if (!streams.has(streamId)) {
    streams.set(streamId, { events: [] });
  }
  return streams.get(streamId);
}

function foldStream(definition, events) {
  let state = structuredClone(definition.initialState);
  for (const event of events) {
    state = definition.fold(state, structuredClone(event));
  }
  return structuredClone(state);
}

function createEvent({ streamId, seq, type, data, meta }) {
  const eventType = requireNonEmptyString(type, "event type");
  const record = {
    id: `${streamId}:${seq}:${eventType}`,
    streamId,
    seq,
    type: eventType,
    v: 1,
    data: structuredClone(data),
    meta: {
      ...structuredClone(meta),
      contract: CQRS_COMMAND_AGGREGATE_CONTRACT_VERSION,
    },
  };

  return Object.freeze(record);
}

function assertExpectedSeq(streamId, stream, expectedSeq) {
  const actualSeq = stream.events.length;
  if (actualSeq !== expectedSeq) {
    throw new OptimisticSequenceConflictError(
      `stale expectedSeq for ${streamId}: expected ${expectedSeq}, actual ${actualSeq}`,
    );
  }
}

function normalizeExpectedSeq(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("expectedSeq must be a non-negative safe integer");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const property of Object.values(value)) {
    deepFreeze(property);
  }

  return Object.freeze(value);
}
