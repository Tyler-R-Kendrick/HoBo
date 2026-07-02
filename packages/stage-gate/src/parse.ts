import type {
	CheckResult,
	ComponentArtifact,
	RecordStatus,
	SignatureEvidence,
	StageGateRecord,
} from "./types.js";
import { StageGateParseError } from "./types.js";

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const HTTPS_RE = /^https:\/\//;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const CHECK_STATUS = new Set(["passed", "failed", "skipped"]);
const RECORD_STATUS = new Set(["passed", "failed", "skipped"]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: string[], message: string): void {
	issues.push(message);
}

function parseCheckResult(
	raw: unknown,
	issues: string[],
	path: string,
): CheckResult | null {
	if (!isObject(raw)) {
		pushIssue(issues, `${path}: expected object`);
		return null;
	}
	const checkId = raw.check_id ?? raw.checkId;
	if (typeof checkId !== "string" || checkId.length === 0) {
		pushIssue(issues, `${path}.check_id: required non-empty string`);
	}
	const commandRaw = raw.command;
	const command = Array.isArray(commandRaw)
		? commandRaw.map((entry, index) => {
				if (typeof entry !== "string") {
					pushIssue(issues, `${path}.command[${index}]: expected string`);
					return "";
				}
				return entry;
			})
		: (pushIssue(issues, `${path}.command: expected array`), []);
	const exitCode = raw.exit_code ?? raw.exitCode;
	if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
		pushIssue(issues, `${path}.exit_code: expected integer`);
	}
	const status = raw.status;
	if (typeof status !== "string" || !CHECK_STATUS.has(status)) {
		pushIssue(issues, `${path}.status: expected passed|failed|skipped`);
	}
	const evidenceRaw = raw.evidence;
	const evidence: Record<string, string> = {};
	if (evidenceRaw !== undefined) {
		if (!isObject(evidenceRaw)) {
			pushIssue(issues, `${path}.evidence: expected object`);
		} else {
			for (const [key, value] of Object.entries(evidenceRaw)) {
				if (typeof value !== "string") {
					pushIssue(issues, `${path}.evidence.${key}: expected string`);
					continue;
				}
				evidence[key] = value;
			}
		}
	}
	if (issues.length > 0) {
		return null;
	}
	return {
		checkId: checkId as string,
		command,
		exitCode: exitCode as number,
		status: status as CheckResult["status"],
		evidence,
	};
}

function parseComponentArtifact(
	raw: unknown,
	issues: string[],
	path: string,
): ComponentArtifact | null {
	if (!isObject(raw)) {
		pushIssue(issues, `${path}: expected object`);
		return null;
	}
	const digest = raw.digest_sha256 ?? raw.digestSha256;
	if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
		pushIssue(issues, `${path}.digest_sha256: expected sha256:<64 hex>`);
	}
	const byteLength = raw.byte_length ?? raw.byteLength;
	if (
		typeof byteLength !== "number" ||
		byteLength < 0 ||
		!Number.isInteger(byteLength)
	) {
		pushIssue(issues, `${path}.byte_length: expected non-negative integer`);
	}
	const mediaType = raw.media_type ?? raw.mediaType;
	if (typeof mediaType !== "string" || mediaType.length === 0) {
		pushIssue(issues, `${path}.media_type: required non-empty string`);
	}
	if (issues.length > 0) {
		return null;
	}
	return {
		digestSha256: digest as string,
		byteLength: byteLength as number,
		mediaType: mediaType as string,
	};
}

function parseSignatureEvidence(
	raw: unknown,
	issues: string[],
	path: string,
): SignatureEvidence | null {
	if (!isObject(raw)) {
		pushIssue(issues, `${path}: expected object`);
		return null;
	}
	const verified = raw.verified;
	if (typeof verified !== "boolean") {
		pushIssue(issues, `${path}.verified: expected boolean`);
	}
	const signerIdentity = raw.signer_identity ?? raw.signerIdentity;
	if (typeof signerIdentity !== "string") {
		pushIssue(issues, `${path}.signer_identity: expected string`);
	}
	const provenanceTier = raw.provenance_tier ?? raw.provenanceTier;
	if (typeof provenanceTier !== "string") {
		pushIssue(issues, `${path}.provenance_tier: expected string`);
	}
	const conformanceReportDigest =
		raw.conformance_report_digest ?? raw.conformanceReportDigest;
	if (
		conformanceReportDigest !== undefined &&
		conformanceReportDigest !== "" &&
		(typeof conformanceReportDigest !== "string" ||
			!DIGEST_RE.test(conformanceReportDigest))
	) {
		pushIssue(issues, `${path}.conformance_report_digest: invalid digest`);
	}
	if (issues.length > 0) {
		return null;
	}
	return {
		verified: verified as boolean,
		signerIdentity: signerIdentity as string,
		provenanceTier: provenanceTier as string,
		conformanceReportDigest: (conformanceReportDigest ?? "") as string,
	};
}

function compareIsoTimestamps(
	startedAt: string,
	finishedAt: string,
	issues: string[],
): void {
	if (startedAt >= finishedAt) {
		pushIssue(issues, "finished_at must be >= started_at");
	}
}

function validatePassedRecordConstraints(
	record: StageGateRecord,
	issues: string[],
): void {
	if (record.status !== "passed") {
		return;
	}
	if (record.gateId !== "s0") {
		pushIssue(issues, 'gate_id must be "s0" for passed S0 records');
	}
	for (const check of record.checks) {
		if (check.status !== "passed") {
			pushIssue(
				issues,
				`passed record requires every check passed (${check.checkId})`,
			);
		}
	}
	if (!record.signature.verified) {
		pushIssue(issues, "passed record requires signature.verified === true");
	}
	if (!DIGEST_RE.test(record.artifact.digestSha256)) {
		pushIssue(issues, "passed record requires artifact.digest_sha256");
	}
}

export function parseStageGateRecord(raw: unknown): StageGateRecord {
	const issues: string[] = [];
	if (!isObject(raw)) {
		throw new StageGateParseError(["record: expected object"]);
	}

	const gateId = raw.gate_id ?? raw.gateId;
	if (typeof gateId !== "string" || gateId.length === 0) {
		pushIssue(issues, "gate_id: required non-empty string");
	}
	const status = raw.status;
	if (typeof status !== "string" || !RECORD_STATUS.has(status)) {
		pushIssue(issues, "status: expected passed|failed|skipped");
	}
	const repoCommit = raw.repo_commit ?? raw.repoCommit;
	if (typeof repoCommit !== "string") {
		pushIssue(issues, "repo_commit: expected string");
	}
	const ciRunUrl = raw.ci_run_url ?? raw.ciRunUrl ?? "";
	if (typeof ciRunUrl !== "string") {
		pushIssue(issues, "ci_run_url: expected string");
	} else if (ciRunUrl.length > 0 && !HTTPS_RE.test(ciRunUrl)) {
		pushIssue(issues, "ci_run_url: must start with https:// when set");
	}
	const startedAt = raw.started_at ?? raw.startedAt;
	if (typeof startedAt !== "string" || !ISO_RE.test(startedAt)) {
		pushIssue(issues, "started_at: expected ISO-8601 timestamp");
	}
	const finishedAt = raw.finished_at ?? raw.finishedAt;
	if (typeof finishedAt !== "string" || !ISO_RE.test(finishedAt)) {
		pushIssue(issues, "finished_at: expected ISO-8601 timestamp");
	}
	if (
		typeof startedAt === "string" &&
		typeof finishedAt === "string" &&
		ISO_RE.test(startedAt) &&
		ISO_RE.test(finishedAt)
	) {
		compareIsoTimestamps(startedAt, finishedAt, issues);
	}

	const checksRaw = raw.checks;
	const checks: CheckResult[] = [];
	if (!Array.isArray(checksRaw)) {
		pushIssue(issues, "checks: expected array");
	} else {
		for (const [index, entry] of checksRaw.entries()) {
			const parsed = parseCheckResult(entry, issues, `checks[${index}]`);
			if (parsed) {
				checks.push(parsed);
			}
		}
	}

	const artifactIssues: string[] = [];
	const artifact = parseComponentArtifact(
		raw.artifact,
		artifactIssues,
		"artifact",
	) ?? {
		digestSha256: "sha256:" + "0".repeat(64),
		byteLength: 0,
		mediaType: "application/octet-stream",
	};
	issues.push(...artifactIssues);

	const signatureIssues: string[] = [];
	const signature = parseSignatureEvidence(
		raw.signature,
		signatureIssues,
		"signature",
	) ?? {
		verified: false,
		signerIdentity: "",
		provenanceTier: "",
		conformanceReportDigest: "",
	};
	issues.push(...signatureIssues);

	if (issues.length > 0) {
		throw new StageGateParseError(issues);
	}

	const record: StageGateRecord = {
		gateId: gateId as string,
		status: status as RecordStatus,
		repoCommit: repoCommit as string,
		ciRunUrl: ciRunUrl as string,
		startedAt: startedAt as string,
		finishedAt: finishedAt as string,
		checks,
		artifact,
		signature,
	};

	const passedIssues: string[] = [];
	validatePassedRecordConstraints(record, passedIssues);
	if (passedIssues.length > 0) {
		throw new StageGateParseError(passedIssues);
	}

	return record;
}

export function serializeStageGateRecord(
	record: StageGateRecord,
): Record<string, unknown> {
	return {
		gate_id: record.gateId,
		status: record.status,
		repo_commit: record.repoCommit,
		ci_run_url: record.ciRunUrl,
		started_at: record.startedAt,
		finished_at: record.finishedAt,
		checks: record.checks.map((check) => ({
			check_id: check.checkId,
			command: [...check.command],
			exit_code: check.exitCode,
			status: check.status,
			evidence: { ...check.evidence },
		})),
		artifact: {
			digest_sha256: record.artifact.digestSha256,
			byte_length: record.artifact.byteLength,
			media_type: record.artifact.mediaType,
		},
		signature: {
			verified: record.signature.verified,
			signer_identity: record.signature.signerIdentity,
			provenance_tier: record.signature.provenanceTier,
			conformance_report_digest: record.signature.conformanceReportDigest,
		},
	};
}
