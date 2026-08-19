/**
 * OpenFeature EvaluationContext enrichment from continuous identity + HoBo scope.
 * Zero application code required — harness injects this automatically.
 */
import type { FlagEvalContext } from "./feature-flag-store.js";

export type PrincipalRefLike = Readonly<{
	kind?: string;
	id: string;
	tenant?: string;
}>;

export type HoBoScopeAttributes = Readonly<{
	tenant?: string;
	project?: string;
	environment?: string;
	env?: string;
	camp?: string;
	yard?: string;
	junction?: string;
	station?: string;
	stack?: string;
	branch?: string;
	preview?: string;
	appTenant?: string;
	/** Continuous identity PrincipalRef. */
	principal?: PrincipalRefLike;
	/** Agent / workload identity id. */
	identityId?: string;
	/** Extra request attributes (no PII preferred). */
	request?: Readonly<Record<string, string>>;
}>;

/**
 * Build EvaluationContext from continuous identity + Camp/Yard/env attributes.
 * Sticky targeting defaults to principal id, then identity, then anonymous.
 */
export function enrichEvaluationContext(
	scope: HoBoScopeAttributes = {},
	overrides?: Partial<FlagEvalContext>,
): FlagEvalContext {
	const principalId =
		scope.principal?.id ??
		scope.identityId ??
		overrides?.targetingKey ??
		"anonymous";
	const tenant =
		scope.tenant ??
		scope.principal?.tenant ??
		scope.appTenant ??
		overrides?.tenant;

	const attributes: Record<string, string> = {
		"identity.userId": principalId,
		targetingKey: principalId,
		...(tenant !== undefined ? { tenant, "identity.tenant": tenant } : {}),
		...(scope.project !== undefined ? { project: scope.project } : {}),
		...(scope.environment !== undefined
			? { environment: scope.environment, env: scope.environment }
			: {}),
		...(scope.env !== undefined ? { env: scope.env } : {}),
		...(scope.camp !== undefined ? { camp: scope.camp } : {}),
		...(scope.yard !== undefined ? { yard: scope.yard } : {}),
		...(scope.junction !== undefined ? { junction: scope.junction } : {}),
		...(scope.station !== undefined ? { station: scope.station } : {}),
		...(scope.stack !== undefined ? { stack: scope.stack } : {}),
		...(scope.branch !== undefined ? { branch: scope.branch } : {}),
		...(scope.preview !== undefined ? { preview: scope.preview } : {}),
		...(scope.appTenant !== undefined ? { appTenant: scope.appTenant } : {}),
		...(scope.principal?.kind !== undefined
			? { "identity.kind": scope.principal.kind }
			: {}),
		...(scope.request ?? {}),
		...(overrides?.attributes ?? {}),
	};

	return Object.freeze({
		targetingKey: overrides?.targetingKey ?? principalId,
		...(tenant !== undefined ? { tenant } : {}),
		attributes: Object.freeze(attributes),
	});
}

/** Contract-asserted local-dev context (ADR-0070 / ADR-0042 fidelity). */
export function createDevEvaluationContext(input?: {
	readonly tenant?: string;
	readonly userId?: string;
	readonly env?: string;
}): FlagEvalContext {
	return enrichEvaluationContext({
		tenant: input?.tenant ?? "tenant-dev",
		principal: {
			kind: "user",
			id: input?.userId ?? "user:dev-fixture",
			tenant: input?.tenant ?? "tenant-dev",
		},
		environment: input?.env ?? "local-dev",
		env: input?.env ?? "local-dev",
		camp: "camp-local",
		yard: "yard-local",
	});
}
