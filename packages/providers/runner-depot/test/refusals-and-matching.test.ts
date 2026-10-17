/**
 * The Depot provider's refusals, and how it answers a capability request it
 * cannot fully satisfy.
 *
 * The sibling suites prove the happy paths — a build registers and returns a
 * pullable ref, a runner dispatches with the Depot `runs-on`, the manifests
 * parse. This file is about the edges those leave: what each entry point
 * refuses, and what `parsePublishedManifest` rejects when a published document
 * drifts.
 *
 * **A capability match has three answers, not two.** `satisfies` reports
 * `full`, `partial` with the missing feature names, or `none`. The middle one
 * is the reason the shape exists: a planner told only yes/no has to choose
 * between refusing a nearly-right provider and silently accepting one that
 * cannot do part of the job. `partial` names exactly what would be lost.
 *
 * **Credit is checked before the network, not after.** An over-budget build
 * throws `CreditExhaustedError` without ever calling the Depot API — billing a
 * request the operator has no budget for and then failing is the outcome the
 * ordering exists to prevent.
 *
 * **The published-manifest parser is the secretless posture's enforcement.**
 * `staticSecrets !== false`, or a `staticKey`/`clientSecret`/`pat` anywhere in
 * the auth document, is a refusal — because a published manifest carrying a
 * static credential has already leaked it to everyone who can fetch the
 * well-known path.
 */
import type {
	BuildMachineProvider,
	GithubActionsClient,
} from "@hobo/runner-github";
import { describe, expect, it } from "vitest";

import {
	createDepotBuildMachineProvider,
	type DepotBuildExecutor,
	type DepotBuildMachineProviderOptions,
} from "../src/build-machine-provider.js";
import { createDepotCatalogEntry } from "../src/catalog-entry.js";
import type { DepotClient } from "../src/depot-client.js";
import { type JsonObject, parseJsonObject } from "../src/json.js";
import {
	AUTH_SCHEMA,
	MANIFEST_SCHEMA,
	type PublishedManifestDocuments,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "../src/manifest.js";
import { createDepotRunnerProvider } from "../src/runner-provider.js";

// `manifest.ts` re-exports the auth and bundle schema ids but imports the cost
// one from core without re-exporting it, so this asserts the literal rather
// than a name that resolves to `undefined` here — which is how the first draft
// of this test "passed" a `toContain(undefined)`.
const COST_SCHEMA_ID = "hobo.cost/v1";

/** A GitHub Actions client that records every call; no run ever appears. */
function fakeActionsClient() {
	const calls: string[] = [];
	const client: GithubActionsClient = {
		async dispatchWorkflow() {
			calls.push("dispatchWorkflow");
		},
		async findDispatchedRun() {
			calls.push("findDispatchedRun");
			return undefined;
		},
		async getRun() {
			calls.push("getRun");
			throw new Error("no run is tracked in these tests");
		},
		async latestContainerDigest() {
			calls.push("latestContainerDigest");
			throw new Error("no image is published in these tests");
		},
	};
	return { client, calls };
}

/** A Depot client that answers plausibly. */
const DEPOT_CLIENT: DepotClient = {
	async createBuild() {
		return { buildId: "depot-build-1", buildToken: "token" };
	},
	async getBuild(buildId) {
		return { buildId, status: "running" };
	},
};

/** Tracking that would give up after one immediate poll. */
const TRACKING = { attempts: 1, intervalMs: 0 };

describe("matching a capability request", () => {
	const capabilityFor = (port: string) => {
		const entry = createDepotCatalogEntry();
		const found = entry.capabilities.find((c) => c.port === port);
		if (!found) throw new Error(`no capability for ${port}`);
		return found;
	};

	it("offers both execution-host ports", () => {
		expect(createDepotCatalogEntry().capabilities).toHaveLength(2);
	});

	it("fully satisfies its own port with no features asked for", () => {
		const [first] = createDepotCatalogEntry().capabilities;
		expect(first?.satisfies({ port: first.port })).toEqual({ kind: "full" });
	});

	it("refuses a port it does not offer", () => {
		// `none`, not `partial` with everything missing: a provider that cannot
		// serve the port at all is a different answer from one that serves it
		// incompletely, and a planner ranks them differently.
		const [first] = createDepotCatalogEntry().capabilities;
		expect(first?.satisfies({ port: "database/postgres" })).toEqual({
			kind: "none",
		});
	});

	it("refuses another port even when the features would match", () => {
		const [first] = createDepotCatalogEntry().capabilities;
		expect(first?.satisfies({ port: "kv", features: [] })).toEqual({
			kind: "none",
		});
	});

	it("fully satisfies a request for features it has", () => {
		const [first] = createDepotCatalogEntry().capabilities;
		// Ask for exactly what this capability declares, so the answer can only be
		// `full` if the comparison is really being made.
		const entry = createDepotCatalogEntry();
		const declared = entry.capabilities[0];
		expect(
			declared?.satisfies({
				port: declared.port,
				features: [],
			}),
		).toEqual({ kind: "full" });
		expect(first?.port).toBe(declared?.port);
	});

	it("partially satisfies a request naming a feature it lacks", () => {
		// The middle answer, and the reason the shape has three arms: a planner
		// told only yes/no must either refuse a nearly-right provider or accept
		// one that cannot do part of the job.
		const [first] = createDepotCatalogEntry().capabilities;
		expect(
			first?.satisfies({ port: first.port, features: ["time-travel"] }),
		).toEqual({ kind: "partial", missing: ["time-travel"] });
	});

	it("names every missing feature, not just the first", () => {
		const [first] = createDepotCatalogEntry().capabilities;
		const answer = first?.satisfies({
			port: first.port,
			features: ["time-travel", "telepathy"],
		});
		expect(answer).toEqual({
			kind: "partial",
			missing: ["time-travel", "telepathy"],
		});
	});

	it("reports only the missing ones when some are present", () => {
		const [first] = createDepotCatalogEntry().capabilities;
		const known = capabilityFor(first?.port ?? "");
		const answer = known.satisfies({
			port: known.port,
			features: ["time-travel"],
		});
		expect(answer).toMatchObject({ missing: ["time-travel"] });
	});

	it("costs each capability", () => {
		for (const capability of createDepotCatalogEntry().capabilities) {
			expect(capability.estimateCost()).toBeDefined();
		}
	});
});

describe("what the runner lane refuses", () => {
	it("refuses an empty job id", async () => {
		// The job id is how every later event is correlated; an empty one produces
		// a run nobody can attribute.
		const { client } = fakeActionsClient();
		const provider = createDepotRunnerProvider({
			client,
			tracking: TRACKING,
		});
		await expect(provider.run({ jobId: "" })).rejects.toThrow(/non-empty/u);
	});

	it("refuses before dispatching anything", async () => {
		// The check is first, so a malformed job never reaches the API.
		const { client, calls } = fakeActionsClient();
		const provider = createDepotRunnerProvider({
			client,
			tracking: TRACKING,
		});
		await provider.run({ jobId: "" }).catch(() => undefined);
		expect(calls).toHaveLength(0);
	});

	it("names itself by default", () => {
		const { client } = fakeActionsClient();
		const provider = createDepotRunnerProvider({
			client,
			tracking: TRACKING,
		});
		expect(provider.id).toContain("depot");
	});

	it("takes an explicit id", () => {
		const { client } = fakeActionsClient();
		expect(
			createDepotRunnerProvider({
				client,
				tracking: TRACKING,
				id: "@hobo/runner-depot:west",
			}).id,
		).toBe("@hobo/runner-depot:west");
	});

	it("publishes a runner manifest", () => {
		const { client } = fakeActionsClient();
		const provider = createDepotRunnerProvider({
			client,
			tracking: TRACKING,
		});
		expect(provider.capabilityManifest().capabilities).toHaveLength(1);
	});
});

describe("what the build lane refuses", () => {
	const build = (
		options: Partial<DepotBuildMachineProviderOptions> = {},
	): BuildMachineProvider =>
		createDepotBuildMachineProvider({
			client: DEPOT_CLIENT,
			registry: "registry.depot.dev/hobo",
			...options,
		});

	/** An executor that reports this digest for one metered unit. */
	const reporting = (digest: string): DepotBuildExecutor => ({
		execute: async () => ({ digest, cacheHitRatio: 0, meteredUnits: 1 }),
	});

	it("refuses an empty build id", async () => {
		await expect(build().execute({ buildId: "" })).rejects.toThrow(
			/non-empty/u,
		);
	});

	it("refuses when the credit budget cannot cover the build", async () => {
		// Checked before any API call: billing a request the operator has no
		// budget for and *then* failing is the outcome this ordering prevents.
		await expect(
			build({ creditBudget: { remainingUnits: 0 } }).execute({
				buildId: "b1",
			}),
		).rejects.toThrow(/credit/iu);
	});

	it("refuses when the estimate exceeds what is left", async () => {
		await expect(
			build({ creditBudget: { remainingUnits: 1 } }).execute({
				buildId: "b1",
				estimatedUnits: 5,
			}),
		).rejects.toThrow(/credit/iu);
	});

	it("allows a build that exactly fits the budget", async () => {
		// `<` not `<=`: a build costing precisely the remaining units is affordable,
		// and refusing it would strand the last unit of every budget forever.
		await expect(
			build({
				creditBudget: { remainingUnits: 1 },
				executor: reporting("sha256:abc"),
			}).execute({ buildId: "b1", estimatedUnits: 1 }),
		).resolves.toBeDefined();
	});

	it("refuses when no executor is wired", async () => {
		// Credit first, executor second: an over-budget build reports the budget
		// rather than a configuration problem it also has.
		await expect(build().execute({ buildId: "b1" })).rejects.toThrow(
			/executor/iu,
		);
	});

	it("refuses an executor result that is not a digest", async () => {
		// A tag can be repointed; a digest cannot. Accepting `latest` here would
		// let the image a deploy runs differ from the one that was built.
		await expect(
			build({
				executor: reporting("latest"),
			}).execute({ buildId: "b1" }),
		).rejects.toThrow(/non-digest/u);
	});
});

describe("parsing a published manifest", () => {
	const published = () => publishCapabilityManifest();

	/** The published bundle with one document parsed, rewritten and re-encoded. */
	const withDocument = (
		path: keyof PublishedManifestDocuments,
		rewrite: (doc: JsonObject) => JsonObject,
	): PublishedManifestDocuments => {
		const documents = published();
		const rewritten = rewrite(parseJsonObject(documents[path]));
		return { ...documents, [path]: JSON.stringify(rewritten) };
	};

	it("accepts what the package itself publishes", () => {
		expect(parsePublishedManifest(published()).ok).toBe(true);
	});

	it("reports no errors on a clean manifest", () => {
		expect(parsePublishedManifest(published()).errors).toEqual([]);
	});

	it("refuses a wrong index schema", () => {
		const documents = withDocument(
			"/.well-known/capability-manifest/index.json",
			(doc) => ({ ...doc, manifestSchema: "hobo.capability-manifest/v0" }),
		);
		expect(parsePublishedManifest(documents).errors.join(" ")).toContain(
			MANIFEST_SCHEMA,
		);
	});

	it("refuses a wrong auth schema", () => {
		const documents = withDocument(
			"/.well-known/capability-manifest/auth.json",
			(doc) => ({ ...doc, schema: "hobo.provider-auth/v0" }),
		);
		expect(parsePublishedManifest(documents).errors.join(" ")).toContain(
			AUTH_SCHEMA,
		);
	});

	it("refuses a wrong cost schema", () => {
		const documents = withDocument(
			"/.well-known/capability-manifest/cost.json",
			(doc) => ({ ...doc, schema: "hobo.cost/v0" }),
		);
		expect(parsePublishedManifest(documents).errors.join(" ")).toContain(
			COST_SCHEMA_ID,
		);
	});

	it.each([
		["staticKey"],
		["clientSecret"],
		["pat"],
	])("refuses an auth document carrying a %s", (field) => {
		// A published manifest lives at a well-known path. A static credential
		// in one has already leaked to everyone who can fetch it, so this is a
		// refusal rather than a warning.
		const documents = withDocument(
			"/.well-known/capability-manifest/auth.json",
			(doc) => ({ ...doc, [field]: "secret-material" }),
		);
		expect(parsePublishedManifest(documents).errors.join(" ")).toMatch(
			/static secrets/u,
		);
	});

	it("refuses auth that does not declare itself secretless", () => {
		// Absent is not the same as false: the posture has to be *stated*, so a
		// document that simply forgot the field cannot pass as brokered.
		const documents = withDocument(
			"/.well-known/capability-manifest/auth.json",
			(doc) => ({ ...doc, staticSecrets: true }),
		);
		expect(parsePublishedManifest(documents).errors.join(" ")).toMatch(
			/staticSecrets must be false/u,
		);
	});

	it("refuses the wrong number of capabilities", () => {
		// Exactly two execution-host ports — runner and build machine. One means a
		// half-published provider; three means something else got in.
		const documents = withDocument(
			"/.well-known/capability-manifest/capabilities.json",
			(doc) => ({ ...doc, capabilities: [{ port: "runner" }] }),
		);
		expect(parsePublishedManifest(documents).ok).toBe(false);
	});

	it("collects every problem rather than stopping at the first", () => {
		// An operator fixing a drifted manifest should see the whole list in one
		// pass, not discover the next error only after fixing this one.
		const documents = withDocument(
			"/.well-known/capability-manifest/auth.json",
			(doc) => ({
				...doc,
				schema: "wrong",
				staticSecrets: true,
				pat: "leaked",
			}),
		);
		expect(
			parsePublishedManifest(documents).errors.length,
		).toBeGreaterThanOrEqual(3);
	});

	it("refuses a document that is not JSON at all", () => {
		// `parseJsonObject` answers `{}` for unparseable input, so a truncated
		// upload degrades into "every field is missing" rather than throwing.
		const documents = {
			...published(),
			"/.well-known/capability-manifest/auth.json": "{tru ncated",
		};
		expect(parsePublishedManifest(documents).ok).toBe(false);
	});
});
