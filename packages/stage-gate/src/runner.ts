import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

export function resolveCommandExecutable(
	executable: string,
	platform: NodeJS.Platform = process.platform,
	cwd = process.cwd(),
): string {
	if (platform === "win32" && executable === "pnpm") {
		const localPnpm = join(cwd, "node_modules", ".bin", "pnpm.cmd");
		if (existsSync(localPnpm)) {
			return localPnpm;
		}
		return "pnpm.cmd";
	}
	return executable;
}

export function shouldUseCommandShell(
	executable: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	return platform === "win32" && /\.(?:bat|cmd)$/i.test(executable);
}

function quoteWindowsShellArg(value: string): string {
	return `"${value.replaceAll('"', '\\"')}"`;
}

export function createCommandInvocation(
	executable: string,
	args: readonly string[],
	platform: NodeJS.Platform = process.platform,
	comspec = process.env.ComSpec ?? "cmd.exe",
	cwd = process.cwd(),
): { executable: string; args: string[]; windowsVerbatimArguments?: boolean } {
	const resolvedExecutable = resolveCommandExecutable(executable, platform, cwd);
	if (!shouldUseCommandShell(resolvedExecutable, platform)) {
		return { executable: resolvedExecutable, args: [...args] };
	}
	const commandText = [
		quoteWindowsShellArg(resolvedExecutable),
		...args.map(quoteWindowsShellArg),
	].join(" ");
	return {
		executable: comspec,
		args: ["/d", "/s", "/c", `"${commandText}"`],
		windowsVerbatimArguments: true,
	};
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
	const invocation = createCommandInvocation(executable, args, process.platform, process.env.ComSpec ?? "cmd.exe", cwd);
	const result = spawnSync(invocation.executable, invocation.args, {
		cwd,
		env,
		encoding: "utf8",
		windowsVerbatimArguments: invocation.windowsVerbatimArguments,
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 16 * 1024 * 1024,
	});
	const failed = (result.status ?? 1) !== 0;
	const evidence: Record<string, string> = {};
	if (result.error) {
		evidence.error = `${result.error.name}: ${result.error.message}`;
	}
	if (result.stdout?.trim()) {
		const stdout = result.stdout.trim();
		evidence.stdout = stdout.length <= 4000 || !failed ? stdout.slice(0, 4000) : stdout.slice(-4000);
	}
	if (result.stderr?.trim()) {
		const stderr = result.stderr.trim();
		evidence.stderr = stderr.length <= 4000 || !failed ? stderr.slice(0, 4000) : stderr.slice(-4000);
	}
	if (failed) {
		console.error(
			`[stage-gate] check failed: ${command.join(" ")} (exit ${result.status ?? 1})`,
		);
		if (evidence.stderr) {
			console.error(evidence.stderr);
		}
		if (evidence.stdout) {
			console.error(evidence.stdout);
		}
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

	const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
	const reproducibleKinds = new Set(["build", "sign", "verify"]);

	for (const check of definition.checks) {
		const checkEnv =
			sourceDateEpoch && reproducibleKinds.has(check.kind)
				? { ...env, SOURCE_DATE_EPOCH: sourceDateEpoch }
				: (() => {
						const { SOURCE_DATE_EPOCH: _omit, ...rest } = env;
						return rest;
					})();
		const { exitCode, evidence: rawEvidence } = runCheck(
			check.command,
			cwd,
			checkEnv,
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
