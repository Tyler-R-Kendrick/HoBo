import {
	parseRegisteredDefinitions,
	type ResourceDefinition,
} from "@hobo/cloud";
import { describe, expect, it } from "vitest";

import {
	defineResource,
	RESOURCE_DEFINITION_SCHEMA,
	SdkDeclarationError,
} from "../src/index.js";

// The walkthrough §2.4 call shape: a prod-only HA Postgres golden path. The
// `with:` value stands in for azure.flexiblePostgres({ ha: true }) — a
// provider-package realization carrying its definition id.
const haPostgres = defineResource({
	type: "database",
	engine: "postgres",
	class: "ha",
	with: {
		providerId: "azure",
		definitionId: "azure.flexiblePostgres",
		properties: { ha: true },
		cost: { sku: "flexible-postgres-ha", unit: "month", marginalPrice: "220" },
	},
	match: { envType: "production" },
});

describe("defineResource", () => {
	it("produces a frozen @hobo/cloud ResourceDefinition", () => {
		// Type-level composition: the SDK output IS the existing target type.
		const definition: ResourceDefinition = haPostgres;
		expect(Object.isFrozen(haPostgres)).toBe(true);
		expect(haPostgres.schema).toBe(RESOURCE_DEFINITION_SCHEMA);
		expect(definition.id).toBe("azure.flexiblePostgres");
		expect(definition.providerId).toBe("azure");
		expect(definition.port).toBe("database");
		expect(definition.features).toEqual(["postgres", "ha"]);
		expect(definition.cost.marginalPrice).toBe("220");
	});

	it("outscores a {} default: match keys + features become specificity", () => {
		expect(haPostgres.specificity).toBe(3);
		expect(haPostgres.match).toEqual({ envType: "production" });
	});

	it("negotiates capability verdicts through satisfies()", () => {
		expect(haPostgres.satisfies({ port: "database" })).toEqual({
			kind: "full",
		});
		expect(
			haPostgres.satisfies({ port: "database", features: ["postgres", "ha"] }),
		).toEqual({ kind: "full" });
		expect(
			haPostgres.satisfies({ port: "database", features: ["mysql"] }),
		).toEqual({ kind: "partial", missing: ["mysql"] });
		expect(haPostgres.satisfies({ port: "kv" })).toEqual({ kind: "none" });
	});

	it("round-trips through the cloud registry's own parser", () => {
		const parsed = parseRegisteredDefinitions({
			providerId: "azure",
			definitions: [haPostgres],
		});
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.id).toBe("azure.flexiblePostgres");
		expect(parsed[0]?.port).toBe("database");
		expect(parsed[0]?.features).toEqual(["postgres", "ha"]);
	});

	it("infers providerId from a dotted definitionId", () => {
		const definition = defineResource({
			type: "kv",
			with: {
				definitionId: "azure.cosmos",
				properties: { consistency: "session" },
			},
		});
		expect(definition.providerId).toBe("azure");
		expect(definition.properties).toEqual({ consistency: "session" });
	});

	it("rejects a realization without provider identity", () => {
		expect(() => defineResource({ type: "database", with: {} })).toThrow(
			SdkDeclarationError,
		);
	});

	it("rejects a missing capability type", () => {
		expect(() =>
			defineResource({ type: "", with: { providerId: "azure" } }),
		).toThrow(SdkDeclarationError);
	});
});
