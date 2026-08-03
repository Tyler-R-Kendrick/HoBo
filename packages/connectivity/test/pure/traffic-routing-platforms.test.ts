import {
	createMeteringBus,
	type FunnelPublishOptions,
	type OverlayNetwork,
	parseRoutingPlan,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import { createInMemoryMeteringSink } from "../../src/metering/sinks.js";
import { createFunnelTrafficRouting } from "../../src/traffic-routing/funnel.js";
import {
	createLakebedTrafficRouting,
	createVercelTrafficRouting,
} from "../../src/traffic-routing/platform-stubs.js";

function plan(backends = 1) {
	const entries = Array.from({ length: backends }, (_, index) => ({
		id: `backend:${index + 1}`,
		service: `checkout-${index + 1}`,
		weight: backends === 1 ? 100 : 50,
		endpoint: `http://127.0.0.1:${7_071 + index}`,
	}));
	return parseRoutingPlan({
		planId: `plan:funnel:${backends}`,
		intent: {
			service: "checkout",
			tenantId: "tenant-a",
			rules: [{ backends: entries }],
		},
		backends: entries,
		createdAt: "2026-08-03T15:00:00.000Z",
	});
}

function overlay(
	published: FunnelPublishOptions[],
	gatewayHostname: string | null = "checkout.example.ts.net",
	confirmed = true,
): OverlayNetwork {
	return {
		provider: "tailscale",
		async join() {
			throw new Error("not used");
		},
		async status() {
			return null;
		},
		async leave() {},
		tenantTags() {
			return [];
		},
		async publishFunnel(options) {
			published.push(options);
			return {
				enabled: true,
				confirmed,
				gatewayHostname,
				notes: [],
			};
		},
	};
}

describe("Funnel traffic routing", () => {
	it("publishes one simple endpoint and reports honest status/revoke support", async () => {
		const published: FunnelPublishOptions[] = [];
		const sink = createInMemoryMeteringSink();
		const routing = createFunnelTrafficRouting({
			overlay: overlay(published),
			metering: createMeteringBus([sink]),
		});
		const routingPlan = plan();

		await expect(routing.apply(routingPlan)).resolves.toMatchObject({
			provider: "funnel",
			realized: "full",
			appliedRules: 1,
		});
		expect(published).toEqual([
			expect.objectContaining({
				tenantId: "tenant-a",
				backendUrl: "http://127.0.0.1:7071",
				hostnameHint: "checkout",
			}),
		]);
		await expect(routing.status(routingPlan.planId)).resolves.toMatchObject({
			active: true,
			realized: "full",
		});
		await expect(routing.revoke(routingPlan.planId)).resolves.toEqual({
			ok: false,
			notes: ["overlay does not expose Funnel revoke"],
		});
		expect(sink.events.map(({ eventType }) => eventType)).toEqual([
			"routing.plan.apply",
		]);
	});

	it("denies multi-backend plans without publishing Funnel", async () => {
		const published: FunnelPublishOptions[] = [];
		const sink = createInMemoryMeteringSink();
		const routing = createFunnelTrafficRouting({
			overlay: overlay(published),
			metering: createMeteringBus([sink]),
		});

		await expect(routing.apply(plan(2))).resolves.toMatchObject({
			realized: "none",
			appliedRules: 0,
			unmet: ["multiple-backends"],
		});
		expect(published).toEqual([]);
		expect(sink.events.map(({ eventType }) => eventType)).toEqual([
			"routing.plan.deny",
		]);
	});

	it("reports enabled Funnel without a gateway hostname as degraded", async () => {
		const sink = createInMemoryMeteringSink();
		const routing = createFunnelTrafficRouting({
			overlay: overlay([], null),
			metering: createMeteringBus([sink]),
		});

		await expect(routing.apply(plan())).resolves.toMatchObject({
			realized: "partial",
			appliedRules: 1,
			unmet: ["gateway-hostname"],
		});
		expect(sink.events.map(({ eventType }) => eventType)).toEqual([
			"routing.plan.degraded",
		]);
	});

	it("does not treat an inferred gateway hostname as confirmed exposure", async () => {
		const routing = createFunnelTrafficRouting({
			overlay: overlay([], "checkout.example.ts.net", false),
		});

		await expect(routing.apply(plan())).resolves.toMatchObject({
			realized: "none",
			unmet: ["funnel-unconfirmed"],
		});
	});

	it("does not reinterpret a remote backend URL as a local port", async () => {
		const published: FunnelPublishOptions[] = [];
		const entries = [
			{
				id: "backend:remote",
				service: "checkout",
				endpoint: "https://remote.example.test:8443/path",
			},
		];
		const routingPlan = parseRoutingPlan({
			planId: "plan:funnel:remote",
			intent: {
				service: "checkout",
				tenantId: "tenant-a",
				rules: [{ backends: entries }],
			},
			backends: entries,
			createdAt: "2026-08-03T15:00:00.000Z",
		});
		const routing = createFunnelTrafficRouting({ overlay: overlay(published) });

		await expect(routing.apply(routingPlan)).resolves.toMatchObject({
			realized: "none",
			unmet: ["backend-target"],
		});
		expect(published).toEqual([]);
	});
});

describe.each([
	["vercel", createVercelTrafficRouting],
	["lakebed", createLakebedTrafficRouting],
] as const)("%s traffic routing stub", (provider, createRouting) => {
	it("fails closed without a configured provider adapter", async () => {
		const sink = createInMemoryMeteringSink();
		const routing = createRouting({ metering: createMeteringBus([sink]) });
		const routingPlan = plan();

		await expect(routing.apply(routingPlan)).resolves.toMatchObject({
			provider,
			realized: "none",
			appliedRules: 0,
			capabilities: [],
		});
		await expect(routing.status(routingPlan.planId)).resolves.toMatchObject({
			active: false,
			realized: "none",
		});
		await expect(routing.revoke(routingPlan.planId)).resolves.toEqual({
			ok: true,
			notes: ["no route was realized"],
		});
		expect(sink.events.map(({ eventType }) => eventType)).toEqual([
			"routing.plan.deny",
		]);
	});
});
