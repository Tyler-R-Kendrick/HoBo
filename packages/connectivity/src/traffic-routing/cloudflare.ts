import {
	type ApplyResult,
	createTrafficRoutingMeteringEvent,
	type MeteringBus,
	parseApplyResult,
	parseRevokeResult,
	parseRoutingStatus,
	type RoutingPlan,
	type RoutingPlanId,
	type RoutingRule,
	type TrafficRoutingCapability,
	type TrafficRoutingPort,
} from "@hobo/core";

export interface CloudflareTrafficRouting extends TrafficRoutingPort {
	readonly provider: "cloudflare";
	readonly revoke: NonNullable<TrafficRoutingPort["revoke"]>;
}

export interface CloudflareTrafficRoutingOptions {
	/** API token with Load Balancing edit permission. Never logged or metered. */
	readonly apiToken?: string;
	readonly zoneId: string;
	/** Existing Cloudflare pool IDs keyed by HoBo backend ID. */
	readonly poolIdsByBackend?: Readonly<Record<string, string>>;
	/** Existing Cloudflare load-balancer IDs keyed by HoBo plan ID. */
	readonly loadBalancerIdsByPlan?: Readonly<Record<string, string>>;
	/** True only when every mapped pool has an independently configured monitor. */
	readonly healthChecksConfigured?: boolean;
	readonly apiBase?: string;
	readonly fetchImpl?: typeof fetch;
	readonly metering?: MeteringBus;
}

interface AppliedPlan {
	readonly externalId: string;
	readonly plan: RoutingPlan;
	readonly fingerprint: string;
	readonly expected: ReturnType<typeof cloudflareLoadBalancer>;
	readonly result: ApplyResult;
	revoked: boolean;
}

export function createCloudflareTrafficRouting(
	options: CloudflareTrafficRoutingOptions,
): CloudflareTrafficRouting {
	const token = options.apiToken?.trim();
	const base = (
		options.apiBase ?? "https://api.cloudflare.com/client/v4"
	).replace(/\/+$/u, "");
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const applied = new Map<RoutingPlanId, AppliedPlan>();

	async function request(path: string, init?: RequestInit) {
		if (!token || !fetchImpl) return { ok: false, status: 0, body: null };
		try {
			const response = await fetchImpl(`${base}${path}`, {
				...init,
				headers: {
					accept: "application/json",
					authorization: `Bearer ${token}`,
					...(init?.body === undefined
						? {}
						: { "content-type": "application/json" }),
					...headersObject(init?.headers),
				},
			});
			return {
				ok: response.ok,
				status: response.status,
				body: (await response.json().catch(() => null)) as unknown,
			};
		} catch {
			return { ok: false, status: 0, body: null };
		}
	}

	return {
		provider: "cloudflare",
		async apply(plan) {
			if (!token) {
				const result = resultFor(
					plan,
					"none",
					0,
					["credentials"],
					["Cloudflare API token is required"],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}
			if (!isDnsHostname(plan.intent.service)) {
				const result = resultFor(
					plan,
					"none",
					0,
					["service-hostname"],
					["Cloudflare load balancers require a DNS hostname"],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}
			const fingerprint = JSON.stringify(plan);
			const previous = applied.get(plan.planId);
			if (
				previous &&
				!previous.revoked &&
				previous.fingerprint !== fingerprint
			) {
				const result = resultFor(
					plan,
					"none",
					0,
					["plan-id-conflict"],
					["planId is already active with different routing content"],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}

			const { rule, unmet } = supportedRule(
				plan,
				options.healthChecksConfigured === true,
			);
			if (!rule) {
				const result = resultFor(plan, "none", 0, unmet, [
					"Cloudflare cannot safely realize the declared routing matches",
				]);
				await meter(options.metering, plan, "deny");
				return result;
			}
			const poolMapping = resolvePoolIds(rule, options.poolIdsByBackend);
			if (poolMapping.missing.length > 0 || poolMapping.duplicates.length > 0) {
				const result = resultFor(
					plan,
					"none",
					0,
					[...unmet, ...poolMapping.missing, ...poolMapping.duplicates],
					["Cloudflare pool mappings are required for every routing backend"],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}
			const externalId = options.loadBalancerIdsByPlan?.[plan.planId]?.trim();
			if (!externalId) {
				const result = resultFor(
					plan,
					"none",
					0,
					[`load-balancer:${plan.planId}`],
					["an existing Cloudflare load-balancer mapping is required"],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}

			const expected = cloudflareLoadBalancer(plan, rule, poolMapping.poolIds);
			const response = await request(
				`/zones/${encodeURIComponent(options.zoneId)}/load_balancers/${encodeURIComponent(externalId)}`,
				{
					method: "PUT",
					body: JSON.stringify(expected),
				},
			);
			if (!response.ok || !cloudflareSuccess(response.body)) {
				const result = resultFor(
					plan,
					"none",
					0,
					["provider-api"],
					[providerFailure("apply", response.status)],
				);
				await meter(options.metering, plan, "deny");
				return result;
			}

			const realized = unmet.length === 0 ? "full" : "partial";
			const result = resultFor(
				plan,
				realized,
				1,
				unmet,
				realized === "full"
					? []
					: ["Cloudflare applied the provider-safe subset of the routing plan"],
				capabilitiesFor(rule, options.healthChecksConfigured === true),
			);
			applied.set(plan.planId, {
				externalId,
				plan,
				fingerprint,
				expected,
				result,
				revoked: false,
			});
			await meter(
				options.metering,
				plan,
				realized === "full" ? "apply" : "degraded",
			);
			return result;
		},
		async status(planId) {
			const current = applied.get(planId);
			if (!current) return null;
			if (current.revoked) {
				return parseRoutingStatus({
					planId,
					active: false,
					realized: "none",
					notes: ["routing plan revoked"],
				});
			}
			const response = await request(
				`/zones/${encodeURIComponent(options.zoneId)}/load_balancers/${encodeURIComponent(current.externalId)}`,
			);
			if (!response.ok || !cloudflareSuccess(response.body)) {
				return parseRoutingStatus({
					planId,
					active: false,
					realized: "partial",
					notes: [providerFailure("status", response.status)],
				});
			}
			const active = cloudflareEnabled(response.body);
			const matches =
				active && cloudflareObservedMatches(response.body, current.expected);
			return parseRoutingStatus({
				planId,
				active,
				realized: !active
					? "none"
					: matches
						? current.result.realized
						: "partial",
				notes: !active
					? ["Cloudflare route is disabled"]
					: matches
						? current.result.notes
						: ["Cloudflare observed configuration does not match the plan"],
			});
		},
		async revoke(planId) {
			if (!token) {
				return parseRevokeResult({
					ok: false,
					notes: ["Cloudflare API token is required"],
				});
			}
			const current = applied.get(planId);
			if (!current) {
				return parseRevokeResult({
					ok: false,
					notes: ["routing plan not found"],
				});
			}
			if (current.revoked) return parseRevokeResult({ ok: true, notes: [] });
			const response = await request(
				`/zones/${encodeURIComponent(options.zoneId)}/load_balancers/${encodeURIComponent(current.externalId)}`,
				{ method: "DELETE" },
			);
			if (!response.ok || !cloudflareSuccess(response.body)) {
				return parseRevokeResult({
					ok: false,
					notes: [providerFailure("revoke", response.status)],
				});
			}
			current.revoked = true;
			return parseRevokeResult({ ok: true, notes: [] });
		},
	};
}

function supportedRule(
	plan: RoutingPlan,
	healthChecksConfigured: boolean,
): {
	readonly rule: RoutingRule | null;
	readonly unmet: string[];
} {
	const supported = plan.intent.rules.filter(
		(rule) => !hasEffectiveMatch(rule),
	);
	const unmet: string[] = [];
	for (const [index, rule] of plan.intent.rules.entries()) {
		if (rule.match?.pathPrefix) unmet.push(`rules[${index}].path-prefix`);
		if (rule.match?.headers) unmet.push(`rules[${index}].header-match`);
		if (rule.weightStrategy === "locality") {
			unmet.push("weightStrategy:locality");
		}
		if (rule.weightStrategy === "prefer-healthy" && !healthChecksConfigured) {
			unmet.push("health-monitoring");
		}
	}
	if (supported.length > 1) unmet.push("multiple-rules");
	if (plan.intent.availability) unmet.push("availability-constraints");
	if (plan.intent.resiliency) unmet.push("resiliency");
	return { rule: supported[0] ?? null, unmet: [...new Set(unmet)] };
}

function capabilitiesFor(
	rule: RoutingRule,
	healthChecksConfigured: boolean,
): TrafficRoutingCapability[] {
	return rule.weightStrategy === "prefer-healthy" && healthChecksConfigured
		? ["weighted-backends", "health-aware"]
		: ["weighted-backends"];
}

function cloudflareLoadBalancer(
	plan: RoutingPlan,
	rule: RoutingRule,
	poolIds: readonly string[],
) {
	const weights = normalizedWeights(rule);
	const poolWeights = Object.fromEntries(
		poolIds.map((poolId, index) => [poolId, weights[index]]),
	);
	return {
		name: plan.intent.service,
		default_pools: poolIds,
		fallback_pool: poolIds[0],
		steering_policy: "random",
		enabled: true,
		random_steering: { pool_weights: poolWeights },
	};
}

function resolvePoolIds(
	rule: RoutingRule,
	poolIdsByBackend: Readonly<Record<string, string>> | undefined,
): {
	readonly poolIds: string[];
	readonly missing: string[];
	readonly duplicates: string[];
} {
	const poolIds: string[] = [];
	const missing: string[] = [];
	for (const backend of rule.backends) {
		const poolId = poolIdsByBackend?.[backend.id]?.trim();
		if (poolId) poolIds.push(poolId);
		else missing.push(`pool:${backend.id}`);
	}
	const duplicates = poolIds
		.filter((poolId, index) => poolIds.indexOf(poolId) !== index)
		.map((poolId) => `duplicate-pool:${poolId}`);
	return { poolIds, missing, duplicates: [...new Set(duplicates)] };
}

function normalizedWeights(rule: RoutingRule): number[] {
	const weights = rule.backends.map(({ weight }) => weight ?? 1);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	if (total === 0) return weights.map(() => 1 / weights.length);
	return weights.map((weight) => weight / total);
}

function hasEffectiveMatch(rule: RoutingRule): boolean {
	return Boolean(
		rule.match?.pathPrefix ||
			(rule.match?.headers && Object.keys(rule.match.headers).length > 0),
	);
}

function resultFor(
	plan: RoutingPlan,
	realized: "full" | "partial" | "none",
	appliedRules: number,
	unmet: readonly string[],
	notes: readonly string[],
	capabilities: readonly TrafficRoutingCapability[] = [],
) {
	return parseApplyResult({
		planId: plan.planId,
		provider: "cloudflare",
		realized,
		notes,
		appliedRules,
		...(unmet.length === 0 ? {} : { unmet: [...new Set(unmet)] }),
		capabilities,
	});
}

async function meter(
	metering: MeteringBus | undefined,
	plan: RoutingPlan,
	outcome: "apply" | "degraded" | "deny",
) {
	try {
		await metering?.emit(
			createTrafficRoutingMeteringEvent({
				tenantId: plan.intent.tenantId,
				planId: plan.planId,
				provider: "cloudflare",
				outcome,
			}),
		);
	} catch {
		// Provider realization remains authoritative when observation delivery fails.
	}
}

function cloudflareEnabled(body: unknown): boolean {
	if (!cloudflareSuccess(body)) return false;
	const result = (body as { result?: unknown }).result;
	return (
		result !== null &&
		typeof result === "object" &&
		(result as { enabled?: unknown }).enabled === true
	);
}

function cloudflareSuccess(body: unknown): body is { result?: unknown } {
	return (
		body !== null &&
		typeof body === "object" &&
		(body as { success?: unknown }).success === true
	);
}

function cloudflareObservedMatches(
	body: unknown,
	expected: ReturnType<typeof cloudflareLoadBalancer>,
): boolean {
	if (!cloudflareSuccess(body)) return false;
	const result = body.result;
	if (!result || typeof result !== "object") return false;
	const observed = result as Record<string, unknown>;
	const randomSteering = observed.random_steering;
	if (!randomSteering || typeof randomSteering !== "object") return false;
	const poolWeights = (randomSteering as Record<string, unknown>).pool_weights;
	return (
		observed.name === expected.name &&
		observed.steering_policy === expected.steering_policy &&
		sameStringArray(observed.default_pools, expected.default_pools) &&
		observed.fallback_pool === expected.fallback_pool &&
		sameNumberRecord(poolWeights, expected.random_steering.pool_weights)
	);
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
	return (
		Array.isArray(value) &&
		value.length === expected.length &&
		value.every((entry, index) => entry === expected[index])
	);
}

function sameNumberRecord(
	value: unknown,
	expected: Readonly<Record<string, number | undefined>>,
): boolean {
	if (!value || typeof value !== "object") return false;
	const observed = value as Record<string, unknown>;
	const expectedKeys = Object.keys(expected);
	return (
		Object.keys(observed).length === expectedKeys.length &&
		expectedKeys.every((key) => observed[key] === expected[key])
	);
}

function isDnsHostname(value: string): boolean {
	return (
		value.length <= 253 &&
		value.includes(".") &&
		value
			.split(".")
			.every(
				(label) =>
					label.length > 0 &&
					label.length <= 63 &&
					/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label),
			)
	);
}

function providerFailure(operation: string, status: number): string {
	return status === 0
		? `Cloudflare ${operation} request failed`
		: `Cloudflare ${operation} failed (HTTP ${status})`;
}

function headersObject(
	headers: HeadersInit | undefined,
): Record<string, string> {
	if (!headers) return {};
	return Object.fromEntries(new Headers(headers).entries());
}
