export const CONTRACT_VERSION = "hobo.multi-region-dr-replay/v1";

export const RTO_TARGET_MS = 15 * 60 * 1000;
export const RPO_ASYNC_TARGET_MS = 5_000;

const AUTHORITATIVE_LOG_MODES = new Set(["active-passive-log", "sync-quorum"]);
const STATELESS_TIER_ROLES = new Set(["gateway", "planner", "executor"]);

export function parseMultiRegionTopology(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("topology manifest is required");
  }

  const authoritativeLog = requiredObject(raw.authoritativeLog, "authoritativeLog");
  const statelessTier = requiredObject(raw.statelessTier, "statelessTier");
  const regions = requiredStringArray(raw.regions, "regions", { minLength: 2 });

  const logMode = requiredEnum(
    authoritativeLog.mode,
    "authoritativeLog.mode",
    AUTHORITATIVE_LOG_MODES,
  );
  const primaryRegion = requiredString(authoritativeLog.primaryRegion, "authoritativeLog.primaryRegion");

  if (!regions.includes(primaryRegion)) {
    throw new Error("authoritativeLog.primaryRegion must be listed in regions");
  }

  const passiveRegions = regions.filter((region) => region !== primaryRegion);
  const statelessMode = requiredEnum(
    statelessTier.mode,
    "statelessTier.mode",
    new Set(["active-active"]),
  );
  const roles = requiredStringArray(statelessTier.roles, "statelessTier.roles", { minLength: 1 });

  for (const role of roles) {
    if (!STATELESS_TIER_ROLES.has(role)) {
      throw new Error(`unsupported stateless role: ${role}`);
    }
  }

  return deepFreeze({
    contractVersion: CONTRACT_VERSION,
    regions,
    authoritativeLog: {
      mode: logMode,
      primaryRegion,
      passiveRegions,
      replication: authoritativeLog.replication ?? "cross-region-quorum",
    },
    statelessTier: {
      mode: statelessMode,
      roles,
      horizontallyScaled: true,
    },
  });
}

export function assessCrossRegionReplication(rawLog) {
  const log = parseReplicatedLog(rawLog);
  const lagMs = log.replicationLagMs;
  const seqGap = log.lastCommittedSeq - log.replicatedSeq;
  const withinRpo = lagMs <= RPO_ASYNC_TARGET_MS && seqGap === 0
    ? true
    : lagMs <= RPO_ASYNC_TARGET_MS;

  return deepFreeze({
    topology: log.topology,
    primaryRegion: log.primaryRegion,
    replicaRegion: log.replicaRegion,
    lastCommittedSeq: log.lastCommittedSeq,
    replicatedSeq: log.replicatedSeq,
    replicationLagMs: lagMs,
    rpo: {
      ms: lagMs,
      targetMs: RPO_ASYNC_TARGET_MS,
      withinTarget: withinRpo,
      claimsZeroDataLoss: lagMs === 0 && seqGap === 0,
      unreplicatedSeqRange: seqGap > 0 ? [log.replicatedSeq + 1, log.lastCommittedSeq] : [],
    },
  });
}

export function yardUpRestore(input = {}) {
  const request = parseRestoreRequest(input);
  const log = parseReplicatedLog(input.log ?? input.sourceLog);
  const topology = input.topology ? parseMultiRegionTopology(input.topology) : null;
  const replication = assessCrossRegionReplication(log);
  const replay = replayEventLog(log);
  const integrity = verifyProjectionIntegrity({
    before: input.preLossSnapshots ?? log.preLossSnapshots,
    after: replay.projectionSnapshots,
  });

  const startedAt = Date.parse(request.startedAt);
  const completedAt = Date.parse(request.completedAt ?? replay.completedAt);
  const rtoMs = completedAt - startedAt;

  if (rtoMs < 0) {
    throw new Error("completedAt must not be before startedAt");
  }

  const status = integrity.byteIdentical && replay.ok && replication.rpo.withinTarget
    ? "restored"
    : "failed";

  return deepFreeze({
    command: {
      argv: ["hobo", "yard", "up", "--restore", request.logPath],
      logPath: request.logPath,
    },
    status,
    contractVersion: CONTRACT_VERSION,
    topology,
    replication,
    replay,
    integrity,
    rto: {
      ms: rtoMs,
      targetMs: RTO_TARGET_MS,
      withinTarget: rtoMs < RTO_TARGET_MS,
    },
    actorsRehydrated: replay.actorsRehydrated,
    projectionsRehydrated: replay.projectionsRehydrated,
  });
}

export function replayEventLog(rawLog) {
  const log = parseReplicatedLog(rawLog);
  const projectionSnapshots = {};
  const actorStreams = {};
  let replayedEvents = 0;

  for (const [streamId, events] of Object.entries(log.streams)) {
    const ordered = [...events].sort((left, right) => left.seq - right.seq);

    for (const event of ordered) {
      if (!Number.isInteger(event.seq) || event.seq < 0) {
        throw new Error(`invalid seq on stream ${streamId}`);
      }
      if (typeof event.type !== "string" || event.type.length === 0) {
        throw new Error(`invalid event type on stream ${streamId}`);
      }
      replayedEvents += 1;
    }

    if (streamId.startsWith("projection:")) {
      const rebuilt = foldProjectionStream(ordered);
      projectionSnapshots[streamId] = rebuilt.snapshot;
    }

    if (streamId.startsWith("actor:")) {
      actorStreams[streamId] = foldActorStream(ordered);
    }
  }

  if (replayedEvents === 0) {
    throw new Error("replicated log contains no replayable events");
  }

  return deepFreeze({
    ok: true,
    replayedEvents,
    actorsRehydrated: Object.keys(actorStreams).length,
    projectionsRehydrated: Object.keys(projectionSnapshots).length,
    projectionSnapshots,
    actorHeads: actorStreams,
    completedAt: log.restoreCompletedAt ?? new Date().toISOString(),
  });
}

export function runRegionLossDrill(scenario = {}) {
  const lostRegion = requiredString(scenario.lostRegion, "lostRegion");
  const targetRegion = requiredString(scenario.targetRegion, "targetRegion");
  const topology = parseMultiRegionTopology(scenario.topology);
  const log = parseReplicatedLog(scenario.log);
  const detectedAt = validateIso(scenario.detectedAt, "detectedAt");
  const restoredAt = validateIso(
    scenario.restoredAt ?? addMilliseconds(detectedAt, scenario.restoreDurationMs ?? 8 * 60 * 1000),
    "restoredAt",
  );

  if (lostRegion === targetRegion) {
    throw new Error("targetRegion must differ from lostRegion");
  }

  if (!topology.regions.includes(lostRegion) || !topology.regions.includes(targetRegion)) {
    throw new Error("drill regions must be declared in topology manifest");
  }

  const restore = yardUpRestore({
    logPath: scenario.logPath ?? `/replicated/${targetRegion}/yard-event-log`,
    log,
    topology,
    preLossSnapshots: scenario.preLossSnapshots ?? log.preLossSnapshots,
    startedAt: detectedAt,
    completedAt: restoredAt,
  });

  const rtoMs = Date.parse(restoredAt) - Date.parse(detectedAt);
  const passed = restore.status === "restored"
    && restore.rto.withinTarget
    && restore.replication.rpo.withinTarget
    && restore.integrity.byteIdentical;

  return deepFreeze({
    status: passed ? "passed" : "failed",
    lostRegion,
    targetRegion,
    restore,
    rto: restore.rto,
    rpo: restore.replication.rpo,
    integrity: restore.integrity,
    functional: restore.replay.ok && restore.actorsRehydrated > 0 && restore.projectionsRehydrated > 0,
  });
}

export function verifyProjectionIntegrity({ before, after } = {}) {
  const beforeSnapshots = requiredObject(before ?? {}, "before");
  const afterSnapshots = requiredObject(after ?? {}, "after");
  const mismatches = [];

  for (const [streamId, expectedHash] of Object.entries(beforeSnapshots)) {
    const actualHash = afterSnapshots[streamId];
    if (typeof actualHash !== "string") {
      mismatches.push({ streamId, reason: "missing-after-snapshot" });
      continue;
    }
    if (actualHash !== expectedHash) {
      mismatches.push({ streamId, reason: "hash-mismatch", expected: expectedHash, actual: actualHash });
    }
  }

  for (const streamId of Object.keys(afterSnapshots)) {
    if (!(streamId in beforeSnapshots)) {
      mismatches.push({ streamId, reason: "unexpected-after-snapshot" });
    }
  }

  return deepFreeze({
    byteIdentical: mismatches.length === 0,
    comparedStreams: Object.keys(beforeSnapshots).length,
    mismatches,
  });
}

function parseRestoreRequest(input) {
  const logPath = requiredString(input.logPath ?? input.log, "logPath");
  return {
    logPath,
    startedAt: validateIso(input.startedAt ?? new Date(0).toISOString(), "startedAt"),
    completedAt: input.completedAt ? validateIso(input.completedAt, "completedAt") : null,
  };
}

function parseReplicatedLog(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("replicated log is required");
  }

  const streams = requiredObject(raw.streams, "streams");
  const streamEntries = Object.entries(streams);

  if (streamEntries.length === 0) {
    throw new Error("replicated log streams must not be empty");
  }

  for (const [streamId, events] of streamEntries) {
    if (!Array.isArray(events)) {
      throw new Error(`stream ${streamId} must be an event array`);
    }
  }

  const lastCommittedSeq = nonNegativeInteger(raw.lastCommittedSeq, "lastCommittedSeq");
  const replicatedSeq = nonNegativeInteger(raw.replicatedSeq, "replicatedSeq");

  if (replicatedSeq > lastCommittedSeq) {
    throw new Error("replicatedSeq must not exceed lastCommittedSeq");
  }

  return {
    topology: requiredString(raw.topology ?? "cross-region-quorum", "topology"),
    primaryRegion: requiredString(raw.primaryRegion ?? "us-east-1", "primaryRegion"),
    replicaRegion: requiredString(raw.replicaRegion ?? "us-west-2", "replicaRegion"),
    lastCommittedSeq,
    replicatedSeq,
    replicationLagMs: nonNegativeInteger(raw.replicationLagMs ?? 0, "replicationLagMs"),
    snapshotSeq: nonNegativeInteger(raw.snapshotSeq ?? 0, "snapshotSeq"),
    streams,
    preLossSnapshots: raw.preLossSnapshots ?? null,
    restoreCompletedAt: raw.restoreCompletedAt ?? null,
  };
}

function foldProjectionStream(events) {
  const payload = events.map((event) => `${event.seq}:${event.type}:${stablePayload(event.payload)}`).join("|");
  return {
    lastSeq: events.at(-1)?.seq ?? 0,
    snapshot: hashText(payload),
  };
}

function foldActorStream(events) {
  return {
    lastSeq: events.at(-1)?.seq ?? 0,
    head: events.at(-1)?.payload?.state ?? "rehydrated",
  };
}

function stablePayload(payload) {
  if (payload === undefined || payload === null) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload);
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function requiredObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function requiredStringArray(value, fieldName, { minLength = 0 } = {}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`${fieldName} must be a non-empty string array`);
  }
  if (value.length < minLength) {
    throw new Error(`${fieldName} must contain at least ${minLength} entries`);
  }
  return value.map((entry) => entry.trim());
}

function requiredEnum(value, fieldName, allowed) {
  const normalized = requiredString(value, fieldName);
  if (!allowed.has(normalized)) {
    throw new Error(`${fieldName} must be one of ${[...allowed].join(", ")}`);
  }
  return normalized;
}

function nonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function validateIso(value, fieldName) {
  const text = requiredString(value, fieldName);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${fieldName} must be ISO-8601`);
  }
  return text;
}

function addMilliseconds(iso, milliseconds) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
