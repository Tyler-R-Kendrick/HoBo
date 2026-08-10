import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSecretRef, SecretValue } from "@hobo/bindings";
import { describe, expect, it } from "vitest";

import {
	createNetlifyClient,
	isNetlifyProviderError,
	NETLIFY_API_ALLOWED_HOSTS,
	type NetlifyClient,
	type NetlifyTransport,
	type SecretResolverPort,
	type TransportResponse,
} from "../src/index.js";

type PactInteraction = {
	readonly description: string;
	readonly request: { readonly method: string; readonly path: string };
	readonly response: {
		readonly status: number;
		readonly body?: Record<string, unknown>;
	};
};

type PactDocument = {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly metadata: {
		readonly boundary: {
			readonly allowedHosts: readonly string[];
			readonly claimCeremonyHost: string;
		};
	};
	readonly interactions: readonly PactInteraction[];
};

const pact = JSON.parse(
	readFileSync(
		path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
			"contracts",
			"provider-netlify-site-api.pact.json",
		),
		"utf8",
	),
) as PactDocument;

/** Replays the contract: an unlisted request is a contract violation. */
const transport: NetlifyTransport = {
	async request(request) {
		const url = new URL(request.url);
		const found = pact.interactions.find(
			(candidate) =>
				candidate.request.method === request.method &&
				candidate.request.path === url.pathname,
		);
		if (found === undefined) {
			throw new Error(`no interaction for ${request.method} ${url.pathname}`);
		}
		const response: TransportResponse = {
			status: found.response.status,
			headers: {},
			body: JSON.stringify(found.response.body ?? {}),
		};
		return response;
	},
};

const tokenRef = parseSecretRef(
	"hobo-token://netlify/claiming-account/contract",
).ref;

const resolver: SecretResolverPort = {
	async resolve(ref) {
		return new SecretValue(
			parseSecretRef(ref),
			"FAKE-claiming-token-000000000000",
		);
	},
};

function client(): NetlifyClient {
	return createNetlifyClient({ transport, resolver });
}

describe("NetlifySiteApi pact (consumer contract)", () => {
	it("names the boundary and pins it to the official REST origin", () => {
		expect(pact.consumer.name).toBe("@hobo/provider-netlify");
		expect(pact.provider.name).toBe("NetlifySiteApi");
		expect(pact.metadata.boundary.allowedHosts).toEqual([
			...NETLIFY_API_ALLOWED_HOSTS,
		]);
		// The human ceremony host is recorded and never called.
		expect(pact.metadata.boundary.claimCeremonyHost).toBe("app.netlify.com");
	});

	it("carries no credential material: every authorization header is a placeholder and no claim URL appears", () => {
		const serialized = JSON.stringify(pact);
		for (const bearer of serialized.matchAll(/"Bearer ([^"]+)"/gu)) {
			expect(bearer[1]).toMatch(/^<redacted-[a-z-]+>$/u);
		}
		expect(serialized).not.toContain("app.netlify.com/claim");
	});

	it("reads the owning account as the ownership fact a claim has to move", async () => {
		const access = await client().probeSiteAccess({
			siteId: "site-claimed-demo",
			tokenRef,
		});
		expect(access.kind).toBe("readable");
		expect(access.kind === "readable" && access.site.accountId).toBe(
			"team-claiming",
		);
	});

	it("keeps forbidden and absent apart", async () => {
		expect(
			(
				await client().probeSiteAccess({
					siteId: "site-foreign-demo",
					tokenRef,
				})
			).kind,
		).toBe("forbidden");
		expect(
			(
				await client().probeSiteAccess({
					siteId: "site-reaped-demo",
					tokenRef,
				})
			).kind,
		).toBe("absent");
	});

	it("fails closed when the site response carries no owning account", async () => {
		let caught: unknown;
		try {
			await client().readSite({ siteId: "site-contract-drift", tokenRef });
		} catch (error) {
			caught = error;
		}
		expect(isNetlifyProviderError(caught)).toBe(true);
		expect(isNetlifyProviderError(caught) && caught.code).toBe(
			"PROVIDER_CONTRACT_CHANGED",
		);
	});
});
