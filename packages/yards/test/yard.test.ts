import { camp } from "@hobo/camps";
import { describe, expect, it } from "vitest";

import { yard, yardToShape } from "../src/index.js";

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
