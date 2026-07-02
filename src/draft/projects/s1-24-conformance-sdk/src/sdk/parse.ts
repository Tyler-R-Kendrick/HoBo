import { canonicalJson } from "./canonical-json.js";
import {
  SEMANTICS_ANNEX_SPEC_VERSION,
  type AnnexCategory,
  type LoweringFixture,
  type LaneStatus,
  type SdkConformanceReport,
  type SemanticsAnnexVector,
  type VectorCaseResult,
} from "./types.js";

const ANNEX_CATEGORIES = new Set<AnnexCategory>([
  "error-mapping",
  "cancellation",
  "async-ordering",
  "ifc-side-effects",
]);

const REQUIRED_LANES = [
  "golden-ir-lowering-equivalence",
  "semantics-annex",
] as const;

export function parseSemanticsAnnexVectors(raw: unknown): SemanticsAnnexVector[] {
  const envelope = readObject(raw, "semantics annex vectors");
  const vectors = readArray(envelope.semantics ?? envelope, "semantics annex vectors");

  return vectors.map((entry, index) => parseSemanticsAnnexVector(entry, index));
}

function parseSemanticsAnnexVector(raw: unknown, index: number): SemanticsAnnexVector {
  const record = readObject(raw, `semantics annex vector[${index}]`);
  const name = readNonEmptyString(record.name, `semantics annex vector[${index}].name`);
  const category = record.category;

  if (typeof category !== "string" || !ANNEX_CATEGORIES.has(category as AnnexCategory)) {
    throw new TypeError(
      `CUE #AnnexCategory: semantics annex vector[${index}].category must be one of ${[...ANNEX_CATEGORIES].join(", ")}`,
    );
  }

  const specVersion = record.spec_version ?? record.specVersion ?? SEMANTICS_ANNEX_SPEC_VERSION;
  if (specVersion !== SEMANTICS_ANNEX_SPEC_VERSION) {
    throw new TypeError(
      `CUE #SpecVersion: semantics annex vector[${index}] must use ${SEMANTICS_ANNEX_SPEC_VERSION}`,
    );
  }

  const vector: SemanticsAnnexVector = {
    name,
    category: category as AnnexCategory,
    specVersion: SEMANTICS_ANNEX_SPEC_VERSION,
  };

  if (record.result !== undefined) {
    (vector as { result: SemanticsAnnexVector["result"] }).result =
      record.result as SemanticsAnnexVector["result"];
  }
  if (record.expectedThrow !== undefined) {
    (vector as { expectedThrow: SemanticsAnnexVector["expectedThrow"] }).expectedThrow =
      record.expectedThrow as SemanticsAnnexVector["expectedThrow"];
  }
  if (record.signal !== undefined) {
    (vector as { signal: SemanticsAnnexVector["signal"] }).signal =
      record.signal as SemanticsAnnexVector["signal"];
  }
  if (record.expected !== undefined) {
    (vector as { expected: SemanticsAnnexVector["expected"] }).expected =
      record.expected as SemanticsAnnexVector["expected"];
  }
  if (record.facts !== undefined) {
    (vector as { facts: SemanticsAnnexVector["facts"] }).facts =
      record.facts as SemanticsAnnexVector["facts"];
  }
  if (typeof record.expectedError === "string") {
    (vector as { expectedError: string }).expectedError = record.expectedError;
  }

  return Object.freeze(vector);
}

export function parseLoweringCorpus(raw: unknown): LoweringFixture[] {
  const fixtures = readArray(raw, "lowering corpus");
  if (fixtures.length === 0) {
    throw new TypeError("lowering corpus must be non-empty");
  }

  return fixtures.map((entry, index) => {
    const record = readObject(entry, `lowering fixture[${index}]`);
    const name = readNonEmptyString(record.name, `lowering fixture[${index}].name`);
    const program = readObject(record.program, `lowering fixture[${index}].program`);
    const expectedWitCalls = readArray(
      record.expectedWitCalls,
      `lowering fixture[${index}].expectedWitCalls`,
    );
    const expectedManifest = readObject(
      record.expectedManifest,
      `lowering fixture[${index}].expectedManifest`,
    );

    if (expectedManifest.schema !== "hobo.manifest/v1") {
      throw new TypeError(
        `lowering fixture[${index}].expectedManifest.schema must be hobo.manifest/v1`,
      );
    }

    return Object.freeze({
      name,
      program: program as unknown as LoweringFixture["program"],
      expectedWitCalls: expectedWitCalls as LoweringFixture["expectedWitCalls"],
      expectedManifest: expectedManifest as LoweringFixture["expectedManifest"],
    });
  });
}

export function parseSdkConformanceReport(raw: unknown): SdkConformanceReport {
  const record = readObject(raw, "sdk conformance report");

  if (record.suite !== "@hobo/conformance/sdk") {
    throw new TypeError('CUE #SdkConformanceReport: suite must be "@hobo/conformance/sdk"');
  }
  if (record.contract !== "hobo:sdk@0.1.0") {
    throw new TypeError('CUE #SdkConformanceReport: contract must be "hobo:sdk@0.1.0"');
  }
  if (record.status !== "passed" && record.status !== "failed") {
    throw new TypeError('CUE #LaneStatus: report.status must be "passed" or "failed"');
  }
  if (
    typeof record.corpusClaim !== "string" ||
    !record.corpusClaim.includes("bounded by the checked corpus")
  ) {
    throw new TypeError("CUE #SdkConformanceReport: corpus_claim must include bounded-by-corpus text");
  }

  const lanes = readArray(record.lanes, "sdk conformance report.lanes").map((lane, index) =>
    parseLaneReport(lane, index),
  );

  for (const requiredLane of REQUIRED_LANES) {
    if (!lanes.some((lane) => lane.lane === requiredLane)) {
      throw new TypeError(`CUE #SdkConformanceReport: missing required lane ${requiredLane}`);
    }
  }

  return Object.freeze({
    suite: "@hobo/conformance/sdk",
    contract: "hobo:sdk@0.1.0",
    layerName: readNonEmptyString(record.layerName, "sdk conformance report.layerName"),
    authorship: record.authorship === "generated" ? "generated" : "hand-authored",
    status: record.status,
    corpusClaim: record.corpusClaim,
    lanes,
  });
}

function parseLaneReport(raw: unknown, index: number) {
  const record = readObject(raw, `sdk conformance report.lanes[${index}]`);
  const lane = readNonEmptyString(record.lane, `sdk conformance report.lanes[${index}].lane`);
  const status = record.status;
  if (status !== "passed" && status !== "failed") {
    throw new TypeError(`CUE #LaneStatus: lanes[${index}].status must be passed or failed`);
  }

  const cases = readArray(record.cases, `sdk conformance report.lanes[${index}].cases`).map(
    (entry, caseIndex) => parseVectorCaseResult(entry, index, caseIndex),
  );

  return Object.freeze({
    lane,
    status,
    ...(record.boundedByCorpus === true ? { boundedByCorpus: true as const } : {}),
    cases,
  });
}

function parseVectorCaseResult(raw: unknown, laneIndex: number, caseIndex: number) {
  const record = readObject(raw, `lanes[${laneIndex}].cases[${caseIndex}]`);
  const status = record.status;
  if (status !== "passed" && status !== "failed") {
    throw new TypeError(
      `CUE #LaneStatus: lanes[${laneIndex}].cases[${caseIndex}].status must be passed or failed`,
    );
  }

  const base: {
    name: string;
    category?: string;
    status: LaneStatus;
    reason?: string;
    expectedJson?: string;
    actualJson?: string;
    diffPaths?: string[];
  } = {
    name: readNonEmptyString(record.name, `lanes[${laneIndex}].cases[${caseIndex}].name`),
    status: status as LaneStatus,
  };

  if (typeof record.category === "string") {
    base.category = record.category;
  }
  if (typeof record.reason === "string") {
    base.reason = record.reason;
  }
  const expectedJson =
    typeof record.expectedJson === "string"
      ? record.expectedJson
      : typeof record.expected_json === "string"
        ? record.expected_json
        : undefined;
  if (expectedJson !== undefined) {
    base.expectedJson = expectedJson;
  }
  const actualJson =
    typeof record.actualJson === "string"
      ? record.actualJson
      : typeof record.actual_json === "string"
        ? record.actual_json
        : undefined;
  if (actualJson !== undefined) {
    base.actualJson = actualJson;
  }
  const diffPaths = Array.isArray(record.diffPaths)
    ? (record.diffPaths as string[])
    : Array.isArray(record.diff_paths)
      ? (record.diff_paths as string[])
      : undefined;
  if (diffPaths !== undefined) {
    base.diffPaths = diffPaths;
  }

  if (status === "failed") {
    if (!base.reason) {
      throw new TypeError(
        `CUE #VectorCaseResult: failed case lanes[${laneIndex}].cases[${caseIndex}] must include reason`,
      );
    }
    if (!base.expectedJson || !base.actualJson || !base.diffPaths || base.diffPaths.length === 0) {
      throw new TypeError(
        `CUE #VectorCaseResult: failed case lanes[${laneIndex}].cases[${caseIndex}] must include expected_json, actual_json, and diff_paths`,
      );
    }
  }

  return Object.freeze(base) as VectorCaseResult;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

export function serializeReportForPact(report: SdkConformanceReport): Record<string, unknown> {
  return {
    suite: report.suite,
    contract: report.contract,
    layerName: report.layerName,
    authorship: report.authorship,
    status: report.status,
    corpusClaim: report.corpusClaim,
    lanes: report.lanes.map((lane) => ({
      lane: lane.lane,
      status: lane.status,
      boundedByCorpus: lane.boundedByCorpus ?? false,
      cases: lane.cases.map((entry) => ({
        name: entry.name,
        category: entry.category,
        status: entry.status,
        reason: entry.reason,
        expectedJson: entry.expectedJson,
        actualJson: entry.actualJson,
        diffPaths: entry.diffPaths,
      })),
    })),
  };
}

export function canonicalizeReportJson(report: SdkConformanceReport): string {
  return canonicalJson(serializeReportForPact(report));
}
