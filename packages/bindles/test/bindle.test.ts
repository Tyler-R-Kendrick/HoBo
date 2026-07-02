import { describe, expect, it } from "vitest";

import { bindle } from "../src/bindle.js";

describe("bindle()", () => {
	it("builds a graph with at least two resources and one dependsOn edge", () => {
		const definition = bindle("shop", (b) => {
			const store = b.data();
			const orders = b.queue();
			const api = b.api().dependsOn(store, orders);
			return { store, orders, api };
		});

		expect(Object.isFrozen(definition)).toBe(true);
		expect(definition.name).toBe("shop");
		expect(Object.keys(definition.resources)).toEqual([
			"store",
			"orders",
			"api",
		]);
		expect(definition.resources.store).toEqual({
			kind: "data",
			name: "store",
			stableId: "data:store",
			declaredAllow: [],
			annotations: [],
			dependsOn: [],
		});
		expect(definition.edges).toEqual([
			{ from: "api", to: "store" },
			{ from: "api", to: "orders" },
		]);
		expect(JSON.parse(JSON.stringify(definition))).toEqual({
			name: "shop",
			resources: {
				store: {
					kind: "data",
					name: "store",
					stableId: "data:store",
					declaredAllow: [],
					annotations: [],
					dependsOn: [],
				},
				orders: {
					kind: "queue",
					name: "orders",
					stableId: "queue:orders",
					declaredAllow: [],
					annotations: [],
					dependsOn: [],
				},
				api: {
					kind: "api",
					name: "api",
					stableId: "api:api",
					declaredAllow: [],
					annotations: [],
					dependsOn: ["data", "queue"],
				},
			},
			edges: [
				{ from: "api", to: "store" },
				{ from: "api", to: "orders" },
			],
		});
	});

	it("records allow narrowing and opaque provider annotations", () => {
		const definition = bindle("annotated", (b) => ({
			todos: b.kv().allow("get", "set"),
			api: b
				.api()
				.with({ provider: "aws", option: "fargate", config: { cpu: 512 } }),
		}));

		expect(definition.resources.todos.declaredAllow).toEqual(["get", "set"]);
		expect(definition.resources.api.annotations).toEqual([
			{ provider: "aws", option: "fargate", config: { cpu: 512 } },
		]);
	});

	it("rejects empty resource names", () => {
		expect(() =>
			bindle("shop", (b) => ({
				"": b.kv(),
			})),
		).toThrow(/bindle resource names must be non-empty strings/);
	});
});
