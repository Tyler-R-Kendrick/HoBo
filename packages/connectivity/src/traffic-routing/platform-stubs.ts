import {
	type ApplyResult,
	createTrafficRoutingMeteringEvent,
	type MeteringBus,
	parseApplyResult,
	parseRevokeResult,
	parseRoutingStatus,
	type RoutingPlan,
	type RoutingPlanId,
	type TrafficRoutingPort,
} from "@hobo/core";

type StubProvider = "vercel" | "lakebed";

export interface PlatformStubTrafficRouting<P extends StubProvider>
	extends TrafficRoutingPort {
	readonly provider: P;
	readonly revoke: NonNullable<TrafficRoutingPort["revoke"]>;
}

export interface PlatformStubTrafficRoutingOptions {
	readonly metering?: MeteringBus;
}
export type PlatformStubOptions = PlatformStubTrafficRoutingOptions;

export function createVercelTrafficRouting(
	options: PlatformStubTrafficRoutingOptions = {},
): PlatformStubTrafficRouting<"vercel"> {
	return createPlatformStub("vercel", options);
}

export function createLakebedTrafficRouting(
	options: PlatformStubTrafficRoutingOptions = {},
): PlatformStubTrafficRouting<"lakebed"> {
	return createPlatformStub("lakebed", options);
}

function createPlatformStub<P extends StubProvider>(
	provider: P,
	options: PlatformStubTrafficRoutingOptions,
): PlatformStubTrafficRouting<P> {
	const results = new Map<RoutingPlanId, ApplyResult>();

	return {
		provider,
		async apply(plan) {
			const result = parseApplyResult({
				planId: plan.planId,
				provider,
				realized: "none",
				notes: [
					`${provider} traffic routing requires a configured provider adapter`,
				],
				appliedRules: 0,
				unmet: ["provider-adapter"],
				capabilities: [],
			});
			results.set(plan.planId, result);
			await meter(options.metering, plan, provider);
			return result;
		},
		async status(planId) {
			const result = results.get(planId);
			if (!result) return null;
			return parseRoutingStatus({
				planId,
				active: false,
				realized: "none",
				notes: result.notes,
			});
		},
		async revoke(planId) {
			if (!results.has(planId)) {
				return parseRevokeResult({
					ok: false,
					notes: ["routing plan not found"],
				});
			}
			return parseRevokeResult({
				ok: true,
				notes: ["no route was realized"],
			});
		},
	};
}

async function meter(
	metering: MeteringBus | undefined,
	plan: RoutingPlan,
	provider: StubProvider,
) {
	try {
		await metering?.emit(
			createTrafficRoutingMeteringEvent({
				tenantId: plan.intent.tenantId,
				planId: plan.planId,
				provider,
				outcome: "deny",
			}),
		);
	} catch {
		// Capability denial remains authoritative when observation fails.
	}
}
