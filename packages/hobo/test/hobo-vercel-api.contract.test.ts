/**
 * Consumer side of contracts/hobo-vercel-api.pact.json: the composed hobo's
 * two Vercel paths, run for real against the pact's mock provider.
 *
 * - The resolver plane (`vercelResolverRegistry`, what `compose.ts` builds for
 *   `HOBO_DEPLOY_RESOLVERS=1`) reconciles a project: a lookup that is a 404,
 *   then a create.
 * - The deploy provider's client (`createVercelClient`) creates a deployment
 *   and reads its id, url and readyState back; a deployment to a project
 *   nobody created is the 404 it surfaces.
 *
 * Every request must find its interaction (the mock answers anything else
 * with PACT_NO_INTERACTION) and carry the headers the pact declares. The
 * provider side is the mirror lane (`test/mirror/hobo-vercel-api.provider.mirror.test.ts`).
 */
import {
	createMockProviderFromPact,
	type PactInteraction,
	type PactRequest,
	type PactResponse,
	parsePactDocument,
	parseProviderStates,
	parseResponseMatchingRules,
} from "@hobo/contract-harness";
import type { HttpTransport, TransportResponse } from "@hobo/core";
import {
	VERCEL_PROJECT_PRODUCT_ID,
	vercelResolverRegistry,
} from "@hobo/provider-vercel";
import { describe, expect, it } from "vitest";

import pactJson from "../contracts/hobo-vercel-api.pact.json" with {
	type: "json",
};
import type { JsonValue } from "../src/json.js";
import { createVercelClient, type VercelFetch } from "../src/vercel-client.js";

const TOKEN = "hobo_pact_token";
const pact = parsePactDocument(pactJson);
const mock = createMockProviderFromPact(pact);
const exercised = new Set<string>();

function requestOf(
	method: string,
	url: string,
	headers: Readonly<Record<string, string>>,
	body: string | undefined,
): PactRequest {
	const parsed = new URL(url);
	const lower: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		lower[name.toLowerCase()] = value;
	}
	if (
		method !== "GET" &&
		method !== "POST" &&
		method !== "PUT" &&
		method !== "PATCH" &&
		method !== "DELETE"
	) {
		throw new Error(`the pact has no ${method} interaction`);
	}
	return {
		method,
		path: `${parsed.pathname}${parsed.search}`,
		headers: lower,
		...(body === undefined ? undefined : { body: JSON.parse(body) }),
	};
}

/** The mock's answer, after checking the request carried the headers its interaction declares. */
async function answer(request: PactRequest): Promise<PactResponse> {
	const response = await mock.handle(request);
	const interaction: PactInteraction | undefined = pact.interactions.find(
		(candidate) => candidate.response === response,
	);
	if (interaction === undefined) {
		throw new Error(
			`no interaction in hobo-vercel-api.pact.json answers ${request.method} ${request.path}`,
		);
	}
	for (const [name, value] of Object.entries(
		interaction.request.headers ?? {},
	)) {
		expect(request.headers?.[name], `${interaction.description}: ${name}`).toBe(
			value,
		);
	}
	exercised.add(interaction.description);
	return response;
}

const transport: HttpTransport = async (request) => {
	const response = await answer(
		requestOf(request.method, request.url, request.headers, request.body),
	);
	const reply: TransportResponse = {
		status: response.status,
		headers: response.headers ?? {},
		body: response.body === undefined ? "" : JSON.stringify(response.body),
	};
	return reply;
};

const fetchViaPact: VercelFetch = async (url, init) => {
	const response = await answer(
		requestOf(init.method, url, init.headers, init.body),
	);
	return {
		ok: response.status >= 200 && response.status < 300,
		status: response.status,
		text: async () => JSON.stringify(response.body ?? ""),
		// SAFETY: a pact body is parsed JSON, so it is a JSON value.
		json: async () => response.body as JsonValue,
	};
};

const files = [
	{ file: "index.html", data: "PGgxPmhvYm88L2gxPg==", encoding: "base64" },
] as const;

describe("hobo-vercel-api.pact.json, consumer side", () => {
	it("the resolver plane creates a project with the pact's lookup-then-create", async () => {
		const resolver = vercelResolverRegistry({
			resolveCredential: async () => TOKEN,
		}).get(VERCEL_PROJECT_PRODUCT_ID);

		const outcome = await resolver?.reconcile(
			{
				ref: {
					slot: "web",
					productId: VERCEL_PROJECT_PRODUCT_ID,
					logicalId: "hobo-pact-site",
				},
				desired: {},
				credentialRef: "hobo-token://vercel/deploy",
			},
			transport,
		);

		expect(outcome).toMatchObject({
			action: "create",
			physicalId: "prj_8b8788b1b182",
		});
	});

	it("the deploy client posts the pact's deployment and reads its id, url and readyState", async () => {
		const client = createVercelClient({ token: TOKEN, fetch: fetchViaPact });

		const result = await client.createDeployment({
			name: "hobo-pact-site",
			files,
			target: "production",
		});

		expect(result).toMatchObject({
			id: "dpl_d9f691d3c56a4bff",
			url: "https://hobo-pact-site-56affb.vercel.app",
			readyState: "QUEUED",
		});
	});

	it("a deployment to a project nobody created surfaces the provider's 404", async () => {
		const client = createVercelClient({ token: TOKEN, fetch: fetchViaPact });

		await expect(
			client.createDeployment({
				name: "hobo-pact-missing",
				files,
				target: "production",
			}),
		).rejects.toThrow(/HTTP 404.*not_found/u);
	});

	it("the pact parses through the shapes the harness's records admit", () => {
		// `cue vet` of the file against data-models/contract-harness.cue is not
		// run here; these are the same shapes, held by the TypeScript parsers and
		// by the closed key sets of #PactDocument, #PactInteraction,
		// #PactResponse and #PactMetadata.
		expect(Object.keys(pactJson).sort()).toEqual(
			["consumer", "interactions", "metadata", "provider"].sort(),
		);
		expect(
			Object.keys(pactJson.metadata).every((key) =>
				["pactSpecification", "verifiedAgainst"].includes(key),
			),
		).toBe(true);
		for (const interaction of pactJson.interactions) {
			expect(
				Object.keys(interaction).every((key) =>
					["description", "providerStates", "request", "response"].includes(
						key,
					),
				),
				interaction.description,
			).toBe(true);
			expect(
				Object.keys(interaction.response).every((key) =>
					["status", "headers", "body", "matchingRules"].includes(key),
				),
				interaction.description,
			).toBe(true);
		}
		expect(
			pact.interactions.map((interaction) =>
				interaction.providerStates?.map((state) => state.name),
			),
		).toEqual([
			["no project hobo-pact-site exists"],
			["no project hobo-pact-site exists"],
			["project hobo-pact-site exists"],
			["no project hobo-pact-missing exists"],
		]);
		expect(parseProviderStates(pactJson)).toHaveLength(4);
		expect(parseResponseMatchingRules(pactJson)).toHaveLength(4);
	});

	it("every interaction was exercised, and each generated id has a matching rule", () => {
		expect([...exercised].sort()).toEqual(
			pact.interactions.map((interaction) => interaction.description).sort(),
		);
		const rules = parseResponseMatchingRules(pactJson).flatMap((interaction) =>
			interaction.rules.map((rule) => rule.path),
		);
		expect(rules).toEqual(["$.id", "$.id", "$.url"]);
	});
});
