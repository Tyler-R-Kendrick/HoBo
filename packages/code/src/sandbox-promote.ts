import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { cleanupIsolation } from "./isolation.js";
import type { PromotionRequest, PromotionResult } from "./types.js";

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
export function promoteIsolation(
	request: PromotionRequest,
	options: PromoteOptions,
): PromotionResult {
	assertMediatedOnly(options.agentMayWriteCanonical === true ? true : false);

	if (request.squashOnly !== true) {
		return {
			ok: false,
			code: "HOBO_CODE_PROMOTE_REFUSED",
			message: "exclusive squash-merge is the only merge path",
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
			},
			null,
			2,
		),
		"utf8",
	);

	// Cleanup ephemeral isolation after audited promote record is durable.
	const cleanup = cleanupIsolation(request.runId, {
		hoboHome: options.hoboHome,
		ok: true,
		gates: options.gates.map((g) => `${g.name}:${g.pass ? "pass" : "fail"}`),
	});

	return {
		ok: true,
		code: "HOBO_CODE_PROMOTED",
		message: `promoted ${request.runId} via squash-only path; isolation cleaned`,
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
