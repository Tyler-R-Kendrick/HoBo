/**
 * Provider side of contracts/hobo-vercel-api.pact.json, verified against the
 * mirror.cloud emulator (ADR-0174): each interaction is sent over real HTTP
 * with `Host: api.vercel.com`, and `verifyPact` reads what the emulator
 * answered. Before each, the provider state it names (Pact v3
 * `providerStates`) is set up through the emulator's own API, so the pact
 * verifies in any order: it is verified as written and reversed. Generated
 * ids are admitted only by the pact's own Pact v3 matching rules
 * (`responseMatchingRules`); every other declared field is compared by value.
 *
 * The consumer side is test/hobo-vercel-api.contract.test.ts (default lane).
 * This file's name keeps it out of the `.contract.test.ts` categories, which
 * must not need an emulator.
 */
import {
	createHttpProviderStub,
	exchangeHttp,
	mirrorLaneEndpoint,
	type PactJsonValue,
	type ProviderStateHandler,
	parseHttpProviderTarget,
	parsePactDocument,
	parseProviderStates,
	parseResponseMatchingRules,
	recordMirrorLaneReport,
	verifyPact,
} from "@hobo/contract-harness";
import { describe, expect, it } from "vitest";

import pactJson from "../../contracts/hobo-vercel-api.pact.json" with {
	type: "json",
};

const pact = parsePactDocument(pactJson);
const endpoint = mirrorLaneEndpoint(process.env);
const vercelApi = createHttpProviderStub(
	parseHttpProviderTarget({
		name: pact.provider.name,
		...endpoint,
		host: "api.vercel.com",
	}),
);

/** One call to the emulator's Vercel API, as the pact's consumer makes it. */
function vercel(
	method: "GET" | "POST" | "DELETE",
	path: string,
	body?: string,
) {
	return exchangeHttp(
		{ ...endpoint, host: "api.vercel.com" },
		{
			method,
			path,
			headers: {
				authorization: "Bearer hobo_pact_token",
				...(body === undefined
					? undefined
					: { "content-type": "application/json" }),
			},
			...(body === undefined ? undefined : { body }),
		},
	);
}

async function noProject(name: string): Promise<void> {
	const gone = await vercel("DELETE", `/v9/projects/${name}`);
	if (gone.status !== 204 && gone.status !== 404) {
		throw new Error(`DELETE /v9/projects/${name} answered ${gone.status}`);
	}
}

async function project(name: string): Promise<void> {
	const found = await vercel("GET", `/v9/projects/${name}`);
	if (found.status === 200) return;
	const made = await vercel("POST", "/v9/projects", JSON.stringify({ name }));
	if (made.status !== 200) {
		throw new Error(`POST /v9/projects answered ${made.status}`);
	}
}

/** How the emulator is put in each state the pact names. */
const stateHandlers = {
	"no project hobo-pact-site exists": () => noProject("hobo-pact-site"),
	"no project hobo-pact-missing exists": () => noProject("hobo-pact-missing"),
	"project hobo-pact-site exists": () => project("hobo-pact-site"),
} satisfies Readonly<Record<string, ProviderStateHandler>>;

/** Verify `document` (the pact, or a reordering of it) and leave its report for the runner. */
async function verifyAgainstEmulator(document: PactJsonValue, report: string) {
	const parsed = parsePactDocument(document);
	const outcome = await verifyPact(parsed, vercelApi, {
		responseMatchingRules: parseResponseMatchingRules(document),
		providerStates: parseProviderStates(document),
		stateHandlers,
	});
	recordMirrorLaneReport(process.env, report, {
		consumer: parsed.consumer.name,
		provider: parsed.provider.name,
		interactions: parsed.interactions.length,
		ok: outcome.ok,
		failures: outcome.failures,
	});
	return outcome;
}

describe("hobo-vercel-api.pact.json, provider side, against the emulator", () => {
	it("the emulator honours every interaction, each from the state it names", async () => {
		expect(await verifyAgainstEmulator(pactJson, "hobo-vercel-api")).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
	});

	it("verifies in reverse order too: no interaction leans on the one before it", async () => {
		const reversed = {
			...pactJson,
			interactions: [...pactJson.interactions].reverse(),
		};
		expect(
			await verifyAgainstEmulator(reversed, "hobo-vercel-api-reversed"),
		).toEqual({ providerName: "VercelApi", ok: true, failures: [] });
	});

	it("an interaction for a path the emulator does not serve fails verification with its 501", async () => {
		const unserved = parsePactDocument({
			consumer: pact.consumer,
			provider: pact.provider,
			interactions: [
				{
					description: "a route Vercel's document does not name",
					request: {
						method: "GET",
						path: "/v2/hobo-lane-not-a-route",
						headers: { authorization: "Bearer hobo_pact_token" },
					},
					response: { status: 200 },
				},
			],
			metadata: { pactSpecification: { version: "3.0.0" } },
		});

		const report = await verifyPact(unserved, vercelApi);

		expect(report).toEqual({
			providerName: "VercelApi",
			ok: false,
			failures: [
				{
					description: "a route Vercel's document does not name",
					reason: "status expected 200 but got 501",
				},
			],
		});
	});
});
