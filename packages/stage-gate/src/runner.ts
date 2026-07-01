import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

import { serializeStageGateRecord } from "./parse.js";
import type {
	CheckResult,
	ComponentArtifact,
	RecordStatus,
	RunStageGateOptions,
	RunStageGateResult,
	SignatureEvidence,
	StageGateDefinition,
	StageGateRecord,
} from "./types.js";

function readRepoCommit(cwd: string): string {
	try {
		return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
	} catch {
		return "unknown";
	}
}

function runCheck(
	command: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): { exitCode: number; evidence: Record<string, string> } {
	const [executable, ...args] = command;
	if (!executable) {
		return { exitCode: 1, evidence: { error: "empty command" } };
	}
	const result = spawnSync(executable, args, {
		cwd,
		env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const evidence: Record<string, string> = {};
	if (result.stdout?.trim()) {
		evidence.stdout = result.stdout.trim().slice(0, 4000);
	}
	if (result.stderr?.trim()) {
		evidence.stderr = result.stderr.trim().slice(0, 4000);
	}
	return {
		exitCode: result.status ?? 1,
		evidence,
	};
}

function parseEvidenceJson(stdout: string | undefined): Record<string, string> {
	if (!stdout) {
		return {};
	}
	const lines = stdout.trim().split("\n");
	const lastLine = lines.at(-1) ?? "";
	try {
		const parsed = JSON.parse(lastLine) as Record<string, unknown>;
		const evidence: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string") {
				evidence[key] = value;
			} else if (value !== undefined && value !== null) {
				evidence[key] = JSON.stringify(value);
			}
		}
		return evidence;
	} catch {
		return { stdout: stdout.trim().slice(0, 4000) };
	}
}

function mergeArtifactEvidence(
	evidence: Record<string, string>,
): ComponentArtifact | undefined {
	const digest = evidence.component_digest ?? evidence.digest_sha256;
	const mediaType = evidence.media_type;
	const byteLengthRaw = evidence.byte_length;
	if (!digest || !mediaType || !byteLengthRaw) {
		return undefined;
	}
	const byteLength = Number.parseInt(byteLengthRaw, 10);
	if (!Number.isInteger(byteLength) || byteLength < 0) {
		return undefined;
	}
	return {
		digestSha256: digest,
		byteLength,
		mediaType,
	};
}

function mergeSignatureEvidence(
	evidence: Record<string, string>,
): SignatureEvidence | undefined {
	if (evidence.signature_verified !== "true") {
		return undefined;
	}
	return {
		verified: true,
		signerIdentity: evidence.signer_identity ?? "",
		provenanceTier: evidence.provenance_tier ?? "",
		conformanceReportDigest: evidence.conformance_report_digest ?? "",
	};
}

export async function runStageGate(
	definition: StageGateDefinition,
	opts: RunStageGateOptions = {},
): Promise<RunStageGateResult> {
	const cwd = opts.cwd ?? process.cwd();
	const startedAt = new Date().toISOString();
	const env: NodeJS.ProcessEnv = {
		...process.env,
		...opts.env,
	};
	const checkResults: CheckResult[] = [];
	let artifact: ComponentArtifact = {
		digestSha256: `sha256:${"0".repeat(64)}`,
		byteLength: 0,
		mediaType: "application/octet-stream",
	};
	let signature: SignatureEvidence = {
		verified: false,
		signerIdentity: "",
		provenanceTier: "",
		conformanceReportDigest: "",
	};
	let failed = false;

	for (const check of definition.checks) {
		const { exitCode, evidence: rawEvidence } = runCheck(
			check.command,
			cwd,
			env,
		);
		const evidence = parseEvidenceJson(rawEvidence.stdout ?? undefined);
		if (Object.keys(evidence).length === 0) {
			Object.assign(evidence, rawEvidence);
		}
		const status = exitCode === 0 ? "passed" : "failed";
		if (status === "failed") {
			failed = true;
		}
		checkResults.push({
			checkId: check.checkId,
			command: check.command,
			exitCode,
			status,
			evidence,
		});
		const artifactEvidence = mergeArtifactEvidence(evidence);
		if (artifactEvidence) {
			artifact = artifactEvidence;
		}
		const signatureEvidence = mergeSignatureEvidence(evidence);
		if (signatureEvidence) {
			signature = signatureEvidence;
		}
	}

	const finishedAt = new Date().toISOString();
	const status: RecordStatus = failed ? "failed" : "passed";
	const record: StageGateRecord = {
		gateId: definition.gateId,
		status,
		repoCommit: readRepoCommit(cwd),
		ciRunUrl: opts.ciRunUrl ?? process.env.GITHUB_RUN_URL ?? "",
		startedAt,
		finishedAt,
		checks: checkResults,
		artifact,
		signature,
	};

	if (opts.outFile) {
		await mkdir(dirname(opts.outFile), { recursive: true });
		await writeFile(
			opts.outFile,
			`${JSON.stringify(serializeStageGateRecord(record), null, 2)}\n`,
			"utf8",
		);
	}

	return {
		record,
		exitCode: failed ? 1 : 0,
	};
}
