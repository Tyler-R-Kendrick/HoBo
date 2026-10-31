/**
 * Provider side of contracts/hobo-vercel-api.pact.json, verified against the
 * mirror.cloud emulator (ADR-0174): each interaction is sent over real HTTP,
 * in order, with `Host: api.vercel.com`, and `verifyPact` reads what the
 * emulator answered. Generated ids are admitted only by the pact's own Pact v3
 * matching rules (`responseMatchingRules`); every other declared field is
 * compared by value.
 *
 * The consumer side is test/hobo-vercel-api.contract.test.ts (default lane).
 * This file's name keeps it out of the `.contract.test.ts` categories, which
 * must not need an emulator.
 */
import {
	createHttpProviderStub,
	exchangeHttp,
	mirrorLaneEndpoint,
	parseHttpProviderTarget,
	parsePactDocument,
	parseResponseMatchingRules,
	recordMirrorLaneReport,
	verifyPact,
} from "@hobo/contract-harness";
import { beforeAll, describe, expect, it } from "vitest";

import pactJson from "../../contracts/hobo-vercel-api.pact.json" with {
	type: "json",
};

const pact = parsePactDocument(pactJson);
const endpoint = mirrorLaneEndpoint(process.env);
const responseMatchingRules = parseResponseMatchingRules(pactJson);
const vercelApi = createHttpProviderStub(
	parseHttpProviderTarget({
		name: pact.provider.name,
		...endpoint,
		host: "api.vercel.com",
	}),
);

describe("hobo-vercel-api.pact.json, provider side, against the emulator", () => {
	beforeAll(async () => {
		// Provider state: neither project exists (the pact's metadata says so).
		for (const name of ["hobo-pact-site", "hobo-pact-missing"]) {
			const gone = await exchangeHttp(
				{ ...endpoint, host: "api.vercel.com" },
				{
					method: "DELETE",
					path: `/v9/projects/${name}`,
					headers: { authorization: "Bearer hobo_pact_token" },
				},
			);
			expect([204, 404]).toContain(gone.status);
		}
	});

	it("the emulator honours every interaction, in order", async () => {
		const report = await verifyPact(pact, vercelApi, { responseMatchingRules });

		recordMirrorLaneReport(process.env, "hobo-vercel-api", {
			consumer: pact.consumer.name,
			provider: pact.provider.name,
			interactions: pact.interactions.length,
			ok: report.ok,
			failures: report.failures,
		});
		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
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
