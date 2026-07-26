import { describe, expect, it } from "vitest";

import {
	deriveConnectivityPlan,
	JUNCTION_PLAN_DERIVED_EVENT,
	JunctionParseError,
	junction,
	planForYard,
} from "../src/index.js";
import { makeYard } from "./helpers.js";

function twoYardJunction(
	manifests?: Parameters<typeof junction>[1]["manifests"],
	providers: readonly [string, string] = ["aws", "azure"],
) {
	const left = makeYard("left", providers[0]);
	const right = makeYard("right", providers[1]);
	return junction("my-app", {
		yards: [left, right],
		...(manifests ? { manifests } : {}),
	});
}

describe("tier selection matrix", () => {
	it("selects private-network for same provider and same region", () => {
		const plan = deriveConnectivityPlan(
			twoYardJunction(
				{
					left: { region: "us-east-1" },
					right: { region: "us-east-1" },
				},
				["aws", "aws"],
			),
		);
		expect(plan.edges[0]?.tier).toBe("private-network");
		expect(plan.edges[0]?.tierLevel).toBe(1);
	});

	it("selects cross-region for same provider across regions", () => {
		const plan = deriveConnectivityPlan(
			twoYardJunction(
				{
					left: { region: "us-east-1" },
					right: { region: "eu-west-1" },
				},
				["aws", "aws"],
			),
		);
		expect(plan.edges[0]?.tier).toBe("cross-region");
		expect(plan.edges[0]?.tierLevel).toBe(2);
	});

	it("selects private-interconnect when both cross-provider members declare it", () => {
		const plan = deriveConnectivityPlan(
			twoYardJunction({
				left: { capabilities: ["private-interconnect", "public-mtls"] },
				right: { capabilities: ["private-interconnect", "public-mtls"] },
			}),
		);
		expect(plan.edges[0]?.tier).toBe("private-interconnect");
		expect(plan.edges[0]?.tierLevel).toBe(3);
	});

	it("selects overlay-mesh across providers by default", () => {
		const plan = deriveConnectivityPlan(twoYardJunction());
		expect(plan.edges[0]?.tier).toBe("overlay-mesh");
		expect(plan.edges[0]?.tierLevel).toBe(4);
	});

	it("falls back to public-mtls when a member restricts its capabilities", () => {
		const plan = deriveConnectivityPlan(
			twoYardJunction({ right: { capabilities: ["public-mtls"] } }),
		);
		expect(plan.edges[0]?.tier).toBe("public-mtls");
		expect(plan.edges[0]?.tierLevel).toBe(5);
	});

	it("falls back to public-mtls for same provider with undeclared regions", () => {
		const plan = deriveConnectivityPlan(
			twoYardJunction(undefined, ["aws", "aws"]),
		);
		expect(plan.edges[0]?.tier).toBe("public-mtls");
	});
});

describe("deriveConnectivityPlan()", () => {
	it("derives one edge per member pair with mirrored halves", () => {
		const a = makeYard("a", "aws");
		const b = makeYard("b", "azure");
		const c = makeYard("c", "gcp");
		const plan = deriveConnectivityPlan(junction("tri", { yards: [c, a, b] }));

		expect(plan.edges.map((edge) => edge.id)).toEqual(["a->b", "a->c", "b->c"]);
		expect(plan.event).toEqual({
			type: JUNCTION_PLAN_DERIVED_EVENT,
			junctionName: "tri",
			edgeCount: 3,
		});
		for (const edge of plan.edges) {
			const halves = [
				...(plan.halvesByYard[edge.sourceYard] ?? []),
				...(plan.halvesByYard[edge.targetYard] ?? []),
			].filter((half) => half.edgeId === edge.id);
			expect(halves).toHaveLength(2);
			expect(halves.map((half) => half.role).sort()).toEqual([
				"source",
				"target",
			]);
			expect(halves[0]?.tier).toBe(edge.tier);
		}
		expect(Object.isFrozen(plan)).toBe(true);
	});

	it("derives one federated DNS record per member inside the junction zone", () => {
		const plan = deriveConnectivityPlan(twoYardJunction());

		expect(plan.dns.zone).toBe("my-app.junction.internal");
		expect(plan.dns.records).toEqual([
			{
				recordName: "left.my-app.junction.internal",
				recordType: "CNAME",
				target: "left.aws.yard.internal",
				ownerYard: "left",
			},
			{
				recordName: "right.my-app.junction.internal",
				recordType: "CNAME",
				target: "right.azure.yard.internal",
				ownerYard: "right",
			},
		]);
	});
});

describe("planForYard()", () => {
	it("extracts exactly one yard's halves, DNS split, and federation entries", () => {
		const plan = deriveConnectivityPlan(twoYardJunction());
		const half = planForYard(plan, "left");

		expect(half.yardName).toBe("left");
		expect(half.halves.every((entry) => entry.yardName === "left")).toBe(true);
		expect(half.halves).toHaveLength(1);
		expect(half.dnsRecordsToRealize).toHaveLength(1);
		expect(half.dnsRecordsToRealize[0]?.ownerYard).toBe("left");
		expect(half.dnsRecordsToResolve).toHaveLength(2);
		expect(
			half.trustExchanges.every(
				(entry) => entry.fromYard === "left" || entry.toYard === "left",
			),
		).toBe(true);
		expect(half.policyPacks).toHaveLength(1);
		expect(half.policyPacks[0]?.toYard).toBe("left");
		expect(Object.isFrozen(half)).toBe(true);
	});

	it("rejects extraction for a yard that is not a member", () => {
		const plan = deriveConnectivityPlan(twoYardJunction());

		try {
			planForYard(plan, "gcp");
			expect.unreachable("accepted a non-member yard");
		} catch (error) {
			expect(error).toBeInstanceOf(JunctionParseError);
			expect((error as JunctionParseError).code).toBe(
				"junction.plan.unknown-yard",
			);
		}
	});
});
