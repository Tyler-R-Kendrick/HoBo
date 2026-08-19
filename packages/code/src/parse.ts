/**
 * Parse, don't validate: untrusted isolation / promotion / evidence input becomes
 * frozen derived domain types or throws. Downstream code accepts only parsed types.
 */
import {
	CODE_EVIDENCE_SCHEMA,
	CODE_ISOLATION_SCHEMA,
	type EvidenceKind,
	type EvidenceTriple,
	type GuestEvidenceSubmission,
	type IsolationContext,
	type IsolationKind,
	type IsolationStatus,
	type PromotionRequest,
} from "./types.js";

function requireObject(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError(`${path} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`);
	}
	return value;
}

function requireBoolean(value: unknown, path: string): boolean {
	if (typeof value !== "boolean") {
		throw new TypeError(`${path} must be a boolean`);
	}
	return value;
}

const EVIDENCE_KINDS = new Set<EvidenceKind>([
	"status",
	"test",
	"feature",
	"decision",
	"diagram",
	"screenshot",
	"recording",
	"replay",
	"annotation",
	"note",
]);
const ARTIFACT_REF = /^sha256:[0-9a-f]{64}$/;

/** Parse guest evidence without allowing the guest to assign host trust. */
export function parseGuestEvidenceSubmission(
	input: unknown,
): GuestEvidenceSubmission {
	const source = requireObject(input, "GuestEvidenceSubmission");
	for (const hostOwned of [
		"verification",
		"origin",
		"actor",
		"recordedAt",
		"path",
		"uri",
	]) {
		if (hostOwned in source) {
			throw new TypeError(`${hostOwned} is host-owned`);
		}
	}
	const kind = requireString(source.kind, "kind") as EvidenceKind;
	if (!EVIDENCE_KINDS.has(kind)) {
		throw new TypeError("kind must be a hobo:evidence kind");
	}
	const artifactRefs = Array.isArray(source.artifactRefs)
		? source.artifactRefs.map((ref, index) => {
				const value = requireString(ref, `artifactRefs[${index}]`);
				if (!ARTIFACT_REF.test(value)) {
					throw new TypeError(
						`artifactRefs[${index}] must be a sha256 reference`,
					);
				}
				return value;
			})
		: [];
	return Object.freeze({
		kind,
		title: requireString(source.title, "title"),
		summary: requireString(source.summary, "summary"),
		subject: requireString(source.subject, "subject"),
		artifactRefs: Object.freeze(artifactRefs),
		...(source.sourceRef === undefined
			? {}
			: { sourceRef: requireString(source.sourceRef, "sourceRef") }),
	});
}

/** Parse isolation context from untrusted JSON/wire into a derived domain type. */
export function parseIsolationContext(input: unknown): IsolationContext {
	const source = requireObject(input, "IsolationContext");
	const schemaVersion = requireString(source.schemaVersion, "schemaVersion");
	if (schemaVersion !== CODE_ISOLATION_SCHEMA) {
		throw new TypeError(`schemaVersion must be ${CODE_ISOLATION_SCHEMA}`);
	}
	const backendRaw = requireObject(source.backend, "backend");
	const kind = requireString(backendRaw.kind, "backend.kind") as IsolationKind;
	if (kind !== "rift" && kind !== "worktree") {
		throw new TypeError("backend.kind must be rift|worktree");
	}
	const status = requireString(source.status, "status") as IsolationStatus;
	if (status !== "open" && status !== "cleaned" && status !== "failed") {
		throw new TypeError("status must be open|cleaned|failed");
	}
	if (source.mediatedOnly !== true) {
		throw new TypeError("mediatedOnly must be true for agent isolation");
	}

	const parsed: IsolationContext = Object.freeze({
		schemaVersion: CODE_ISOLATION_SCHEMA,
		runId: requireString(source.runId, "runId"),
		branch: requireString(source.branch, "branch"),
		rootPath: requireString(source.rootPath, "rootPath"),
		backend: Object.freeze({
			kind,
			platform: requireString(backendRaw.platform, "backend.platform"),
			cowCapable: requireBoolean(backendRaw.cowCapable, "backend.cowCapable"),
			reason: requireString(backendRaw.reason, "backend.reason"),
		}),
		...(typeof source.stationId === "string" && source.stationId.length > 0
			? { stationId: source.stationId }
			: {}),
		durableRoot: requireString(source.durableRoot, "durableRoot"),
		createdAt: requireString(source.createdAt, "createdAt"),
		status,
		projectRoot: requireString(source.projectRoot, "projectRoot"),
		mediatedOnly: true as const,
	});
	return parsed;
}

/** Parse promotion request; squashOnly must be true. */
export function parsePromotionRequest(input: unknown): PromotionRequest {
	const source = requireObject(input, "PromotionRequest");
	if (source.squashOnly !== true) {
		throw new TypeError("squashOnly must be true (exclusive squash-merge)");
	}
	const gateResults = Array.isArray(source.gateResults)
		? source.gateResults.filter((g): g is string => typeof g === "string")
		: [];
	return Object.freeze({
		runId: requireString(source.runId, "runId"),
		isolationRoot: requireString(source.isolationRoot, "isolationRoot"),
		targetProject: requireString(source.targetProject, "targetProject"),
		gateResults: Object.freeze(gateResults),
		squashOnly: true as const,
	});
}

/** Parse evidence triple durable artifact. */
export function parseEvidenceTriple(input: unknown): EvidenceTriple {
	const source = requireObject(input, "EvidenceTriple");
	const schemaVersion = requireString(source.schemaVersion, "schemaVersion");
	if (schemaVersion !== CODE_EVIDENCE_SCHEMA) {
		throw new TypeError(`schemaVersion must be ${CODE_EVIDENCE_SCHEMA}`);
	}
	const screenshots = Array.isArray(source.screenshotPaths)
		? source.screenshotPaths.filter((p): p is string => typeof p === "string")
		: [];
	if (screenshots.length === 0) {
		throw new TypeError("screenshotPaths must be non-empty");
	}
	return Object.freeze({
		schemaVersion: CODE_EVIDENCE_SCHEMA,
		flagKey: requireString(source.flagKey, "flagKey"),
		scenario: requireString(source.scenario, "scenario"),
		playwrightScriptPath: requireString(
			source.playwrightScriptPath,
			"playwrightScriptPath",
		),
		recordingMp4Path: requireString(
			source.recordingMp4Path,
			"recordingMp4Path",
		),
		screenshotPaths: Object.freeze(screenshots),
		durableRoot: requireString(source.durableRoot, "durableRoot"),
	});
}
