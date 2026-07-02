import { bindleScope } from "@hobo/bindles/topology";
import { camp, providerSelection } from "@hobo/camps";
import { describe, expect, it } from "vitest";

import { yard } from "../src/index.js";

describe("yard()", () => {
	it("groups camps under one provider", () => {
		const app = bindleScope("shop", (collector) => {
			collector.use({
				kind: "service",
				name: "api",
				stableId: "service:api",
				portRef: ["wasi:http"],
			});
		});
		const dev = camp("dev", {
			bindle: app,
			runtime: { kind: "runtime", id: "runtime-local" },
			defaultProvider: providerSelection("local"),
		});
		const localYard = yard("local", { camps: [dev] });

		expect(localYard.providerId).toBe("local");
		expect(localYard.camps).toHaveLength(1);
	});

	it("rejects mixed providers across camps", () => {
		const app = bindleScope("shop", (collector) => {
			collector.use({
				kind: "service",
				name: "api",
				stableId: "service:api",
				portRef: ["wasi:http"],
			});
		});
		const localCamp = camp("dev", {
			bindle: app,
			runtime: { kind: "runtime", id: "runtime-local" },
			defaultProvider: providerSelection("local"),
		});
		const awsCamp = camp("prod", {
			bindle: app,
			runtime: { kind: "runtime", id: "runtime-local" },
			defaultProvider: providerSelection("aws"),
		});

		expect(() => yard("mixed", { camps: [localCamp, awsCamp] })).toThrow(
			/cannot mix providers/,
		);
	});
});
