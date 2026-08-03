import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { cleanupIsolation } from "./isolation.js";
import type { PromotionRequest, PromotionResult } from "./types.js";

/** Run git, capturing stdout; stderr is drained so a big diff cannot wedge us. */
function git(
	args: readonly string[],
	cwd: string,
): Promise<{
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}> {
	return new Promise((resolvePromise) => {
		const child = spawn("git", [...args], { cwd });
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (c: string) => {
			stdout += c;
		});
		child.stderr.on("data", (c: string) => {
			stderr += c;
		});
		child.on("error", (err) =>
			resolvePromise({ code: null, stdout, stderr: String(err) }),
		);
		child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
	});
}

/**
 * Carry the sandbox's work into the canonical tree as a working-tree change.
 *
 * Deliberately does **not** commit: promotion hands the user a reviewable diff
 * in their own tree, it does not rewrite their history behind their back. A
 * 3-way apply so it degrades to a normal conflict rather than a silent loss.
 */
export async function applySandboxDiff(
	isolationRoot: string,
	targetProject: string,
): Promise<{
	readonly ok: boolean;
	readonly files: number;
	readonly detail: string;
}> {
	// Include untracked files: a new file the agent wrote is the common case.
	const added = await git(["add", "-AN", "."], isolationRoot);
	if (added.code !== 0) {
		return {
			ok: false,
			files: 0,
			detail: `git add -N failed: ${added.stderr.trim()}`,
		};
	}
	const diff = await git(["diff", "--binary", "HEAD"], isolationRoot);
	if (diff.code !== 0) {
		return {
			ok: false,
			files: 0,
			detail: `git diff failed: ${diff.stderr.trim()}`,
		};
	}
	if (diff.stdout.trim().length === 0) {
		return { ok: false, files: 0, detail: "sandbox has no changes to promote" };
	}
	const names = await git(["diff", "--name-only", "HEAD"], isolationRoot);
	const files = names.stdout
		.split("\n")
		.filter((l) => l.trim().length > 0).length;

	// One apply, with git arbitrating: a `--check` pass reading the same patch
	// would need its own stdin write, and a forgotten one hangs forever.
	const applied = await new Promise<{ code: number | null; stderr: string }>(
		(resolvePromise) => {
			const child = spawn("git", ["apply", "--3way", "--index", "-"], {
				cwd: targetProject,
			});
			let stderr = "";
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (c: string) => {
				stderr += c;
			});
			child.on("error", (err) =>
				resolvePromise({ code: null, stderr: String(err) }),
			);
			child.on("close", (code) => resolvePromise({ code, stderr }));
			child.stdin.write(diff.stdout);
			child.stdin.end();
		},
	);
	if (applied.code !== 0) {
		return {
			ok: false,
			files,
			detail: `git apply failed: ${applied.stderr.trim() || "conflict"}`,
		};
	}
	return { ok: true, files, detail: `${files} file(s) staged in the project` };
}

export interface PromotionGate {
	readonly name: string;
	readonly pass: boolean;
	readonly detail: string;
}

export interface PromoteOptions {
	readonly hoboHome: string;
	/** Gate suite results; promotion fails closed if any required gate fails. */
	readonly gates: readonly PromotionGate[];
	/** Whether agent may write canonical project (must be false). */
	readonly agentMayWriteCanonical?: boolean;
}

const REQUIRED_GATES = [
	"architecture:guard",
	"standards:check",
	"agent:check",
	"docs:freshness",
] as const;

/**
 * Promotion is the sole audited mutation path into the real project tree.
 * Agents never receive unrestricted write access to the canonical tree.
 */
export function assertMediatedOnly(agentMayWriteCanonical: boolean): void {
	if (agentMayWriteCanonical) {
		throw new Error(
			"sandbox purity violated: agents must not freely write the canonical project tree",
		);
	}
}

export function runPromotionGates(gates: readonly PromotionGate[]): {
	ok: boolean;
	failed: readonly PromotionGate[];
} {
	const byName = new Map(gates.map((g) => [g.name, g]));
	const failed: PromotionGate[] = [];
	for (const required of REQUIRED_GATES) {
		const gate = byName.get(required);
		if (!gate || !gate.pass) {
			failed.push(
				gate ?? {
					name: required,
					pass: false,
					detail: "missing required gate result",
				},
			);
		}
	}
	for (const gate of gates) {
		if (!gate.pass && !failed.some((f) => f.name === gate.name)) {
			failed.push(gate);
		}
	}
	return { ok: failed.length === 0, failed };
}

/**
 * Explicit promotion: gates must pass, squash-only, then mandatory cleanup.
 */
export async function promoteIsolation(
	request: PromotionRequest,
	options: PromoteOptions,
): Promise<PromotionResult> {
	assertMediatedOnly(options.agentMayWriteCanonical === true ? true : false);

	if (request.squashOnly !== true) {
		return {
			ok: false,
			code: "HOBO_CODE_PROMOTE_REFUSED",
			message: "exclusive squash-merge is the only merge path",
			cleaned: false,
		};
	}

	// Fail closed when there is nothing to promote (missing sandbox isolation).
	if (!existsSync(resolve(request.isolationRoot))) {
		return {
			ok: false,
			code: "HOBO_CODE_PROMOTE_MISSING_RUN",
			message: `no isolation sandbox for run "${request.runId}" under ${request.isolationRoot}`,
			cleaned: false,
		};
	}

	const gateCheck = runPromotionGates(options.gates);
	if (!gateCheck.ok) {
		return {
			ok: false,
			code: "HOBO_CODE_PROMOTE_GATES_FAILED",
			message: `promotion refused: ${gateCheck.failed.map((g) => g.name).join(", ")}`,
			cleaned: false,
		};
	}

	// Carry the work across FIRST. Cleanup destroys the sandbox worktree and
	// force-deletes its branch, so it must never run before the changes are
	// safely in the canonical tree — otherwise "promote" means "delete".
	const applied = await applySandboxDiff(
		resolve(request.isolationRoot),
		resolve(request.targetProject),
	);
	if (!applied.ok) {
		return {
			ok: false,
			code:
				applied.files === 0
					? "HOBO_CODE_PROMOTE_NOTHING_TO_APPLY"
					: "HOBO_CODE_PROMOTE_APPLY_FAILED",
			message: `${applied.detail} — sandbox kept at ${request.isolationRoot}`,
			cleaned: false,
		};
	}

	const auditDir = join(
		options.hoboHome,
		"durable",
		"code",
		request.runId,
		"promotions",
	);
	mkdirSync(auditDir, { recursive: true });
	const auditPath = join(auditDir, `promote-${Date.now()}.json`);
	writeFileSync(
		auditPath,
		JSON.stringify(
			{
				request,
				gates: options.gates,
				targetProject: resolve(request.targetProject),
				isolationRoot: resolve(request.isolationRoot),
				squashOnly: true,
				appliedFiles: applied.files,
			},
			null,
			2,
		),
		"utf8",
	);

	// Only now is it safe to reclaim the sandbox: the diff is in the project.
	const cleanup = await cleanupIsolation(request.runId, {
		hoboHome: options.hoboHome,
		ok: true,
		gates: options.gates.map((g) => `${g.name}:${g.pass ? "pass" : "fail"}`),
	});

	return {
		ok: true,
		code: "HOBO_CODE_PROMOTED",
		message: `promoted ${request.runId}: ${applied.detail}; changes are staged for your review (not committed)`,
		mergedBranch: `code/${request.runId}`,
		cleaned: cleanup.orphans.length === 0,
	};
}

/** Out-of-box token tools must never be vendored into the project workspace. */
export const EXTERNAL_TOKEN_TOOLS = [
	"caveman",
	"ponytail",
	"rtk",
	"tgrep",
	"mgrep",
	"headroom",
	"serena",
] as const;

export function assertNoVendoredTokenTools(projectRoot: string): {
	ok: boolean;
	found: readonly string[];
} {
	const found: string[] = [];
	for (const tool of EXTERNAL_TOKEN_TOOLS) {
		const candidates = [
			join(projectRoot, "node_modules", tool),
			join(projectRoot, "vendor", tool),
			join(projectRoot, ".vendor", tool),
		];
		if (candidates.some((p) => existsSync(p))) found.push(tool);
	}
	return { ok: found.length === 0, found };
}
