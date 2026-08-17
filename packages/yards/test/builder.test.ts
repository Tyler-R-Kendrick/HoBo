/**
 * The builder is a front end, not a fork. These tests exist mostly to keep it
 * that way: the equivalence cases pin builder output to `defineYard` /
 * `defineStation` output, and the refusal cases drive each existing error code
 * through the builder so a second, drifting validation path cannot appear
 * without turning one of them red.
 */
import { camp } from "@hobo/camps";
import {
	CAPABILITY_SLOTS,
	SLOT_BINDING_CONTRACT,
	type SlotBinding,
	slotBinding,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	BuilderError,
	buildCamp,
	buildStation,
	buildYard,
	defineStation,
	defineYard,
	providerIdOf,
	StationDefineError,
	YardBindingError,
	YardDefineError,
} from "../src/index.js";

const containerApps = slotBinding({
	slot: "web",
	profile: "web.hosted/v1",
	productId: "azure.container-apps/v1",
	properties: { ingress: "external" },
});
const appService = slotBinding({
	slot: "web",
	profile: "web.hosted/v1",
	productId: "azure.app-service/v1",
	properties: { sku: "P1v3" },
});
const postgres = slotBinding({
	slot: "data",
	profile: "data.postgres/v1",
	productId: "azure.postgres-flexible/v1",
	properties: { tier: "GeneralPurpose" },
});
const blob = slotBinding({
	slot: "bucket",
	profile: "bucket.object/v1",
	productId: "azure.blob-storage/v1",
	properties: { accessTier: "hot" },
});

describe("provider references", () => {
	it("reads a provider id from a namespace object, a string, or { id }", () => {
		expect(providerIdOf({ PROVIDER_ID: "azure" })).toBe("azure");
		expect(providerIdOf("azure")).toBe("azure");
		expect(providerIdOf({ id: "azure" })).toBe("azure");
	});

	it("refuses to infer a provider from anything else", () => {
		expect(() => providerIdOf({} as never)).toThrowError(BuilderError);
		try {
			providerIdOf({ name: "azure" } as never);
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect((error as BuilderError).code).toBe("PROVIDER_REF_UNRESOLVED");
			expect((error as BuilderError).remediation).toContain("y.on(azure)");
		}
	});
});

describe("buildYard equivalence with defineYard", () => {
	it("produces a Yard deep-equal to the defineYard authoring of the same thing", () => {
		const built = buildYard("prod-eu", (y) => {
			y.on({ PROVIDER_ID: "azure" })
				.region("westeurope")
				.residency("eu")
				.label("tier", "public");
			y.web(containerApps, appService);
			y.data(postgres);
			y.bucket(blob);
			y.camp("api", (c) => c.production().label("exposure", "public"));
			y.camp("preview", (c) =>
				c.preview().require("ephemeral").label("ttl", "72h"),
			);
		});

		const defined = defineYard("prod-eu", {
			provider: "azure",
			region: "westeurope",
			residency: ["eu"],
			labels: { tier: "public" },
			web: [containerApps, appService],
			data: postgres,
			bucket: blob,
			camps: [
				camp("api", { envType: "production", labels: { exposure: "public" } }),
				camp("preview", {
					envType: "ephemeral",
					require: ["ephemeral"],
					labels: { ttl: "72h" },
				}),
			],
		});

		expect(built).toEqual(defined);
	});

	it("compiles slot methods for exactly the CAPABILITY_SLOTS vocabulary", () => {
		const seen: string[] = [];
		buildYard("vocab", (y) => {
			y.on("azure");
			for (const slot of CAPABILITY_SLOTS) {
				expect(typeof (y as unknown as Record<string, unknown>)[slot]).toBe(
					"function",
				);
				seen.push(slot);
			}
			y.web(containerApps);
		});
		expect(seen).toEqual([...CAPABILITY_SLOTS]);
	});
});

describe("nesting replaces attachment", () => {
	it("derives yardId and providerId for a nested camp", () => {
		const built = buildYard("prod-eu", (y) => {
			y.on("azure").region("westeurope");
			y.web(containerApps);
			y.camp("api", (c) => c.production());
		});

		expect(built.camps).toHaveLength(1);
		const nested = built.camps[0];
		expect(nested?.id).toBe("prod-eu/api");
		expect(nested?.name).toBe("prod-eu/api");
		expect(nested?.derivedProviderId).toBe("azure");
		expect(nested?.enclosingYardId).toBe("prod-eu");
	});

	it("accepts a Camp authored separately by buildCamp", () => {
		const preview = buildCamp("preview", (c) => c.preview().require("cheap"));
		expect(preview.id).toBe("preview");
		expect(preview.derivedProviderId).toBeUndefined();

		const built = buildYard("prod-eu", (y) => {
			y.on("azure");
			y.web(containerApps);
			y.camp(preview);
		});
		expect(built.camps[0]?.id).toBe("prod-eu/preview");
		expect(built.camps[0]?.derivedProviderId).toBe("azure");
	});
});

describe("slot accumulation", () => {
	it("accumulates repeated slot calls instead of replacing them", () => {
		const built = buildYard("prod-eu", (y) => {
			y.on("azure");
			y.web(containerApps);
			y.web(appService);
		});

		expect(built.bindings.map((row) => row.productId)).toEqual([
			"azure.app-service/v1",
			"azure.container-apps/v1",
		]);
	});

	it("refuses a slot call that declares no offerings", () => {
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.web();
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(BuilderError);
			expect((error as BuilderError).code).toBe("SLOT_CALL_EMPTY");
		}
	});
});

describe("determinism", () => {
	it("does not let declaration order reach the Yard record", () => {
		const forward = buildYard("prod-eu", (y) => {
			y.on("azure").region("westeurope").region("northeurope");
			y.web(containerApps, appService);
			y.data(postgres);
			y.bucket(blob);
			y.label("tier", "public").label("owner", "platform");
			y.camp("api", (c) => c.production());
			y.camp("preview", (c) => c.preview());
		});
		const backward = buildYard("prod-eu", (y) => {
			y.camp("preview", (c) => c.preview());
			y.camp("api", (c) => c.production());
			y.label("owner", "platform").label("tier", "public");
			y.bucket(blob);
			y.data(postgres);
			y.web(appService);
			y.web(containerApps);
			y.region("northeurope").region("westeurope").on("azure");
		});

		expect(backward).toEqual(forward);
		expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
	});

	it("does not let registration order reach the Station manifest", () => {
		const yardA = buildYard("a", (y) => {
			y.on("azure");
			y.web(containerApps);
		});
		const yardB = buildYard("b", (y) => {
			y.on("aws");
			y.data(postgres);
		});

		const forward = buildStation("acme", (s) => {
			s.tenant("acme").residency("eu");
			s.yard(yardA).yard(yardB);
		});
		const backward = buildStation("acme", (s) => {
			s.yard(yardB).yard(yardA);
			s.residency("eu").tenant("acme");
		});

		expect(backward).toEqual(forward);
	});
});

describe("buildStation equivalence with defineStation", () => {
	it("registers a built Yard and a prebuilt Yard through the same path", () => {
		const prebuilt = defineYard("cloudflare", {
			provider: "cloudflare",
			web: slotBinding({
				slot: "web",
				profile: "web.hosted/v1",
				productId: "cloudflare.workers/v1",
			}),
		});

		const built = buildStation("acme", (s) => {
			s.tenant("acme").residency("eu").trustDomain("acme.hobo.internal");
			s.yard("prod-eu", (y) => {
				y.on("azure").region("westeurope").residency("eu");
				y.web(containerApps, appService);
				y.data(postgres);
				y.bucket(blob);
				y.camp("api", (c) => c.production().label("exposure", "public"));
				y.camp("preview", (c) =>
					c.preview().require("ephemeral").label("ttl", "72h"),
				);
			});
			s.yard(prebuilt);
		});

		const defined = defineStation("acme", {
			isolation: {
				tenant: "acme",
				residency: "eu",
				trustDomain: "acme.hobo.internal",
				airgap: false,
			},
			yards: [
				defineYard("prod-eu", {
					provider: "azure",
					region: "westeurope",
					residency: ["eu"],
					web: [containerApps, appService],
					data: postgres,
					bucket: blob,
					camps: [
						camp("api", {
							envType: "production",
							labels: { exposure: "public" },
						}),
						camp("preview", {
							envType: "ephemeral",
							require: ["ephemeral"],
							labels: { ttl: "72h" },
						}),
					],
				}),
				prebuilt,
			],
		});

		expect(built).toEqual(defined);
		expect(built.yardRefs).toEqual(["cloudflare", "prod-eu"]);
	});

	it("defaults isolation exactly as defineStation does", () => {
		const yardOnly = buildYard("a", (y) => {
			y.on("azure");
			y.web(containerApps);
		});
		const built = buildStation("acme", (s) => {
			s.yard(yardOnly);
		});
		expect(built.isolation).toEqual({
			tenant: "acme",
			residency: "local",
			airgap: false,
			trustDomain: "acme.hobo.local",
		});
	});

	it("carries an airgap declaration through", () => {
		const yardOnly = buildYard("a", (y) => {
			y.on("azure");
			y.web(containerApps);
		});
		expect(
			buildStation("acme", (s) => {
				s.airgap();
				s.yard(yardOnly);
			}).isolation.airgap,
		).toBe(true);
	});
});

describe("every existing refusal still fires through the builder", () => {
	it("SLOT_KEY_MISMATCH", () => {
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.bucket(postgres);
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(YardDefineError);
			expect((error as YardDefineError).code).toBe("SLOT_KEY_MISMATCH");
		}
	});

	it("SLOT_PROFILE_MISMATCH", () => {
		const misfiled: SlotBinding = {
			contract: SLOT_BINDING_CONTRACT,
			slot: "bucket",
			profile: "data.postgres/v1",
			productId: "azure.postgres-flexible/v1",
			properties: {},
		};
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.bucket(misfiled);
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect((error as YardDefineError).code).toBe("SLOT_PROFILE_MISMATCH");
		}
	});

	it("SLOT_BINDING_CREDENTIAL_PROPERTY", () => {
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.bucket(
					slotBinding({
						slot: "bucket",
						profile: "bucket.object/v1",
						productId: "azure.blob-storage/v1",
						properties: { accessKey: "hunter2", apiKey: "hunter2" },
					}),
				);
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect((error as { code?: string }).code).toBe(
				"SLOT_BINDING_CREDENTIAL_PROPERTY",
			);
		}
	});

	it("YARD_BINDING_DUPLICATE", () => {
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.web(containerApps);
				y.web(containerApps);
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(YardBindingError);
			expect((error as YardBindingError).code).toBe("YARD_BINDING_DUPLICATE");
		}
	});

	it("YARD_BINDING_EMPTY_CONSTRAINT", () => {
		// Hand-rolled rather than via slotBinding(), which refuses this earlier
		// with its own code — the point is that the Yard-level screen still runs.
		const unconstrained: SlotBinding = {
			contract: SLOT_BINDING_CONTRACT,
			slot: "bucket",
			profile: "bucket.object/v1",
			properties: {},
		};
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.bucket(unconstrained);
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(YardBindingError);
			expect((error as YardBindingError).code).toBe(
				"YARD_BINDING_EMPTY_CONSTRAINT",
			);
		}
	});

	it("STATION_NO_YARDS", () => {
		try {
			buildStation("acme", (s) => {
				s.tenant("acme");
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(StationDefineError);
			expect((error as StationDefineError).code).toBe("STATION_NO_YARDS");
		}
	});

	it("STATION_DUPLICATE_YARD", () => {
		try {
			buildStation("acme", (s) => {
				s.yard("prod-eu", (y) => {
					y.on("azure");
					y.web(containerApps);
				});
				s.yard("prod-eu", (y) => {
					y.on("azure");
					y.data(postgres);
				});
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect(error).toBeInstanceOf(StationDefineError);
			expect((error as StationDefineError).code).toBe("STATION_DUPLICATE_YARD");
		}
	});

	it("camp-provider-selection-forbidden", () => {
		try {
			buildYard("prod-eu", (y) => {
				y.on("azure");
				y.web(containerApps);
				y.camp("api", (c) => c.provider("aws"));
			});
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect((error as { code?: string }).code).toBe(
				"camp-provider-selection-forbidden",
			);
		}
	});

	it("camp-bindle-ownership-forbidden", () => {
		try {
			buildCamp("api", (c) => c.bindle({ name: "acme-app" }));
			expect.unreachable("expected a refusal");
		} catch (error) {
			expect((error as { code?: string }).code).toBe(
				"camp-bindle-ownership-forbidden",
			);
		}
	});

	it("leaves a missing provider to yard()'s own refusal", () => {
		expect(() =>
			buildYard("prod-eu", (y) => {
				y.web(containerApps);
			}),
		).toThrowError(/yard requires provider/u);
	});
});

describe("camp builder", () => {
	it("matches camp() for the same declaration", () => {
		expect(
			buildCamp("api", (c) =>
				c
					.production()
					.require("gpu", "fast")
					.prefer("cheap")
					.label("exposure", "public")
					.runtime("node22")
					.pin("data", "azure.postgres"),
			),
		).toEqual(
			camp("api", {
				envType: "production",
				require: ["gpu", "fast"],
				prefer: ["cheap"],
				labels: { exposure: "public" },
				runtimeRequirements: ["node22"],
				resolverConfig: {
					pins: [{ slot: "data", resolverId: "azure.postgres" }],
				},
			}),
		);
	});

	it("infers envType from the name when none is stated, exactly as camp() does", () => {
		expect(buildCamp("prod").envType).toBe(camp("prod").envType);
		expect(buildCamp("staging").envType).toBe("staging");
	});
});
