import { bindleScope } from "@hobo/bindles/topology";
import { describe, expect, it } from "vitest";

import {
	camp,
	providerSelection,
	resolutionPrecedenceFor,
} from "../src/index.js";

function resource(
	kind: string,
	name: string,
	portRef: readonly string[] = [`hobo:${kind}`],
) {
	return Object.freeze({
		kind,
		name,
		stableId: `${kind}:${name}`,
		portRef,
		toDescriptor() {
			return {
				kind,
				name,
				stableId: `${kind}:${name}`,
				portRef,
			};
		},
	});
}

const localRuntime = Object.freeze({ kind: "runtime", id: "runtime-local" });
const awsDefault = providerSelection("aws", "default");
const localDefault = providerSelection("local", "default");

describe("camp()", () => {
	it("composes bindle and camp without config files", () => {
		const shop = bindleScope("shop", (collector) => {
			collector.use(resource("data", "db"));
			collector.use(resource("service", "api", ["wasi:http"]));
		});

		const prod = camp("prod", {
			bindle: shop,
			envType: "production",
			runtime: localRuntime,
			defaultProvider: awsDefault,
		});

		expect(prod.kind).toBe("camp");
		expect(prod.id).toBe("prod-aws");
		expect(prod.providerId).toBe("aws");
		expect(prod.resolutionOrder).toEqual([
			"bindings",
			"tiers",
			"defaultProvider",
		]);
	});

	it("rejects mixed provider mappings", () => {
		const app = bindleScope("api", (collector) => {
			collector.use(resource("service", "api"));
		});

		expect(() =>
			camp("dev", {
				bindle: app,
				runtime: localRuntime,
				defaultProvider: localDefault,
				tiers: { service: awsDefault },
			}),
		).toThrow(/camp mappings must target one provider/);
	});

	it("rejects camp without runtime", () => {
		const app = bindleScope("api", (collector) => {
			collector.use(resource("service", "api"));
		});

		expect(() =>
			camp("dev", {
				bindle: app,
				runtime: undefined as unknown as object,
				defaultProvider: localDefault,
			}),
		).toThrow(/camp requires a runtime backend descriptor/);
	});

	it("records resolution precedence bindings before tiers before defaultProvider", () => {
		const app = bindleScope("shop", (collector) => {
			collector.use(resource("data", "db", ["hobo:sql"]));
		});

		const prod = camp("prod", {
			bindle: app,
			runtime: localRuntime,
			defaultProvider: awsDefault,
			bindings: { "shop.db": providerSelection("aws", "rds") },
		});

		const order = resolutionPrecedenceFor(prod, "data:db");
		expect(order.map((step) => step.source)).toEqual([
			"bindings",
			"tiers",
			"defaultProvider",
		]);
	});
});
