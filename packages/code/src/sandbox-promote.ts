import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
	evaluateOpenUiPromotion,
	type OpenUiPromotionInput,
	type OpenUiTree,
} from "@hobo/formal-interop";

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
	/**
	 * OpenUI semantic BEq gate input. When provided (or when
	 * `openUiArtifact` is true), promotion fails closed unless BEq passes.
	 * Semantic gate is default-on for OpenUI artifacts.
	 */
	readonly openUi?: {
		readonly enabled?: boolean;
		readonly generated?: OpenUiTree;
		readonly goldOrIntent?: OpenUiTree;
		readonly candidateId?: string;
	};
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

export function runPromotionGates(
	gates: readonly PromotionGate[],
): { ok: boolean; failed: readonly PromotionGate[] } {
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

	// OpenUI semantic BEq: default-on when openUi options present.
	if (options.openUi !== undefined) {
		const openUiInput: OpenUiPromotionInput = {
			candidateId: options.openUi.candidateId ?? request.runId,
			artifactKind: "openui",
			semanticGateEnabled: options.openUi.enabled ?? true,
			conformance: true,
			policy: true,
			...(options.openUi.generated !== undefined
				? { generated: options.openUi.generated }
				: {}),
			...(options.openUi.goldOrIntent !== undefined
				? { goldOrIntent: options.openUi.goldOrIntent }
				: {}),
		};
		const semanticGate = openUiSemanticPromotionGate(openUiInput);
		if (!semanticGate.pass) {
			return {
				ok: false,
				code: "HOBO_CODE_PROMOTE_SEMANTIC_BEQ_FAILED",
				message: `promotion refused: ${semanticGate.detail}`,
				cleaned: false,
			};
		}
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

/**
 * Build a PromotionGate from the formal-interop OpenUI semantic BEq entry point.
 * Default-on for OpenUI artifacts (fail closed on meaning-zero / hierarchy breaks).
 */
export function openUiSemanticPromotionGate(
	input: OpenUiPromotionInput,
): PromotionGate {
	const decision = evaluateOpenUiPromotion(input);
	return {
		name: "openui:semantic-beq",
		pass: decision.ok,
		detail: decision.ok
			? "OpenUI semantic BEq passed"
			: decision.failures.join("; "),
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
