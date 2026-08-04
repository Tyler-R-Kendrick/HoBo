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
		// stdout is captured; stderr drained so a chatty git cannot wedge us.
		const child = spawn("git", [...args], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
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
	/** True when the project tree may have been partially modified. */
	readonly dirtied: boolean;
}> {
	// Include untracked files: a new file the agent wrote is the common case.
	const added = await git(["add", "-AN", "."], isolationRoot);
	if (added.code !== 0) {
		return {
			ok: false,
			files: 0,
			detail: `sandbox is not a usable git worktree: ${added.stderr.trim()}`,
			dirtied: false,
		};
	}
	const diff = await git(["diff", "--binary", "HEAD"], isolationRoot);
	if (diff.code !== 0) {
		return {
			ok: false,
			files: 0,
			detail: `git diff failed: ${diff.stderr.trim()}`,
			dirtied: false,
		};
	}
	if (diff.stdout.trim().length === 0) {
		return {
			ok: false,
			files: 0,
			detail: "sandbox has no changes to promote",
			dirtied: false,
		};
	}
	const names = await git(["diff", "--name-only", "HEAD"], isolationRoot);
	const files = names.stdout
		.split("\n")
		.filter((l) => l.trim().length > 0).length;

	/** Feed a patch to a git command on stdin and report how it went. */
	const applyPatch = (
		args: readonly string[],
	): Promise<{ code: number | null; stderr: string }> =>
		new Promise((resolvePromise) => {
			const child = spawn("git", [...args], {
				cwd: targetProject,
				stdio: ["pipe", "ignore", "pipe"],
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
			child.stdin.on("error", () => {
				/* git may close stdin early on a bad patch; the exit code tells us */
			});
			child.stdin.write(diff.stdout);
			child.stdin.end();
		});

	// Precondition: `git apply --3way` is NOT atomic — it can apply some files
	// cleanly, leave conflict markers in others, and exit non-zero, so a
	// "failed" promotion could still wreck the tree. `--check` is too lenient
	// to catch that, so refuse up front when the patch touches a file the user
	// has locally modified. Predictable refusal beats a half-applied surprise.
	// `-uall` so untracked directories do not collapse and hide a collision.
	const targetStatus = await git(
		["status", "--porcelain", "-uall"],
		targetProject,
	);
	if (targetStatus.code === 0) {
		const dirty = new Set(
			targetStatus.stdout
				.split("\n")
				.filter((l) => l.trim().length > 0)
				.map((l) => l.slice(3).trim())
				.flatMap((l) => (l.includes(" -> ") ? l.split(" -> ") : [l]))
				.map((l) => l.trim()),
		);
		const patched = names.stdout
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		const collisions = patched.filter((f) => dirty.has(f));
		if (collisions.length > 0) {
			return {
				ok: false,
				files,
				detail: `these files have uncommitted local changes and would collide: ${collisions.slice(0, 5).join(", ")}${collisions.length > 5 ? ` (+${collisions.length - 5} more)` : ""} — commit or stash them, then promote again`,
				dirtied: false,
			};
		}
	}

	const check = await applyPatch(["apply", "--3way", "--check", "-"]);
	if (check.code !== 0) {
		return {
			ok: false,
			files,
			detail: `patch does not apply cleanly to the project: ${check.stderr.trim() || "conflict"}`,
			dirtied: false,
		};
	}

	const applied = await applyPatch(["apply", "--3way", "--index", "-"]);
	if (applied.code !== 0) {
		// Preflight passed but the apply still failed — the tree may now be
		// partially modified. Say so plainly rather than implying nothing moved.
		return {
			ok: false,
			files,
			detail: `apply failed after passing preflight: ${applied.stderr.trim() || "conflict"}`,
			dirtied: true,
		};
	}
	return {
		ok: true,
		files,
		detail: `${files} file(s) staged in the project`,
		dirtied: false,
	};
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
		const nothing = applied.detail === "sandbox has no changes to promote";
		return {
			ok: false,
			code: nothing
				? "HOBO_CODE_PROMOTE_NOTHING_TO_APPLY"
				: "HOBO_CODE_PROMOTE_APPLY_FAILED",
			message: applied.dirtied
				? `${applied.detail} — the project tree was PARTIALLY MODIFIED; inspect \`git status\` and reset before retrying. Sandbox kept at ${request.isolationRoot}`
				: `${applied.detail} — nothing was changed in the project; sandbox kept at ${request.isolationRoot}`,
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
