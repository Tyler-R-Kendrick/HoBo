import { createHash } from "node:crypto";

const CONTRACT_VERSION = "hobo.snapshot-compaction-contract/v1";
const NEVER_COMPACT_PREFIXES = ["token.", "resource.", "policy."];
const TERMINAL_RUN_EVENTS = new Set(["run.Completed", "run.Failed", "run.Cancelled", "run.Canceled"]);

export class SnapshotIntegrityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SnapshotIntegrityError";
    this.details = details;
  }
}

export class CompactionRejectedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CompactionRejectedError";
    this.details = details;
  }
}

export class RetentionFloorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RetentionFloorError";
    this.details = details;
  }
}

export function createSnapshotCompactionLog() {
  const activeByStream = new Map();
  const coldByStream = new Map();
  const snapshotsByStream = new Map();
  const auditMarkersByStream = new Map();

  function streamEvents(map, streamId) {
    if (!map.has(streamId)) {
      map.set(streamId, []);
    }
    return map.get(streamId);
  }

  function authoritativeEvents(streamId) {
    return [...(coldByStream.get(streamId) ?? []), ...(activeByStream.get(streamId) ?? [])]
      .filter((event) => event.kind !== "audit-marker")
      .sort(compareEvents);
  }

  return {
    append(input) {
      const events = streamEvents(activeByStream, input.streamId);
      const seq = input.seq ?? nextSeq(events, coldByStream.get(input.streamId) ?? []);
      const event = freezeEvent({ ...input, seq });
      events.push(event);
      events.sort(compareEvents);
      return event;
    },

    writeSnapshot(streamId, { fold, throughSeq }) {
      const folded = foldEvents({
        events: authoritativeEvents(streamId).filter((event) => event.seq <= throughSeq),
        fold,
      });
      const snapshot = signSnapshot({
        contract: CONTRACT_VERSION,
        streamId,
        seq: throughSeq,
        state: folded.state,
        eventDigest: digestEvents(authoritativeEvents(streamId).filter((event) => event.seq <= throughSeq)),
      });

      snapshotsByStream.set(streamId, snapshot);
      return snapshot;
    },

    deleteSnapshot(streamId) {
      snapshotsByStream.delete(streamId);
    },

    corruptSnapshot(streamId, corrupt) {
      const snapshot = snapshotsByStream.get(streamId);
      if (!snapshot) {
        throw new SnapshotIntegrityError("cannot corrupt missing snapshot", { streamId });
      }
      snapshotsByStream.set(streamId, corrupt(structuredClone(snapshot)));
    },

    requireValidSnapshot(streamId, { fold }) {
      const snapshot = snapshotsByStream.get(streamId);
      if (!snapshot) {
        throw new SnapshotIntegrityError("snapshot missing", { streamId });
      }
      validateSnapshot(snapshot, streamId, authoritativeEvents(streamId), fold);
      return snapshot;
    },

    activate(streamId, { fold }) {
      const snapshot = snapshotsByStream.get(streamId);

      if (snapshot) {
        const validation = validateSnapshotResult(snapshot, streamId, authoritativeEvents(streamId), fold);
        if (validation.valid) {
          const tail = authoritativeEvents(streamId).filter((event) => event.seq > snapshot.seq);
          const folded = foldEvents({
            events: tail,
            fold,
            initialState: structuredClone(snapshot.state),
          });

          return {
            ignoredSnapshotReason: null,
            replayedEventSeqs: tail.map((event) => event.seq),
            replayedFromSeq: snapshot.seq + 1,
            state: folded.state,
            throughSeq: maxSeq(authoritativeEvents(streamId)),
            usedSnapshot: true,
          };
        }

        return fullReplayActivation(streamId, fold, "corrupt-snapshot");
      }

      return fullReplayActivation(streamId, fold, null);
    },

    assertSnapshotTailEquivalence(streamId, { fold }) {
      const fromSnapshot = this.activate(streamId, { fold });
      const snapshot = this.requireValidSnapshot(streamId, { fold });
      const fromZero = this.rebuildFromAuthority(streamId, { fold });

      if (!deepEqual(fromSnapshot.state, fromZero.state)) {
        throw new SnapshotIntegrityError("snapshot tail replay diverged from from-zero replay", {
          streamId,
        });
      }

      return {
        fromSnapshot,
        fromZero,
        snapshotTailSeqs: authoritativeEvents(streamId)
          .filter((event) => event.seq > snapshot.seq)
          .map((event) => event.seq),
      };
    },

    compactDomainStream(streamId, { fold, retentionFloorSeq, throughSeq }) {
      assertCompactionAllowed(streamId);
      if (throughSeq < retentionFloorSeq) {
        throw new RetentionFloorError("snapshot must cover at least the retention floor", {
          retentionFloorSeq,
          streamId,
          throughSeq,
        });
      }

      const snapshot = this.writeSnapshot(streamId, { fold, throughSeq });
      const active = streamEvents(activeByStream, streamId);
      const toArchive = active.filter((event) => event.seq <= throughSeq);
      const tail = active.filter((event) => event.seq > throughSeq);
      const cold = streamEvents(coldByStream, streamId);
      cold.push(...toArchive);
      cold.sort(compareEvents);
      activeByStream.set(streamId, tail);

      const marker = Object.freeze({
        contract: CONTRACT_VERSION,
        covers: {
          count: toArchive.length,
          eventDigest: digestEvents(toArchive),
          throughSeq,
        },
        kind: "audit-marker",
        snapshotDigest: snapshot.digest,
        streamId,
        type: "snapshot-compaction.audit-marker",
      });
      streamEvents(auditMarkersByStream, streamId).push(marker);
      return marker;
    },

    archiveTerminalRunStream(streamId, { now, retentionMs }) {
      if (!streamId.startsWith("run.")) {
        throw new CompactionRejectedError("only run.* streams use terminal archival", { streamId });
      }

      const active = activeByStream.get(streamId) ?? [];
      const terminal = [...active].reverse().find((event) => TERMINAL_RUN_EVENTS.has(event.type));
      if (!terminal) {
        return { archived: false, reason: "not-terminal" };
      }

      const terminalAt = terminal.timestamp ?? 0;
      if (now - terminalAt < retentionMs) {
        return { archived: false, reason: "retention-window-open" };
      }

      const cold = streamEvents(coldByStream, streamId);
      cold.push(...active);
      cold.sort(compareEvents);
      activeByStream.set(streamId, []);

      return {
        archived: true,
        reason: "terminal-retention-expired",
        throughSeq: maxSeq(cold),
      };
    },

    rebuildFromAuthority(streamId, { fold }) {
      const folded = foldEvents({
        events: authoritativeEvents(streamId),
        fold,
      });

      return {
        replayedEventSeqs: authoritativeEvents(streamId).map((event) => event.seq),
        state: folded.state,
        throughSeq: maxSeq(authoritativeEvents(streamId)),
      };
    },

    activeEvents(streamId) {
      return [...(activeByStream.get(streamId) ?? [])];
    },

    coldStorageEvents(streamId) {
      return [...(coldByStream.get(streamId) ?? [])];
    },

    auditMarkers(streamId) {
      return [...(auditMarkersByStream.get(streamId) ?? [])];
    },
  };

  function fullReplayActivation(streamId, fold, ignoredSnapshotReason) {
    const events = authoritativeEvents(streamId);
    const folded = foldEvents({ events, fold });
    return {
      ignoredSnapshotReason,
      replayedEventSeqs: events.map((event) => event.seq),
      replayedFromSeq: events.length === 0 ? null : events[0].seq,
      state: folded.state,
      throughSeq: maxSeq(events),
      usedSnapshot: false,
    };
  }
}

export function foldCounter(state = { count: 0, total: 0 }, event) {
  if (!event.type.endsWith(".Incremented") && event.type !== "counter.Incremented") {
    return state;
  }

  const amount = event.data?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new TypeError("counter increment requires finite numeric amount");
  }

  return {
    count: state.count + 1,
    total: state.total + amount,
  };
}

function foldEvents({ events, fold, initialState }) {
  let state = initialState ?? undefined;
  for (const event of events.sort(compareEvents)) {
    state = fold(state, event);
  }

  return { state: state ?? fold(undefined, nullEvent()) };
}

function nullEvent() {
  return Object.freeze({
    data: {},
    seq: 0,
    streamId: "",
    type: "__snapshot_compaction.initial__",
  });
}

function assertCompactionAllowed(streamId) {
  if (NEVER_COMPACT_PREFIXES.some((prefix) => streamId.startsWith(prefix))) {
    throw new CompactionRejectedError("compliance-retained streams are never compacted", {
      protectedPrefixes: NEVER_COMPACT_PREFIXES,
      streamId,
    });
  }
}

function validateSnapshot(snapshot, streamId, events, fold) {
  const result = validateSnapshotResult(snapshot, streamId, events, fold);
  if (!result.valid) {
    throw new SnapshotIntegrityError(result.reason, { streamId });
  }
}

function validateSnapshotResult(snapshot, streamId, events, fold) {
  if (snapshot.contract !== CONTRACT_VERSION || snapshot.streamId !== streamId) {
    return { valid: false, reason: "snapshot-metadata-mismatch" };
  }

  const prefix = events.filter((event) => event.seq <= snapshot.seq);
  const expected = signSnapshot({
    contract: CONTRACT_VERSION,
    eventDigest: digestEvents(prefix),
    seq: snapshot.seq,
    state: foldEvents({ events: prefix, fold }).state,
    streamId,
  });

  if (!deepEqual(snapshot.state, expected.state) || snapshot.digest !== expected.digest) {
    return { valid: false, reason: "corrupt-snapshot" };
  }

  return { valid: true, reason: null };
}

function signSnapshot(snapshot) {
  const digest = hashStable({
    contract: snapshot.contract,
    eventDigest: snapshot.eventDigest,
    seq: snapshot.seq,
    state: snapshot.state,
    streamId: snapshot.streamId,
  });

  return Object.freeze({
    ...structuredClone(snapshot),
    digest,
  });
}

function digestEvents(events) {
  return hashStable(events.map((event) => ({ data: event.data, seq: event.seq, streamId: event.streamId, type: event.type })));
}

function hashStable(value) {
  return createHash("sha256").update(JSON.stringify(sortStable(value))).digest("hex");
}

function sortStable(value) {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortStable(child)]),
    );
  }
  return value;
}

function freezeEvent(input) {
  return Object.freeze({
    data: input.data ?? {},
    seq: input.seq,
    streamId: input.streamId,
    timestamp: input.timestamp ?? null,
    type: input.type,
  });
}

function nextSeq(active, cold) {
  return maxSeq([...active, ...cold]) + 1;
}

function maxSeq(events) {
  return events.reduce((highest, event) => Math.max(highest, event.seq), 0);
}

function compareEvents(left, right) {
  return left.seq - right.seq || left.streamId.localeCompare(right.streamId) || left.type.localeCompare(right.type);
}

function deepEqual(left, right) {
  return JSON.stringify(sortStable(left)) === JSON.stringify(sortStable(right));
}
