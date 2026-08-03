import {
	type ApplyResult,
	createTrafficRoutingMeteringEvent,
	type MeteringBus,
	type OverlayNetwork,
	parseApplyResult,
	parseRevokeResult,
	parseRoutingStatus,
	type RoutingPlan,
	type RoutingPlanId,
	type TrafficRoutingPort,
} from "@hobo/core";

export interface FunnelTrafficRouting extends TrafficRoutingPort {
	readonly provider: "funnel";
	readonly revoke: NonNullable<TrafficRoutingPort["revoke"]>;
}

export interface FunnelTrafficRoutingOptions {
	readonly overlay: OverlayNetwork;
	readonly metering?: MeteringBus;
}

export function createFunnelTrafficRouting(
	options: FunnelTrafficRoutingOptions,
): FunnelTrafficRouting {
	const results = new Map<RoutingPlanId, ApplyResult>();

	return {
		provider: "funnel",
		async apply(plan) {
			const unsupported = unsupportedFeatures(plan);
			const backend = plan.intent.rules[0]?.backends[0];
			if (unsupported.length > 0 || !backend?.endpoint) {
				const unmet = [
					...unsupported,
					...(backend?.endpoint ? [] : ["backend-endpoint"]),
				];
				const result = resultFor(plan, "none", unmet, [
					"Funnel only publishes one simple backend endpoint",
				]);
				results.set(plan.planId, result);
				await meter(options.metering, plan, "deny");
				return result;
			}
			if (!options.overlay.publishFunnel) {
				const result = resultFor(
					plan,
					"none",
					["overlay.publishFunnel"],
					["overlay provider does not support Funnel"],
				);
				results.set(plan.planId, result);
				await meter(options.metering, plan, "deny");
				return result;
			}

			try {
				const published = await options.overlay.publishFunnel({
					tenantId: plan.intent.tenantId,
					backendUrl: backend.endpoint,
					hostnameHint: plan.intent.service,
				});
				const realized =
					!published.enabled || published.confirmed !== true
						? "none"
						: published.gatewayHostname
							? "full"
							: "partial";
				const result = resultFor(
					plan,
					realized,
					realized === "full"
						? []
						: [
								realized === "partial"
									? "gateway-hostname"
									: published.enabled
										? "funnel-unconfirmed"
										: "funnel-unavailable",
							],
					realized === "full"
						? [
								...published.notes,
								`Funnel gateway: ${published.gatewayHostname}`,
							]
						: published.notes,
				);
				results.set(plan.planId, result);
				await meter(
					options.metering,
					plan,
					realized === "full"
						? "apply"
						: realized === "partial"
							? "degraded"
							: "deny",
				);
				return result;
			} catch {
				const result = resultFor(
					plan,
					"none",
					["provider-error"],
					["Funnel publish failed"],
				);
				results.set(plan.planId, result);
				await meter(options.metering, plan, "deny");
				return result;
			}
		},
		async status(planId) {
			const result = results.get(planId);
			if (!result) return null;
			return parseRoutingStatus({
				planId,
				active: result.realized !== "none",
				realized: result.realized,
				notes: result.notes,
			});
		},
		async revoke(planId) {
			const result = results.get(planId);
			if (!result) {
				return parseRevokeResult({
					ok: false,
					notes: ["routing plan not found"],
				});
			}
			if (result.realized === "none") {
				return parseRevokeResult({
					ok: true,
					notes: ["no route was realized"],
				});
			}
			return parseRevokeResult({
				ok: false,
				notes: ["overlay does not expose Funnel revoke"],
			});
		},
	};
}

function unsupportedFeatures(plan: RoutingPlan): string[] {
	const unmet: string[] = [];
	if (plan.intent.rules.length !== 1) unmet.push("multiple-rules");
	const rule = plan.intent.rules[0];
	if (rule && (rule.backends.length !== 1 || plan.backends.length !== 1)) {
		unmet.push("multiple-backends");
	}
	if (rule?.backends[0]?.id !== plan.backends[0]?.id) {
		unmet.push("backend-set-mismatch");
	}
	if (rule?.weightStrategy !== "static") {
		unmet.push(`weightStrategy:${rule?.weightStrategy ?? "missing"}`);
	}
	if (rule?.match?.pathPrefix) unmet.push("path-prefix");
	if (rule?.match?.headers) unmet.push("header-match");
	if (
		rule?.backends[0]?.endpoint &&
		!isLocalFunnelTarget(rule.backends[0].endpoint)
	) {
		unmet.push("backend-target");
	}
	if (plan.intent.availability) unmet.push("availability-constraints");
	if (plan.intent.resiliency) unmet.push("resiliency");
	return [...new Set(unmet)];
}

function isLocalFunnelTarget(endpoint: string): boolean {
	const url = new URL(endpoint);
	return new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname);
}

function resultFor(
	plan: RoutingPlan,
	realized: "full" | "partial" | "none",
	unmet: readonly string[],
	notes: readonly string[],
) {
	return parseApplyResult({
		planId: plan.planId,
		provider: "funnel",
		realized,
		notes,
		appliedRules: realized === "none" ? 0 : 1,
		...(unmet.length === 0 ? {} : { unmet }),
		capabilities: [],
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
				provider: "funnel",
				outcome,
			}),
		);
	} catch {
		// Provider realization remains authoritative when observation delivery fails.
	}
}
