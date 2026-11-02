import { z } from "zod";
import type { GithubRun } from "./github.js";
import {
	type CiProjectConfig,
	type CiProjectEnvironment,
	parseCiProjectConfig,
	selectCiEnvironment,
} from "./project-config.js";

export const DEFAULT_CI_PROJECT_PATH = ".hobo/ci.json";
export const CI_PROJECT_LOCAL_OVERRIDE_PATH = ".hobo/ci.local.json";

const environmentName = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const SelectionMatch = z
	.object({
		refPrefix: z.string().min(1).max(200).optional(),
		branch: z.string().min(1).max(255).optional(),
		events: z.array(z.string().min(1).max(100)).max(16).optional(),
	})
	.strict();
const SelectionRule = z
	.object({
		environment: z.string().regex(environmentName),
		match: SelectionMatch.optional(),
	})
	.strict();
export const CiProjectSelectionSchema = z
	.object({
		rules: z.array(SelectionRule).max(32).optional(),
		forkPullRequestEnvironment: z.string().regex(environmentName).optional(),
	})
	.strict()
	.optional();

export type CiJobAdmission = "push" | "pull";

export interface CiWebhookRoutingContext {
	readonly repositoryFullName: string;
	readonly repositoryId: number;
	readonly installationId: number;
	readonly workflowRunId: number;
	readonly eventName: string;
	readonly headBranch: string | undefined;
	readonly headRef: string | undefined;
	readonly isForkPullRequest: boolean;
	readonly configRef: string;
}

export interface ResolvedCiRelayRoute {
	readonly environment: CiProjectEnvironment;
	readonly relayOrigin: string;
	readonly admission: CiJobAdmission;
	readonly configRef: string;
	readonly isForkPullRequest: boolean;
}

export function parseCiProjectSelection(document: unknown): z.infer<
	typeof CiProjectSelectionSchema
> {
	return CiProjectSelectionSchema.parse(
		document &&
			typeof document === "object" &&
			Object.hasOwn(document, "selection")
			? (document as { selection: unknown }).selection
			: undefined,
	);
}

function mergeJsonObjects(base: unknown, override: unknown): unknown {
	const baseObject =
		base && typeof base === "object" && !Array.isArray(base) ? base : {};
	const overrideObject =
		override && typeof override === "object" && !Array.isArray(override)
			? override
			: {};
	const merged: Record<string, unknown> = { ...baseObject };
	for (const [key, value] of Object.entries(overrideObject)) {
		const inherited = merged[key];
		if (
			inherited &&
			typeof inherited === "object" &&
			!Array.isArray(inherited) &&
			value &&
			typeof value === "object" &&
			!Array.isArray(value)
		)
			merged[key] = mergeJsonObjects(inherited, value);
		else merged[key] = value;
	}
	return merged;
}

/** Merge a gitignored local overlay onto committed project JSON (environments only). */
export function mergeCiProjectLocalOverlay(
	committedJson: string,
	localJson: string,
): string {
	const committed = JSON.parse(committedJson) as Record<string, unknown>;
	const local = JSON.parse(localJson) as Record<string, unknown>;
	const mergedEnvironments = mergeJsonObjects(
		committed.environments,
		local.environments,
	);
	const mergedTemplates = mergeJsonObjects(
		committed.templates,
		local.templates,
	);
	return JSON.stringify({
		...committed,
		...local,
		...(Object.keys(mergedTemplates as object).length
			? { templates: mergedTemplates }
			: {}),
		...(Object.keys(mergedEnvironments as object).length
			? { environments: mergedEnvironments }
			: {}),
	});
}

export function loadCiProjectConfigDocument(
	committedJson: string,
	localJson?: string,
	organization?: CiProjectConfig,
): CiProjectConfig {
	const merged = localJson
		? mergeCiProjectLocalOverlay(committedJson, localJson)
		: committedJson;
	return parseCiProjectConfig(merged, organization);
}

export function resolveExplicitCiEnvironmentName(
	config: CiProjectConfig,
	explicit: string | undefined,
	fallbackEnv?: NodeJS.ProcessEnv,
): string {
	const fromEnv = fallbackEnv?.HOBO_CI_ENVIRONMENT?.trim();
	const chosen = explicit ?? fromEnv ?? config.defaultEnvironment;
	if (!environmentName.test(chosen) || !Object.hasOwn(config.environments, chosen))
		throw new Error("unknown CI environment");
	return chosen;
}

export function isForkPullRequestRun(
	run: GithubRun,
	baseRepositoryId: number,
): boolean {
	return (
		run.event === "pull_request" &&
		run.head_repository !== null &&
		run.head_repository.id !== baseRepositoryId
	);
}

/** Config ref is a branch name or 40-char commit SHA for GitHub contents API. */
export function resolveCiConfigRefForRun(
	run: GithubRun,
	baseRepositoryId: number,
): string {
	if (isForkPullRequestRun(run, baseRepositoryId)) {
		const baseRef = run.pull_requests?.[0]?.base.ref;
		if (!baseRef) throw new Error("fork pull request missing base ref");
		return baseRef;
	}
	if (!/^[0-9a-f]{40}$/i.test(run.head_sha))
		throw new Error("workflow run missing head sha");
	return run.head_sha.toLowerCase();
}

export function inferJobAdmission(
	environment: CiProjectEnvironment,
	declared?: CiJobAdmission,
): CiJobAdmission {
	if (declared === "push" || declared === "pull") return declared;
	if (environment.allowInsecureLoopback) {
		try {
			const host = new URL(environment.relayOrigin).hostname;
			if (host === "127.0.0.1" || host === "localhost") return "pull";
		} catch {
			/* fall through */
		}
	}
	return "push";
}

function ruleMatches(
	rule: z.infer<typeof SelectionRule>,
	context: CiWebhookRoutingContext,
): boolean {
	const match = rule.match;
	if (!match) return true;
	if (
		match.events &&
		!match.events.some(
			(event) => event.toLowerCase() === context.eventName.toLowerCase(),
		)
	)
		return false;
	const ref =
		context.headRef ??
		(context.headBranch ? `refs/heads/${context.headBranch}` : undefined);
	if (match.refPrefix && (!ref || !ref.startsWith(match.refPrefix))) return false;
	if (match.branch) {
		const branch = ref?.startsWith("refs/heads/")
			? ref.slice("refs/heads/".length)
			: context.headBranch;
		if (branch !== match.branch) return false;
	}
	return true;
}

export function selectEnvironmentForWebhook(
	config: CiProjectConfig,
	selection: z.infer<typeof CiProjectSelectionSchema>,
	context: CiWebhookRoutingContext,
): CiProjectEnvironment {
	if (
		context.isForkPullRequest &&
		selection?.forkPullRequestEnvironment &&
		Object.hasOwn(config.environments, selection.forkPullRequestEnvironment)
	)
		return selectCiEnvironment(config, selection.forkPullRequestEnvironment);
	for (const rule of selection?.rules ?? []) {
		if (!Object.hasOwn(config.environments, rule.environment)) continue;
		if (ruleMatches(rule, context))
			return selectCiEnvironment(config, rule.environment);
	}
	return selectCiEnvironment(config);
}

export function resolveCiRelayRoute(options: {
	config: CiProjectConfig;
	selection: z.infer<typeof CiProjectSelectionSchema>;
	context: CiWebhookRoutingContext;
	jobAdmission?: CiJobAdmission;
}): ResolvedCiRelayRoute {
	const environment = selectEnvironmentForWebhook(
		options.config,
		options.selection,
		options.context,
	);
	const admission = inferJobAdmission(environment, options.jobAdmission);
	return Object.freeze({
		environment,
		relayOrigin: environment.relayOrigin,
		admission,
		configRef: options.context.configRef,
		isForkPullRequest: options.context.isForkPullRequest,
	});
}

/** Only forward to origins declared in the resolved project config document. */
export function assertRelayOriginAllowed(
	route: ResolvedCiRelayRoute,
	config: CiProjectConfig,
): void {
	const allowed = new Set(
		Object.values(config.environments).map((entry) => entry.relayOrigin),
	);
	if (!allowed.has(route.relayOrigin)) throw new Error("relay origin not allowed");
}
