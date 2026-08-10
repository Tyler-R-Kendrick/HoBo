/**
 * No silent widening.
 *
 * Every case here asserts the same two-part rule: without an explicit policy
 * allowance the downgrade is a refusal, and with one it is still disclosed in
 * the offer. A permitted-but-hidden downgrade would be the worst of both.
 */
import { describe, expect, it } from "vitest";

import {
	buildDeploymentOffer,
	compileRecipe,
	findStandardRecipe,
	parseDeploymentRequest,
	parseSolutionRecipe,
	type RecipeCompilation,
	type RecipeSemantics,
	type SolutionRecipe,
	WIDENING_KINDS,
	type WideningKind,
} from "../src/index.js";
import {
	CATALOG,
	CATALOG_DIGEST,
	capabilityFor,
	catalogDigestOf,
	compileInputFor,
	NOW,
	PROFILE_REGISTRY_DIGEST,
	policyWith,
	requestForRecipe,
	SIGNER,
} from "./fixtures.js";

function requireRecipe(id: string): SolutionRecipe {
	const recipe = findStandardRecipe(id);
	if (recipe === undefined) throw new Error(`missing fixture recipe ${id}`);
	return recipe;
}

function kinds(compilation: RecipeCompilation): readonly WideningKind[] {
	return compilation.ok
		? compilation.widenings.map((notice) => notice.kind)
		: [];
}

function rejectionCodes(compilation: RecipeCompilation): readonly string[] {
	return compilation.rejections.map((rejection) => rejection.code);
}

const inbox = requireRecipe("recipe.cloudflare.claimable-webhook-inbox/v1");
const sqlApi = requireRecipe("recipe.cloudflare-neon.portable-sql-api/v1");
const leaderboard = requireRecipe(
	"recipe.cloudflare-upstash.live-leaderboard/v1",
);
const netlifyReport = requireRecipe(
	"recipe.netlify.claimable-generated-report/v1",
);
const issueTracker = requireRecipe(
	"recipe.vercel-prisma.claimable-issue-tracker/v1",
);
const convexCloud = requireRecipe("recipe.convex-cloud.sponsored-transfer/v1");
const neonSandbox = requireRecipe("recipe.neon.claimable-sql-sandbox/v1");

function semanticRequest(
	recipe: SolutionRecipe,
	requestedSemantics: RecipeSemantics,
): ReturnType<typeof parseDeploymentRequest> {
	const base = requestForRecipe(recipe);
	return parseDeploymentRequest({
		deploymentRef: base.deploymentRef,
		capabilities: base.capabilities,
		dependencies: base.dependencies,
		requestedSemantics,
	});
}

describe("semantic widening", () => {
	it("refuses a second claim when one was asked for, and discloses it when allowed", () => {
		const request = semanticRequest(sqlApi, {
			...sqlApi.delivers,
			claimCount: 1,
		});
		const refused = compileRecipe(compileInputFor(sqlApi, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("CLAIM_MODE_INSUFFICIENT");

		const allowed = compileRecipe(
			compileInputFor(sqlApi, {
				request,
				policy: policyWith({ allowedWidenings: ["claim.single-to-multiple"] }),
			}),
		);
		expect(kinds(allowed)).toEqual(["claim.single-to-multiple"]);
	});

	it("refuses a sponsor migration when a provider-native claim was asked for", () => {
		const request = semanticRequest(convexCloud, {
			...convexCloud.delivers,
			claimKind: "provider-native",
			bootstrap: "public-anonymous",
		});
		const policy = policyWith({ maximumSponsoredCostMinorUnits: 1000 });
		const refused = compileRecipe(
			compileInputFor(convexCloud, { request, policy }),
		);
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("BOOTSTRAP_POLICY_DENIED");

		const allowed = compileRecipe(
			compileInputFor(convexCloud, {
				request,
				policy: policyWith({
					maximumSponsoredCostMinorUnits: 1000,
					allowedWidenings: [
						"bootstrap.public-anonymous-to-sponsored",
						"claim.provider-native-to-sponsor-migration",
					],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual([
			"bootstrap.public-anonymous-to-sponsored",
			"claim.provider-native-to-sponsor-migration",
		]);
	});

	it("refuses ephemeral state when persistence was asked for", () => {
		const request = semanticRequest(netlifyReport, {
			...netlifyReport.delivers,
			persistence: "persistent",
		});
		const refused = compileRecipe(compileInputFor(netlifyReport, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("PERSISTENCE_REQUIRED");

		const allowed = compileRecipe(
			compileInputFor(netlifyReport, {
				request,
				policy: policyWith({
					allowedWidenings: ["persistence.persistent-to-ephemeral"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["persistence.persistent-to-ephemeral"]);
	});

	it("refuses polling when a WebSocket was asked for", () => {
		const request = semanticRequest(leaderboard, {
			...leaderboard.delivers,
			realtime: "websocket",
		});
		const refused = compileRecipe(compileInputFor(leaderboard, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("WEBSOCKET_REQUIRED");

		const allowed = compileRecipe(
			compileInputFor(leaderboard, {
				request,
				policy: policyWith({
					allowedWidenings: ["realtime.websocket-to-polling"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["realtime.websocket-to-polling"]);
	});

	it("refuses plaintext credentials when secret-ref custody was asked for", () => {
		const plaintext = parseSolutionRecipe({
			...inbox,
			id: "recipe.test.plaintext-inbox/v1",
			delivers: { ...inbox.delivers, credentialCustody: "plaintext" },
		});
		const request = semanticRequest(plaintext, inbox.delivers);
		const refused = compileRecipe(compileInputFor(plaintext, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("SECRET_CUSTODY_UNAVAILABLE");

		const allowed = compileRecipe(
			compileInputFor(plaintext, {
				request,
				policy: policyWith({
					allowedWidenings: ["credential.secret-ref-to-plaintext"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["credential.secret-ref-to-plaintext"]);
	});

	it("refuses spending sponsor budget when a public-anonymous bootstrap was asked for", () => {
		const request = semanticRequest(issueTracker, {
			...issueTracker.delivers,
			bootstrap: "public-anonymous",
		});
		const policy = policyWith({ maximumSponsoredCostMinorUnits: 500 });
		const refused = compileRecipe(
			compileInputFor(issueTracker, { request, policy }),
		);
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("BOOTSTRAP_POLICY_DENIED");

		const allowed = compileRecipe(
			compileInputFor(issueTracker, {
				request,
				policy: policyWith({
					maximumSponsoredCostMinorUnits: 500,
					allowedWidenings: ["bootstrap.public-anonymous-to-sponsored"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["bootstrap.public-anonymous-to-sponsored"]);
	});
});

describe("profile widening", () => {
	it("refuses generic relational storage when PostgreSQL was asked for", () => {
		const generic = parseSolutionRecipe({
			...neonSandbox,
			id: "recipe.test.generic-relational-sandbox/v1",
			placements: neonSandbox.placements.map((placement) => ({
				...placement,
				satisfiesProfileId: "data.relational/v1",
			})),
		});
		const request = parseDeploymentRequest({
			deploymentRef: "junction/generic-relational",
			capabilities: [capabilityFor("db", "data.postgres/v1")],
			requestedSemantics: generic.delivers,
		});
		const refused = compileRecipe(compileInputFor(generic, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("PROFILE_INCOMPATIBLE");

		const allowed = compileRecipe(
			compileInputFor(generic, {
				request,
				policy: policyWith({
					allowedWidenings: ["profile.postgres-to-generic-relational"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["profile.postgres-to-generic-relational"]);
	});

	it("refuses a plain key/value promise when a Redis-compatible store was asked for", () => {
		const weakened = parseSolutionRecipe({
			...leaderboard,
			id: "recipe.test.weakened-leaderboard/v1",
			placements: leaderboard.placements.map((placement) =>
				placement.placementId === "board"
					? { ...placement, satisfiesProfileId: "kv.key-value/v1" }
					: placement,
			),
		});
		const request = parseDeploymentRequest({
			deploymentRef: "junction/weakened-leaderboard",
			capabilities: [
				capabilityFor("api", "api.http/v1", {
					runtime: { allowed: ["serverless_faas"] },
				}),
				capabilityFor("board", "kv.redis-compatible/v1"),
			],
			dependencies: [{ fromCapabilityRef: "api", toCapabilityRef: "board" }],
			requestedSemantics: leaderboard.delivers,
		});
		const refused = compileRecipe(compileInputFor(weakened, { request }));
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("PROFILE_INCOMPATIBLE");

		const allowed = compileRecipe(
			compileInputFor(weakened, {
				request,
				policy: policyWith({ allowedWidenings: ["profile.weakened"] }),
			}),
		);
		expect(kinds(allowed)).toEqual(["profile.weakened"]);
		expect(
			allowed.ok
				? allowed.widenings.map((notice) => notice.placementId)
				: undefined,
		).toEqual(["board"]);
	});
});

describe("realization widening", () => {
	const packCatalog = CATALOG.map((candidate) =>
		candidate.definitionId === "neon.claimable-postgres/v1"
			? {
					...candidate,
					implementsProfiles: candidate.implementsProfiles.map(
						(implementation) => ({
							...implementation,
							realization: "pack" as const,
						}),
					),
				}
			: candidate,
	);
	const bridgeCatalog = CATALOG.map((candidate) =>
		candidate.definitionId === "neon.claimable-postgres/v1"
			? {
					...candidate,
					implementsProfiles: candidate.implementsProfiles.map(
						(implementation) => ({
							...implementation,
							realization: "bridge" as const,
						}),
					),
				}
			: candidate,
	);

	function sandboxRequest(realization: {
		readonly allowNative?: boolean;
		readonly allowPack?: boolean;
		readonly allowBridge?: boolean;
	}): ReturnType<typeof parseDeploymentRequest> {
		return parseDeploymentRequest({
			deploymentRef: "junction/realization",
			capabilities: [capabilityFor("db", "data.postgres/v1", { realization })],
			requestedSemantics: neonSandbox.delivers,
		});
	}

	it("refuses a pack realization where a native one was allowed", () => {
		const request = sandboxRequest({ allowNative: true, allowPack: true });
		const refused = compileRecipe(
			compileInputFor(neonSandbox, {
				request,
				catalog: packCatalog,
				catalogDigest: catalogDigestOf(packCatalog),
			}),
		);
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("REALIZATION_DENIED");

		const allowed = compileRecipe(
			compileInputFor(neonSandbox, {
				request,
				catalog: packCatalog,
				catalogDigest: catalogDigestOf(packCatalog),
				policy: policyWith({
					allowedWidenings: ["realization.native-to-pack"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["realization.native-to-pack"]);
	});

	it("refuses a bridge realization where a pack was the weakest allowed", () => {
		const request = sandboxRequest({
			allowNative: false,
			allowPack: true,
			allowBridge: true,
		});
		const refused = compileRecipe(
			compileInputFor(neonSandbox, {
				request,
				catalog: bridgeCatalog,
				catalogDigest: catalogDigestOf(bridgeCatalog),
			}),
		);
		expect(refused.ok).toBe(false);
		expect(rejectionCodes(refused)).toContain("REALIZATION_DENIED");

		const allowed = compileRecipe(
			compileInputFor(neonSandbox, {
				request,
				catalog: bridgeCatalog,
				catalogDigest: catalogDigestOf(bridgeCatalog),
				policy: policyWith({
					allowedWidenings: ["realization.pack-to-bridge"],
				}),
			}),
		);
		expect(kinds(allowed)).toEqual(["realization.pack-to-bridge"]);
	});
});

describe("disclosure", () => {
	it("puts every permitted widening in the offer", () => {
		const request = semanticRequest(leaderboard, {
			...leaderboard.delivers,
			realtime: "websocket",
			claimCount: 1,
		});
		const compilation = compileRecipe(
			compileInputFor(leaderboard, {
				request,
				policy: policyWith({
					allowedWidenings: [
						"claim.single-to-multiple",
						"realtime.websocket-to-polling",
					],
				}),
			}),
		);
		if (!compilation.ok)
			throw new Error("expected the permitted widenings to compile");
		const offer = buildDeploymentOffer({
			compilation,
			recipe: leaderboard,
			request,
			catalogDigest: CATALOG_DIGEST,
			profileRegistryDigest: PROFILE_REGISTRY_DIGEST,
			issuedAtMs: NOW,
			signer: SIGNER,
		});
		expect(offer.degradationNotices.map((notice) => notice.kind)).toEqual([
			"claim.single-to-multiple",
			"realtime.websocket-to-polling",
		]);
	});

	it("covers every declared widening kind with a test", () => {
		// A new kind added without a case here is the silent widening this
		// module exists to prevent.
		expect([...WIDENING_KINDS].sort()).toEqual([
			"bootstrap.public-anonymous-to-sponsored",
			"claim.provider-native-to-sponsor-migration",
			"claim.single-to-multiple",
			"credential.secret-ref-to-plaintext",
			"persistence.persistent-to-ephemeral",
			"profile.postgres-to-generic-relational",
			"profile.weakened",
			"realization.native-to-pack",
			"realization.pack-to-bridge",
			"realtime.websocket-to-polling",
		]);
	});
});
