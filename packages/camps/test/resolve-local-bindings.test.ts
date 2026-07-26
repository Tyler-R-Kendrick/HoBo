import { bindleScope } from "@hobo/bindles/topology";
import { compileBindleManifest, data, service } from "@hobo/bindles/wiring";
import type { BindingResolverPort } from "@hobo/core";
import { parseResourceId } from "@hobo/core";
import { describe, expect, it } from "vitest";

import { camp, providerSelection, resolveLocalBindings } from "../src/index.js";

function mockResolver(
	values: Record<string, Record<string, string>>,
): BindingResolverPort {
	return {
		async resolve(resourceId, property) {
			const id = parseResourceId(resourceId);
			const value = values[id]?.[property];
			if (!value) {
				throw new Error(`unknown binding ${id}.${property}`);
			}
			return { value, source: "runtime-local" };
		},
	};
}

describe("resolveLocalBindings()", () => {
	it("resolves lazy tokens for local camp", async () => {
		const db = data("db");
		const api = service("api", { bind: { db } });
		const manifest = compileBindleManifest([db, api]);
		const appBindle = bindleScope("app", (collector) => {
			collector.use({
				kind: "data",
				name: "db",
				stableId: "data:db",
				portRef: ["hobo:data"],
			});
		});
		const devCamp = camp("dev", {
			bindle: appBindle,
			runtime: { kind: "runtime", id: "runtime-local" },
			defaultProvider: providerSelection("local"),
		});
		const resolver = mockResolver({
			db: { connectionString: "sqlite://local.db" },
		});

		const env = await resolveLocalBindings(manifest, devCamp, resolver);
		expect(env.ConnectionStrings__db).toBe("sqlite://local.db");
	});

	it("rejects non-local provider camps", async () => {
		const db = data("db");
		const api = service("api", { bind: { db } });
		const manifest = compileBindleManifest([db, api]);
		const appBindle = bindleScope("app", (collector) => {
			collector.use({
				kind: "data",
				name: "db",
				stableId: "data:db",
				portRef: ["hobo:data"],
			});
		});
		const awsCamp = camp("prod", {
			bindle: appBindle,
			runtime: { kind: "runtime", id: "runtime-local" },
			defaultProvider: providerSelection("aws"),
		});
		const resolver = mockResolver({
			db: { connectionString: "sqlite://local.db" },
		});

		await expect(
			resolveLocalBindings(manifest, awsCamp, resolver),
		).rejects.toThrow(/resolveLocalBindings requires local provider/);
	});
});
