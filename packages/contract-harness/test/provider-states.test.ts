/**
 * Pact v3 provider states (src/provider-states.ts): each interaction names the
 * state the provider must be in ("Allow multiple provider states with
 * parameters", https://github.com/pact-foundation/pact-specification/tree/version-3),
 * and `verifyPact` sets each up before its interaction, so a pact verifies in
 * any order rather than only in the order its author wrote.
 */
import { describe, expect, it } from "vitest";

import type { PactJsonValue } from "../src/matching.js";
import { parsePactDocument } from "../src/pact.js";
import {
	ProviderStateError,
	parseProviderStates,
} from "../src/provider-states.js";
import { type ProviderStub, verifyPact } from "../src/verify.js";

const NO_PROJECT = "no project hobo-site exists";
const PROJECT = "project hobo-site exists";

function interactions(): PactJsonValue[] {
	return [
		{
			description: "a project nobody created is a 404",
			providerStates: [{ name: NO_PROJECT }],
			request: { method: "GET", path: "/v9/projects/hobo-site" },
			response: { status: 404 },
		},
		{
			description: "create the project",
			providerStates: [{ name: NO_PROJECT }],
			request: {
				method: "POST",
				path: "/v9/projects",
				body: { name: "hobo-site" },
			},
			response: { status: 200, body: { name: "hobo-site" } },
		},
		{
			description: "read the project",
			providerStates: [{ name: PROJECT, params: { framework: "astro" } }],
			request: { method: "GET", path: "/v9/projects/hobo-site" },
			response: {
				status: 200,
				body: { name: "hobo-site", framework: "astro" },
			},
		},
	];
}

function document(list: readonly PactJsonValue[]): PactJsonValue {
	return {
		consumer: { name: "TestConsumer" },
		provider: { name: "VercelApi" },
		interactions: [...list],
		metadata: { pactSpecification: { version: "3.0.0" } },
	};
}

/** A provider with state: projects live in a map the handlers also reach. */
interface StatefulVercel {
	readonly stub: ProviderStub;
	readonly projects: Map<string, string | null>;
}

function vercel(): StatefulVercel {
	const projects = new Map<string, string | null>();
	return {
		projects,
		stub: {
			name: "VercelApi",
			handle: (request) => {
				if (request.method === "POST") {
					if (projects.has("hobo-site")) return { status: 409 };
					projects.set("hobo-site", null);
					return { status: 200, body: { name: "hobo-site" } };
				}
				return projects.has("hobo-site")
					? {
							status: 200,
							body: {
								name: "hobo-site",
								framework: projects.get("hobo-site") ?? null,
							},
						}
					: { status: 404 };
			},
		},
	};
}

async function verifyWithStates(list: readonly PactJsonValue[]) {
	const raw = document(list);
	const provider = vercel();
	const seen: string[] = [];
	const report = await verifyPact(parsePactDocument(raw), provider.stub, {
		providerStates: parseProviderStates(raw),
		stateHandlers: {
			[NO_PROJECT]: () => {
				seen.push(NO_PROJECT);
				provider.projects.delete("hobo-site");
			},
			[PROJECT]: async (params) => {
				seen.push(`${PROJECT} ${JSON.stringify(params)}`);
				provider.projects.set(
					"hobo-site",
					params.framework === undefined ? null : String(params.framework),
				);
			},
		},
	});
	return { report, seen };
}

describe("verifyPact with provider states", () => {
	it("sets up each interaction's state before it, with its params", async () => {
		const { report, seen } = await verifyWithStates(interactions());
		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
		expect(seen).toEqual([
			NO_PROJECT,
			NO_PROJECT,
			`${PROJECT} {"framework":"astro"}`,
		]);
	});

	it("verifies the interactions in reverse order too", async () => {
		const { report } = await verifyWithStates([...interactions()].reverse());
		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
	});

	it("without the states, the reversed pact fails: the order was all that held it", async () => {
		const raw = document([...interactions()].reverse());
		const report = await verifyPact(parsePactDocument(raw), vercel().stub);
		expect(report.ok).toBe(false);
	});

	it("fails an interaction whose state has no handler, and does not send it", async () => {
		const raw = document(interactions());
		const provider = vercel();
		const asked: string[] = [];
		const report = await verifyPact(
			parsePactDocument(raw),
			{
				name: "VercelApi",
				handle: (request) => {
					asked.push(`${request.method} ${request.path}`);
					return provider.stub.handle(request);
				},
			},
			{
				providerStates: parseProviderStates(raw),
				stateHandlers: { [NO_PROJECT]: () => provider.projects.clear() },
			},
		);
		expect(report.failures).toEqual([
			{
				description: "read the project",
				reason: `provider state "${PROJECT}" has no handler`,
			},
		]);
		expect(asked).toEqual(["GET /v9/projects/hobo-site", "POST /v9/projects"]);
	});

	it("fails an interaction whose state could not be set up", async () => {
		const raw = document(interactions().slice(0, 1));
		const report = await verifyPact(parsePactDocument(raw), vercel().stub, {
			providerStates: parseProviderStates(raw),
			stateHandlers: {
				[NO_PROJECT]: () => {
					throw new Error("the store is read-only");
				},
			},
		});
		expect(report.failures).toEqual([
			{
				description: "a project nobody created is a 404",
				reason: `provider state "${NO_PROJECT}" could not be set up: the store is read-only`,
			},
		]);
	});

	it("refuses states read from another pact", async () => {
		const raw = document(interactions());
		const report = await verifyPact(parsePactDocument(raw), vercel().stub, {
			providerStates: parseProviderStates(document(interactions().slice(1))),
			stateHandlers: {},
		});
		expect(report.ok).toBe(false);
		expect(report.failures[0]?.reason).toMatch(
			/provider states were read from another pact/u,
		);
	});
});

describe("parseProviderStates", () => {
	it("reads an interaction without states as none", () => {
		const raw = document([
			{
				description: "stateless",
				request: { method: "GET", path: "/" },
				response: { status: 200 },
			},
		]);
		expect(parseProviderStates(raw)).toEqual([
			{ request: { method: "GET", path: "/" }, states: [] },
		]);
	});

	it.each([
		["states that are not a list", { name: NO_PROJECT }, /must be a list/u],
		["a state without a name", [{}], /needs a non-empty name/u],
		["a state with an empty name", [{ name: "" }], /needs a non-empty name/u],
		[
			"a state with a key Pact v3 does not give it",
			[{ name: NO_PROJECT, state: "x" }],
			/has key "state"/u,
		],
		[
			"params that are not an object",
			[{ name: NO_PROJECT, params: ["x"] }],
			/params must be an object/u,
		],
	])("refuses %s", (_name, providerStates, reason) => {
		const raw = document([
			{
				description: "one",
				providerStates,
				request: { method: "GET", path: "/" },
				response: { status: 200 },
			},
		]);
		expect(() => parseProviderStates(raw)).toThrow(reason);
		expect(() => parseProviderStates(raw)).toThrow(ProviderStateError);
	});
});

describe("parsePactDocument with provider states", () => {
	const base = {
		consumer: { name: "TestConsumer" },
		provider: { name: "VercelApi" },
		metadata: { pactSpecification: { version: "3.0.0" } },
	};
	const interaction = {
		description: "ok",
		request: { method: "GET", path: "/x" },
		response: { status: 200 },
	};

	it("carries each interaction's Pact v3 providerStates, with their params", () => {
		const pact = parsePactDocument({
			...base,
			interactions: [
				{
					...interaction,
					providerStates: [
						{ name: "a project exists", params: { name: "site" } },
						{ name: "the user is signed in" },
					],
				},
				{ ...interaction, description: "stateless" },
			],
		});
		expect(pact.interactions[0]?.providerStates).toEqual([
			{ name: "a project exists", params: { name: "site" } },
			{ name: "the user is signed in", params: {} },
		]);
		expect(pact.interactions[1]?.providerStates).toBeUndefined();
	});

	it("reports a malformed provider state as an issue", () => {
		expect(() =>
			parsePactDocument({
				...base,
				interactions: [{ ...interaction, providerStates: [{ name: "" }] }],
			}),
		).toThrow(/interactions\[0\]\.providerStates\[0\] needs a non-empty name/u);
	});
});
