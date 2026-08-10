/**
 * Consumer-driven contract verification for the yard boundary.
 *
 * `contracts/provider-railway-yard-boundary.pact.json` states what the yard
 * placement plane expects of this package. A pact nobody replays is a wish, so
 * this suite loads the file and drives the *real* `createRailwayProvider()`
 * through every interaction it records.
 *
 * There is no transport to fake. This provider makes no network call from
 * `src/`: its boundary is in-process, the interactions are messages, and the
 * only seam is the refusal that stands in for a temporary Environment Station
 * Railway does not offer.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	createRailwayProvider,
	provisionTemporaryEnvironmentStation,
	RAILWAY_REJECTED_CODE,
	RailwayInputRejectedError,
	TemporaryProvisionUnavailableError,
} from "../src/index.js";

type PactMessage = {
	readonly description: string;
	readonly request: {
		readonly type: string;
		readonly body: Record<string, unknown>;
	};
	readonly response: { readonly body: Record<string, unknown> };
};

type PactFile = {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly interactions: readonly PactMessage[];
};

/**
 * Parse the pact rather than trusting its shape: a suite that reads
 * `interactions[3].response.body` off an `unknown` fails three assertions
 * later with a property error instead of saying the pact is malformed.
 */
function loadPact(): PactFile {
	const decoded: unknown = JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL(
					"../contracts/provider-railway-yard-boundary.pact.json",
					import.meta.url,
				),
			),
			"utf8",
		),
	);
	if (typeof decoded !== "object" || decoded === null) {
		throw new Error("the pact file is not a JSON object");
	}
	const candidate = decoded as Partial<PactFile>;
	if (
		!Array.isArray(candidate.interactions) ||
		candidate.interactions.length === 0
	) {
		throw new Error("the pact file declares no interactions");
	}
	if (
		candidate.consumer?.name === undefined ||
		candidate.provider?.name === undefined
	) {
		throw new Error("the pact file is missing its consumer or provider name");
	}
	return candidate as PactFile;
}

const pact = loadPact();

function interaction(fragment: string): PactMessage {
	const found = pact.interactions.find((entry) =>
		entry.description.includes(fragment),
	);
	if (found === undefined) {
		throw new Error(
			`the pact has no interaction matching ${JSON.stringify(fragment)}`,
		);
	}
	return found;
}

function requestBody(fragment: string): Record<string, unknown> {
	return interaction(fragment).request.body;
}

function responseBody(fragment: string): Record<string, unknown> {
	return interaction(fragment).response.body;
}

/** Every recorded rejection carries the same code and names the offending field. */
function expectRejection(fragment: string, run: () => unknown): void {
	const expected = responseBody(fragment).error as {
		code: string;
		field: string;
	};
	expect(expected.code).toBe(RAILWAY_REJECTED_CODE);
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(RailwayInputRejectedError);
		expect((error as RailwayInputRejectedError).code).toBe(expected.code);
		expect((error as RailwayInputRejectedError).field).toBe(expected.field);
		return;
	}
	throw new Error(`${fragment} was expected to be rejected and was not`);
}

describe("the pact file itself", () => {
	it("names the yard boundary it describes", () => {
		expect(pact.consumer.name).toBe("hobo-yard-placement-plane");
		expect(pact.provider.name).toBe("ProviderRailwayYardBoundary");
		expect(
			pact.interactions.every((entry) => entry.request.type === "message"),
		).toBe(true);
	});
});

describe("descriptor and manifest, verified against the pact", () => {
	it("describes itself as the pact records", () => {
		const provider = createRailwayProvider();
		const expected = responseBody("describe the provider");

		expect(provider.id).toBe(expected.id);
		expect(provider.regions).toEqual(expected.regions);
		expect(provider.capabilities.map((capability) => capability.port)).toEqual(
			expected.ports,
		);
	});

	it("publishes the manifest the pact records, field for field", () => {
		const manifest = createRailwayProvider().capabilityManifest();

		expect(JSON.parse(JSON.stringify(manifest))).toEqual(
			responseBody("publish the capability manifest"),
		);
	});
});

describe("matching answers, verified against the pact", () => {
	function satisfiesFor(fragment: string) {
		const request = requestBody(fragment);
		const provider = createRailwayProvider();
		const capability = provider.capabilities.find(
			(entry) => entry.port === request.port,
		);
		// A port Railway does not realize has no capability object at all, and
		// the plane must still get "none" rather than an absent answer.
		return (
			capability?.satisfies({
				port: request.port as string,
				features: request.features as string[],
			}) ?? { kind: "none" as const }
		);
	}

	it("reports a full match when every requested feature is carried", () => {
		expect(
			satisfiesFor("whose features the equivalence class carries"),
		).toEqual(responseBody("whose features the equivalence class carries"));
	});

	it("names the missing feature on a partial match", () => {
		expect(satisfiesFor("a feature Railway does not carry")).toEqual(
			responseBody("a feature Railway does not carry"),
		);
	});

	it("reports none for a port that is not in the equivalence table", () => {
		expect(satisfiesFor("a port Railway does not realize")).toEqual(
			responseBody("a port Railway does not realize"),
		);
	});

	it("estimates cost as the unpriced signal the pact records", () => {
		const request = requestBody("estimate cost");
		const capability = createRailwayProvider().capabilities.find(
			(entry) => entry.port === request.port,
		);

		expect(capability?.estimateCost({ port: request.port as string })).toEqual(
			responseBody("estimate cost"),
		);
	});
});

describe("realize, verified against the pact", () => {
	it("emits the one-resource driver program the pact records", () => {
		const request = requestBody("realize a kv plan");
		const realized = createRailwayProvider().realize(
			request.plan as { name: string; port: string },
		);

		expect(JSON.parse(JSON.stringify(realized))).toEqual(
			responseBody("realize a kv plan"),
		);
	});

	it("rejects an unrealizable port at the parser", () => {
		const request = requestBody("reject a plan whose port");
		expectRejection("reject a plan whose port", () =>
			createRailwayProvider().realize(
				request.plan as { name: string; port: string },
			),
		);
	});

	it("rejects a plan name that could not become a DNS label", () => {
		const request = requestBody("reject a plan name");
		expectRejection("reject a plan name", () =>
			createRailwayProvider().realize(
				request.plan as { name: string; port: string },
			),
		);
	});
});

describe("client bindings, verified against the pact", () => {
	it("returns the resolved class plus the deploy outputs the pact records", () => {
		const request = requestBody("bind deploy outputs");
		const client = createRailwayProvider().client(
			request.port as string,
			request.outputs as Record<string, string>,
		);

		expect(JSON.parse(JSON.stringify(client))).toEqual(
			responseBody("bind deploy outputs"),
		);
	});

	it("rejects a binding value carrying a second line", () => {
		const request = requestBody("reject a deploy output");
		expectRejection("reject a deploy output", () =>
			createRailwayProvider().client(
				request.port as string,
				request.outputs as Record<string, string>,
			),
		);
	});
});

describe("temporary Environment Station, verified against the pact", () => {
	it("refuses with the recorded refusal instead of provisioning anything", async () => {
		const request = requestBody("refuse a temporary Environment Station");
		const expected = responseBody("refuse a temporary Environment Station");

		await expect(
			provisionTemporaryEnvironmentStation({
				stationId: request.stationId as string,
			}),
		).rejects.toSatisfy((error: unknown) => {
			if (!(error instanceof TemporaryProvisionUnavailableError)) return false;
			const { providerId, code, supportsAnonymousTemporaryDeploy } =
				error.refusal;
			return (
				providerId === expected.providerId &&
				code === expected.code &&
				supportsAnonymousTemporaryDeploy ===
					expected.supportsAnonymousTemporaryDeploy
			);
		});
	});
});
