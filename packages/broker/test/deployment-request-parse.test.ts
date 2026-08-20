/**
 * Parsing and building a Bindle deployment request.
 *
 * This is the boundary where a Bindle's *requirements* meet a Yard's
 * *placement*, and it enforces the separation that the whole placement model
 * rests on:
 *
 * **A Bindle may not select a provider.** `provider` or `providerId` at the
 * top level is refused outright — with its own error code, not a generic parse
 * failure — because provider selection belongs to Yard placement. A Bindle that
 * could name its own cloud would make every placement policy advisory: the
 * Broker's residency rules, cost objectives and generation approvals all assume
 * they decide where work lands.
 *
 * The refusal is a *smuggling* check rather than a schema omission, and that is
 * why it is worth a test: the field is not merely unsupported, it is actively
 * detected and rejected, and the code says so.
 *
 * The builder side (`buildDeploymentRequestFromParts`) exists so the CLI does
 * not hand-roll this structure. Two of its defaults are decisions rather than
 * conveniences:
 *
 * **Selection mode follows the yard id.** Naming a yard means `exact` — you
 * asked for that one. Not naming one means `compatible-or-generate`, because
 * the alternative is failing a first deploy on a machine with no yards yet.
 *
 * **Only local hosts get a component-host list.** A cloud yard declares its own
 * substrate; asserting `["local", "wasm", "oci"]` on its behalf would match a
 * yard that cannot actually run those.
 */
import { describe, expect, it } from "vitest";

import {
	buildDeploymentRequestFromParts,
	parseBindleDeploymentRequest,
} from "../src/index.js";

const SCHEMA = "hobo.bindle-deployment-request/v1";

const resources = [
	{ resourceId: "api", port: "api", features: ["http"] },
] as never;

const request = (overrides: Record<string, unknown> = {}) => ({
	schemaVersion: SCHEMA,
	requestId: "req-1",
	bindleName: "shop",
	yard: { selectionMode: "compatible" },
	resources,
	...overrides,
});

const build = (overrides: Record<string, unknown> = {}) =>
	buildDeploymentRequestFromParts({
		bindleName: "shop",
		resources,
		...overrides,
	} as never);

describe("the provider-selection refusal", () => {
	it("refuses a bindle-level provider", () => {
		// Provider selection belongs to Yard placement. A Bindle that could name
		// its own cloud would make every placement policy advisory.
		expect(() =>
			parseBindleDeploymentRequest(request({ provider: "aws" })),
		).toThrow(/bindle-provider-selection-forbidden/u);
	});

	it("refuses the providerId spelling too", () => {
		expect(() =>
			parseBindleDeploymentRequest(request({ providerId: "aws" })),
		).toThrow(/bindle-provider-selection-forbidden/u);
	});

	it("refuses it even when the value is empty", () => {
		// The check is for the *key*: an empty provider is still an attempt to
		// decide placement at the wrong layer, and treating it as absent would
		// make the guard depend on the value.
		expect(() =>
			parseBindleDeploymentRequest(request({ provider: "" })),
		).toThrow(/bindle-provider-selection-forbidden/u);
	});

	it("tags the refusal with its own code", () => {
		// Callers distinguish this from a malformed request; a generic parse
		// error would be reported to the user as "bad input" rather than "that
		// belongs on the Yard".
		const error = (() => {
			try {
				parseBindleDeploymentRequest(request({ provider: "aws" }));
			} catch (err) {
				return err as { code?: string };
			}
			return null;
		})();
		expect(error?.code).toBe("bindle-provider-selection-forbidden");
	});

	it("says where the provider does belong", () => {
		expect(() =>
			parseBindleDeploymentRequest(request({ provider: "aws" })),
		).toThrow(/Yard placement request/u);
	});

	it("allows a provider inside the yard placement request", () => {
		// The same value, at the layer entitled to decide it.
		expect(() =>
			parseBindleDeploymentRequest(
				request({
					yard: {
						selectionMode: "compatible",
						requestedShape: { providerId: "aws" },
					},
				}),
			),
		).not.toThrow();
	});
});

describe("structural refusals", () => {
	it.each([
		null,
		undefined,
		7,
		"request",
		true,
	])("refuses the non-object input %s", (input) => {
		expect(() => parseBindleDeploymentRequest(input)).toThrow(TypeError);
	});

	it("refuses an array", () => {
		expect(() => parseBindleDeploymentRequest([])).toThrow(
			/must be an object/u,
		);
	});

	it("refuses an unknown schema version rather than migrating it", () => {
		// A request written against another version may mean something different
		// by the same field names.
		expect(() =>
			parseBindleDeploymentRequest(request({ schemaVersion: `${SCHEMA}x` })),
		).toThrow(/schemaVersion must be/u);
	});

	it("refuses a missing request id", () => {
		// The id correlates the whole placement saga; without it the decision
		// cannot be matched to what asked for it.
		expect(() =>
			parseBindleDeploymentRequest(request({ requestId: undefined })),
		).toThrow(/requestId required/u);
	});

	it("refuses an empty request id", () => {
		expect(() =>
			parseBindleDeploymentRequest(request({ requestId: "" })),
		).toThrow(/requestId required/u);
	});

	it("refuses a missing bindle name", () => {
		expect(() =>
			parseBindleDeploymentRequest(request({ bindleName: undefined })),
		).toThrow(/bindleName required/u);
	});

	it("refuses a request with no yard placement", () => {
		// Placement is the point; a request without it has nothing to decide.
		expect(() =>
			parseBindleDeploymentRequest(request({ yard: undefined })),
		).toThrow(/yard placement request required/u);
	});
});

describe("what the parse fills in", () => {
	it("derives a yard request id from the bindle request id", () => {
		// Correlating the two halves of one deploy is what makes an event log
		// readable; an unrelated id would break the trail.
		const parsed = parseBindleDeploymentRequest(request());
		expect(parsed.yard.requestId).toContain("req-1");
	});

	it("keeps an explicit yard request id", () => {
		const parsed = parseBindleDeploymentRequest(
			request({ yard: { selectionMode: "compatible", requestId: "yard-9" } }),
		);
		expect(parsed.yard.requestId).toBe("yard-9");
	});

	it("defaults generation to refused rather than permitted", () => {
		// Generating a Yard creates billable infrastructure; it has to be asked
		// for explicitly, not inherited from an absent field.
		expect(
			parseBindleDeploymentRequest(request()).yard.allowGenerationRequested,
		).toBe(false);
	});

	it("requires an exact true to permit generation", () => {
		// A truthy string must not unlock it.
		const truthy = parseBindleDeploymentRequest(
			request({
				yard: { selectionMode: "compatible", allowGenerationRequested: "yes" },
			}),
		);
		expect(truthy.yard.allowGenerationRequested).toBe(false);
	});

	it("permits generation when asked explicitly", () => {
		const parsed = parseBindleDeploymentRequest(
			request({
				yard: { selectionMode: "compatible", allowGenerationRequested: true },
			}),
		);
		expect(parsed.yard.allowGenerationRequested).toBe(true);
	});

	it("defaults empty requirement lists rather than leaving them undefined", () => {
		// Matching iterates these; undefined would throw before it could decide.
		const parsed = parseBindleDeploymentRequest(request());
		expect(parsed.bindleRequirements.require).toEqual([]);
		expect(parsed.bindleRequirements.prefer).toEqual([]);
		expect(parsed.bindleRequirements.runtimes).toEqual([]);
	});

	it("keeps the requirements it was given", () => {
		const parsed = parseBindleDeploymentRequest(
			request({
				bindleRequirements: {
					require: ["managed-postgres"],
					prefer: ["eu-region"],
					runtimes: ["wasm"],
					labels: { tier: "prod" },
				},
			}),
		);
		expect(parsed.bindleRequirements.require).toEqual(["managed-postgres"]);
		expect(parsed.bindleRequirements.labels).toEqual({ tier: "prod" });
	});

	it("defaults resources to an empty list rather than throwing", () => {
		// A Bindle with no resources is a valid, if empty, deploy.
		expect(
			parseBindleDeploymentRequest(request({ resources: undefined })).resources,
		).toEqual([]);
	});

	it("keeps a resource's declared features", () => {
		const parsed = parseBindleDeploymentRequest(request());
		expect(parsed.resources[0]?.features).toEqual(["http"]);
	});

	it("defaults a resource's features to empty", () => {
		const parsed = parseBindleDeploymentRequest(
			request({ resources: [{ resourceId: "api", port: "api" }] }),
		);
		expect(parsed.resources[0]?.features).toEqual([]);
	});

	it("omits a region a resource did not state", () => {
		// An empty region string would be matched against, and match nothing.
		const parsed = parseBindleDeploymentRequest(request());
		expect(parsed.resources[0]).not.toHaveProperty("region");
	});

	it("keeps a resource's region when stated", () => {
		const parsed = parseBindleDeploymentRequest(
			request({
				resources: [{ resourceId: "api", port: "api", region: "eu-west-1" }],
			}),
		);
		expect(parsed.resources[0]?.region).toBe("eu-west-1");
	});

	it("freezes the parsed request", () => {
		// It is carried through placement and into the event log; a mutable one
		// lets a later stage rewrite what was decided against.
		expect(Object.isFrozen(parseBindleDeploymentRequest(request()))).toBe(true);
	});

	it("freezes the yard placement inside it", () => {
		expect(Object.isFrozen(parseBindleDeploymentRequest(request()).yard)).toBe(
			true,
		);
	});
});

describe("buildDeploymentRequestFromParts", () => {
	it("produces a request the parser accepts", () => {
		// The builder exists so the CLI does not hand-roll this shape; a build
		// the parser would reject defeats the point.
		expect(() => parseBindleDeploymentRequest(build())).not.toThrow();
	});

	it("gives every build a distinct request id", () => {
		// Two deploys sharing an id would collide in the event log.
		expect(build().requestId).not.toBe(build().requestId);
	});

	it("correlates the yard request id with the bindle one", () => {
		const built = build();
		expect(built.yard.requestId).toContain(built.requestId);
	});

	it("asks for an exact yard when one is named", () => {
		// Naming a yard means that one; anything looser would silently place
		// elsewhere.
		expect(build({ yardId: "yard:a" }).yard.selectionMode).toBe("exact");
	});

	it("allows generation-or-compatible when no yard is named", () => {
		// The alternative is failing a first deploy on a machine with no yards.
		expect(build().yard.selectionMode).toBe("compatible-or-generate");
	});

	it("honours an explicit selection mode over both defaults", () => {
		expect(
			build({ yardId: "yard:a", selectionMode: "compatible" }).yard
				.selectionMode,
		).toBe("compatible");
	});

	it("carries a named yard through as the requested one", () => {
		expect(build({ yardId: "yard:a" }).yard.requestedYardId).toBe("yard:a");
	});

	it("declares local component hosts for a local deploy", () => {
		// A local yard has no manifest of its own to declare them.
		expect([...build().yard.requestedShape.componentHosts].sort()).toEqual([
			"local",
			"oci",
			"wasm",
		]);
	});

	it("sorts the component hosts, so the shape hashes deterministically", () => {
		// The requested shape is content-hashed and compared across processes;
		// preserving the caller's order would make two identical requests hash
		// differently.
		const hosts = [...build().yard.requestedShape.componentHosts];
		expect(hosts).toEqual([...hosts].sort());
	});

	it.each([
		"local",
		"@hobo/provider-local-host",
	])("treats %s as local", (providerId) => {
		expect(
			build({ providerId }).yard.requestedShape.componentHosts.length,
		).toBeGreaterThan(0);
	});

	it("declares no component hosts for a cloud provider", () => {
		// A cloud yard declares its own substrate; asserting local hosts on its
		// behalf would match a yard that cannot run them.
		expect(
			build({ providerId: "aws" }).yard.requestedShape.componentHosts,
		).toEqual([]);
	});

	it("puts the provider on the yard shape, not on the bindle", () => {
		// The same separation the parser enforces, honoured by the builder.
		const built = build({ providerId: "aws" }) as unknown as Record<
			string,
			unknown
		>;
		expect(built).not.toHaveProperty("provider");
		expect(built).not.toHaveProperty("providerId");
		expect(built.yard).toHaveProperty("requestedShape");
	});

	it("defaults generation to refused", () => {
		expect(build().yard.allowGenerationRequested).toBe(false);
	});

	it("permits generation when asked", () => {
		expect(build({ allowGeneration: true }).yard.allowGenerationRequested).toBe(
			true,
		);
	});

	it("defaults the objective to minimum cost", () => {
		// Someone deploying without stating an objective is not asking to spend
		// more than they have to.
		expect((build() as unknown as { objective?: string }).objective).toBe(
			"min-cost",
		);
	});

	it("honours a stated objective", () => {
		expect(
			(build({ objective: "min-latency" }) as unknown as { objective?: string })
				.objective,
		).toBe("min-latency");
	});

	it("defaults the owner tenant to local", () => {
		expect(
			(build() as unknown as { ownerTenantId?: string }).ownerTenantId,
		).toBe("local");
	});

	it("honours a stated owner tenant", () => {
		expect(
			(
				build({ ownerTenantId: "acme" }) as unknown as {
					ownerTenantId?: string;
				}
			).ownerTenantId,
		).toBe("acme");
	});

	it("derives a manifest hash from the bindle name when none is given", () => {
		// Something has to identify the manifest; an empty hash would compare
		// equal across every bindle.
		expect(build().manifestHash).toMatch(/^sha256:/u);
	});

	it("gives two differently named bindles different manifest hashes", () => {
		expect(build({ bindleName: "a" }).manifestHash).not.toBe(
			build({ bindleName: "b" }).manifestHash,
		);
	});

	it("carries the resources it was given", () => {
		expect(build().resources[0]?.resourceId).toBe("api");
	});
});
