import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createOpaGatePlane } from "../../src/opa.js";
import {
	createArgoCdDeliveryPlane,
	DeliverySubmissionError,
	type FetchLike,
} from "../../src/planes.js";
import type { PolicyHash, ResolutionReceipt } from "../../src/types.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const opaPact = JSON.parse(
	readFileSync(
		join(packageRoot, "../pacts/broker_policy_opa.pact.json"),
		"utf8",
	),
);
const argoPact = JSON.parse(
	readFileSync(
		join(packageRoot, "../pacts/broker_delivery_argocd.pact.json"),
		"utf8",
	),
);

// Pact-derived mock provider: replays the interaction's recorded response for
// the request the consumer actually sends (no live OPA / Argo CD, per the
// testing policy — mocked service boundaries derived from Pact contracts).
function mockFetchFor(interaction: {
	request: { path: string };
	response: { status: number; body: unknown };
}): FetchLike {
	return async (url) => {
		expect(url.endsWith(interaction.request.path)).toBe(true);
		return {
			status: interaction.response.status,
			json: async () => interaction.response.body,
		};
	};
}

describe("OPA/Rego gate-plane boundary (consumer side of the pact)", () => {
	const gateInput = (bindleId: string) => ({
		request: {
			subject: { kind: "service", id: "broker:yard-1" },
			action: "hobo:broker:resolve",
			resource: { kind: "bindle", id: bindleId },
			phase: "plan",
		},
		costQuota: { quota: "deployments/day", used: 2, limit: 20 },
	});

	it("lowers a Rego allow onto the gate decision", async () => {
		const interaction = opaPact.interactions[0];
		const plane = createOpaGatePlane({
			endpoint: "http://opa.local:8181",
			fetchFn: mockFetchFor(interaction),
		});
		const decision = await plane.evaluate(gateInput("bindle:checkout"));
		expect(decision.effect).toBe(interaction.response.body.result.effect);
		expect(decision.reasons).toHaveLength(0);
		// policy.Decided is recorded on allow too, with the Rego policy ids.
		expect(decision.events[0]?.type).toBe("policy.Decided");
		expect(decision.events[0]?.policyIds).toEqual(
			interaction.response.body.result.policyIds,
		);
	});

	it("lowers a Rego deny onto a policy-plane rejection reason", async () => {
		const interaction = opaPact.interactions[1];
		const plane = createOpaGatePlane({
			endpoint: "http://opa.local:8181",
			fetchFn: mockFetchFor(interaction),
		});
		const decision = await plane.evaluate(gateInput("bindle:frozen"));
		expect(decision.effect).toBe("deny");
		expect(decision.reasons[0]?.plane).toBe("policy");
		expect(decision.reasons[0]?.code).toBe(
			interaction.response.body.result.reasons[0].code,
		);
	});

	it("fails closed to deny when OPA is unavailable", async () => {
		const interaction = opaPact.interactions[2];
		const plane = createOpaGatePlane({
			endpoint: "http://opa.local:8181",
			fetchFn: mockFetchFor(interaction),
		});
		const decision = await plane.evaluate(gateInput("bindle:checkout"));
		expect(decision.effect).toBe(
			interaction.response.body.expectedBrokerEffect,
		);
		expect(decision.reasons[0]?.code).toBe(
			interaction.response.body.expectedReasonCode,
		);

		// Transport failure fails closed the same way.
		const broken = createOpaGatePlane({
			endpoint: "http://opa.local:8181",
			fetchFn: async () => {
				throw new Error("connection refused");
			},
		});
		const failed = await broken.evaluate(gateInput("bindle:checkout"));
		expect(failed.effect).toBe("deny");
		expect(failed.reasons[0]?.code).toBe("policy-engine-unavailable");
	});
});

describe("Argo CD delivery-plane boundary (consumer side of the pact)", () => {
	const receipt = (requestId: string): ResolutionReceipt => ({
		schemaVersion: "hobo.broker/v1",
		requestId,
		brokerId: "broker:yard-1",
		catalogHash: "sha256:catalog-abc",
		policyHash: "sha256:policy-abc" as PolicyHash,
		placementPolicyId: "pp-bindle",
		placements: [],
	});
	const deliveryPolicy = {
		engine: "argo" as const,
		syncMode: "auto" as const,
		prune: true,
		gitopsRepo: "https://git.example/hobo-receipts",
		destinationNamespace: "hobo-prod",
	};

	it("submits the rendered Application and returns the Argo response", async () => {
		const interaction = argoPact.interactions[0];
		const plane = createArgoCdDeliveryPlane({
			endpoint: "https://argocd.local",
			fetchFn: mockFetchFor(interaction),
			tokenProvider: () => "argo-token-from-token-broker",
		});
		const ticket = await plane.submit(
			receipt("req-checkout-1"),
			deliveryPolicy,
		);
		expect(ticket.engine).toBe("argo");
		const metadata = ticket.document.metadata as Record<string, unknown>;
		expect(metadata.name).toBe(interaction.request.body.metadata.name);
		expect(ticket.response).toEqual(interaction.response.body);
	});

	it("fails closed with delivery-rejected on a non-2xx", async () => {
		const interaction = argoPact.interactions[1];
		const plane = createArgoCdDeliveryPlane({
			endpoint: "https://argocd.local",
			fetchFn: mockFetchFor(interaction),
		});
		await expect(
			plane.submit(receipt("req-checkout-2"), deliveryPolicy),
		).rejects.toThrow(DeliverySubmissionError);
	});
});
