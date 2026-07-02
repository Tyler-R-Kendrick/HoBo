export const GATE_ID = "s1-stage-gate" as const;

export const CHECK_IDS = [
  "runtime-port-conformance",
  "offline-hello-bindle",
  "replay-equals-live",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];
export type CheckStatus = "pass" | "fail";

export type StageGateCheck = {
  readonly checkId: CheckId;
  readonly status: CheckStatus;
  readonly durationMs: number;
  readonly reportRef: string;
};

export type StageGateS1Record = {
  readonly gateId: typeof GATE_ID;
  readonly commitSha: string;
  readonly workflowRunUrl: string;
  readonly checks: readonly StageGateCheck[];
  readonly recordedAt: string;
};

export class StageGateRecordParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageGateRecordParseError";
  }
}

export function parseStageGateS1Record(input: unknown): StageGateS1Record {
  if (!input || typeof input !== "object") {
    throw new StageGateRecordParseError("record must be an object");
  }

  const raw = input as Record<string, unknown>;
  const gateId = readString(raw, "gate_id");
  if (gateId !== GATE_ID) {
    throw new StageGateRecordParseError(`gate_id must be "${GATE_ID}"`);
  }

  const commitSha = readString(raw, "commit_sha");
  if (!commitSha) {
    throw new StageGateRecordParseError("commit_sha is required");
  }

  const workflowRunUrl = readString(raw, "workflow_run_url");
  const recordedAt = readString(raw, "recorded_at");
  if (!recordedAt) {
    throw new StageGateRecordParseError("recorded_at is required");
  }

  if (!Array.isArray(raw.checks) || raw.checks.length !== CHECK_IDS.length) {
    throw new StageGateRecordParseError(`checks must contain exactly ${CHECK_IDS.length} entries`);
  }

  const checks = CHECK_IDS.map((expectedId, index) => parseCheck(raw.checks[index], expectedId, index));

  const record = Object.freeze({
    gateId: GATE_ID,
    commitSha,
    workflowRunUrl,
    checks: Object.freeze(checks),
    recordedAt,
  });

  if (isValidGreenRecord(record)) {
    return record;
  }

  return record;
}

export function isValidGreenRecord(record: StageGateS1Record): boolean {
  return record.checks.every((check) => check.status === "pass")
    && record.checks.find((check) => check.checkId === "offline-hello-bindle")!.durationMs <= 60_000;
}

export function toRecordJson(record: StageGateS1Record): Record<string, unknown> {
  return {
    gate_id: record.gateId,
    commit_sha: record.commitSha,
    workflow_run_url: record.workflowRunUrl,
    recorded_at: record.recordedAt,
    checks: record.checks.map((check) => ({
      check_id: check.checkId,
      status: check.status,
      duration_ms: check.durationMs,
      report_ref: check.reportRef,
    })),
  };
}

function parseCheck(input: unknown, expectedId: CheckId, index: number): StageGateCheck {
  if (!input || typeof input !== "object") {
    throw new StageGateRecordParseError(`checks[${index}] must be an object`);
  }

  const raw = input as Record<string, unknown>;
  const checkId = readString(raw, "check_id");
  if (checkId !== expectedId) {
    throw new StageGateRecordParseError(`checks[${index}].check_id must be "${expectedId}"`);
  }

  const status = readString(raw, "status");
  if (status !== "pass" && status !== "fail") {
    throw new StageGateRecordParseError(`checks[${index}].status must be pass or fail`);
  }

  const durationMs = readUint(raw, "duration_ms");
  if (checkId === "offline-hello-bindle" && durationMs > 60_000) {
    throw new StageGateRecordParseError("offline-hello-bindle.duration_ms must be <= 60000");
  }

  return Object.freeze({
    checkId: expectedId,
    status,
    durationMs,
    reportRef: readString(raw, "report_ref"),
  });
}

function readString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new StageGateRecordParseError(`${key} must be a string`);
  }
  return value;
}

function readUint(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new StageGateRecordParseError(`${key} must be a non-negative integer`);
  }
  return value;
}
