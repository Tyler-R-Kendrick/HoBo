export type StageGateCheckKind =
	| "lint"
	| "guard"
	| "schema"
	| "contract"
	| "conformance"
	| "build"
	| "sign"
	| "verify";

export interface StageGateCheck {
	readonly checkId: string;
	readonly command: readonly string[];
	readonly kind: StageGateCheckKind;
}

export interface StageGateDefinition {
	readonly gateId: string;
	readonly checks: readonly StageGateCheck[];
}

export type CheckStatus = "passed" | "failed" | "skipped";
export type RecordStatus = "passed" | "failed" | "skipped";

export interface CheckResult {
	readonly checkId: string;
	readonly command: readonly string[];
	readonly exitCode: number;
	readonly status: CheckStatus;
	readonly evidence: Readonly<Record<string, string>>;
}

export interface ComponentArtifact {
	readonly digestSha256: string;
	readonly byteLength: number;
	readonly mediaType: string;
}

export interface SignatureEvidence {
	readonly verified: boolean;
	readonly signerIdentity: string;
	readonly provenanceTier: string;
	readonly conformanceReportDigest: string;
}

export interface StageGateRecord {
	readonly gateId: string;
	readonly status: RecordStatus;
	readonly repoCommit: string;
	readonly ciRunUrl: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly checks: readonly CheckResult[];
	readonly artifact: ComponentArtifact;
	readonly signature: SignatureEvidence;
}

export class StageGateParseError extends Error {
	readonly issues: readonly string[];

	constructor(issues: readonly string[]) {
		super(`stage-gate record parse failed: ${issues.join("; ")}`);
		this.name = "StageGateParseError";
		this.issues = issues;
	}
}

export interface RunStageGateOptions {
	readonly cwd?: string;
	readonly outFile?: string;
	readonly ciRunUrl?: string;
	readonly env?: Readonly<Record<string, string>>;
}

export interface RunStageGateResult {
	readonly record: StageGateRecord;
	readonly exitCode: number;
}
