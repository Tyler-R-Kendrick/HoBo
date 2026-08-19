import { camp } from "@hobo/camps";
import { describe, expect, it } from "vitest";

import {
	YARD_BINDING_CONTRACT,
	YardBindingError,
	yard,
	yardToShape,
} from "../src/index.js";

describe("yard() — owns provider; zero camps allowed", () => {
	it("declares provider on the yard with zero camps", () => {
		const azureProd = yard("azure-prod", {
			provider: "azure",
			regions: ["eastus2"],
			require: ["private-network", "managed-container-substrate"],
			properties: {
				"azure.subscriptionRef": "subscriptionref://platform-prod",
			},
			camps: [],
		});

		expect(azureProd.providerId).toBe("azure");
		expect(azureProd.camps).toHaveLength(0);
		expect(azureProd.regions).toContain("eastus2");
	});

	it("attaches camps and derives their provider from the yard", () => {
		const prod = camp("prod", {
			envType: "production",
			require: ["managed-container-substrate"],
		});
		const localYard = yard("local", {
			provider: "local",
			camps: [prod],
		});

		expect(localYard.providerId).toBe("local");
		expect(localYard.camps).toHaveLength(1);
		expect(localYard.camps[0]?.derivedProviderId).toBe("local");
		expect(localYard.camps[0]?.id).toBe("local/prod");
	});

	it("rejects camps whose derived provider disagrees", () => {
		const awsCamp = camp("prod", { envType: "production" });
		const attached = {
			...awsCamp,
			derivedProviderId: "aws",
		};
		expect(() =>
			yard("azure-only", {
				provider: "azure",
				camps: [attached as typeof awsCamp],
			}),
		).toThrow(/cannot attach camp with provider/);
	});

	it("projects yard to planning shape", () => {
		const y = yard("gcp-edge", {
			provider: { id: "gcp" },
			runtimeId: "gcp-yard-runtime/v1",
			camps: [],
		});
		const shape = yardToShape(y);
		expect(shape.providerId).toBe("gcp");
		expect(shape.runtimeId).toBe("gcp-yard-runtime/v1");
		expect(shape.camps).toEqual([]);
	});

	it("rejects credential-like properties", () => {
		expect(() =>
			yard("bad", {
				provider: "aws",
				properties: { apiKey: "secret" },
			}),
		).toThrow(/credentials/);
	});
});

describe("yard() — capability binding rows", () => {
	it("defaults to an empty frozen row set", () => {
		const y = yard("aws-prod", { provider: "aws" });
		expect(y.bindings).toEqual([]);
		expect(Object.isFrozen(y.bindings)).toBe(true);
	});

	it("canonicalizes authored rows into a sorted set", () => {
		const y = yard("aws-prod", {
			provider: "aws",
			bindings: [
				{ profile: "web.static/v1", productId: "aws:s3-website" },
				{ profile: "data.relational/v1", productId: "aws:rds-postgres" },
			],
		});
		expect(y.bindings.map((b) => b.profile)).toEqual([
			"data.relational/v1",
			"web.static/v1",
		]);
	});

	it("surfaces rows in the planning shape so selection can consume them structurally", () => {
		const y = yard("aws-prod", {
			provider: "aws",
			bindings: [
				{
					profile: "data.relational/v1",
					productId: "aws:rds-postgres",
					require: ["tls"],
				},
			],
		});
		const shape = yardToShape(y);
		expect(shape.bindings).toEqual([
			{
				contract: YARD_BINDING_CONTRACT,
				profile: "data.relational/v1",
				productId: "aws:rds-postgres",
				require: ["tls"],
				properties: {},
			},
		]);
		expect(Object.isFrozen(shape.bindings)).toBe(true);
	});

	it("refuses a row whose profile is already pinned as a resolver slot", () => {
		let code = "no-error";
		try {
			yard("aws-prod", {
				provider: "aws",
				resolverDefaults: {
					pins: [
						{ slot: "data.relational/v1", resolverId: "aws-rds-resolver/v1" },
					],
				},
				bindings: [
					{ profile: "data.relational/v1", productId: "aws:rds-postgres" },
				],
			});
		} catch (error) {
			code = error instanceof YardBindingError ? error.code : String(error);
		}
		expect(code).toBe("YARD_BINDING_PIN_CONFLICT");
	});

	it("does not infer a product's provider from its id at parse time", () => {
		// Provider coherence is a resolution-time gate (the catalog lives there);
		// inferring it from an id prefix here would make naming load-bearing.
		const y = yard("aws-prod", {
			provider: "aws",
			bindings: [{ profile: "kv.key-value/v1", productId: "gcp:memorystore" }],
		});
		expect(y.bindings[0]?.productId).toBe("gcp:memorystore");
	});
});
