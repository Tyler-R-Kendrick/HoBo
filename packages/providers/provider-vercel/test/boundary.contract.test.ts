import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSecretRef, SecretValue } from "@hobo/bindings";
import { describe, expect, it } from "vitest";

import {
	createProjectTransferRequest,
	getProject,
	isVercelProviderError,
	observeOrAdoptProject,
	PROJECT_TRANSFER_CODE_TTL_MS,
	revokeSponsoringToken,
	type SponsoringCredential,
	type TransportResponse,
	type VercelTransport,
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
		readonly boundary: { readonly allowedHosts: readonly string[] };
	};
	readonly interactions: readonly PactInteraction[];
};

const pact = JSON.parse(
	readFileSync(
		path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
			"contracts",
			"provider-vercel-project-transfer-api.pact.json",
		),
		"utf8",
	),
) as PactDocument;

const SPONSOR_ACCOUNT = "team-hobo-sponsor";

function interaction(method: string, pathname: string): PactInteraction {
	const found = pact.interactions.find(
		(candidate) =>
			candidate.request.method === method &&
			candidate.request.path === pathname,
	);
	if (found === undefined) {
		throw new Error(`no interaction for ${method} ${pathname}`);
	}
	return found;
}

/** Replays the contract: an unlisted request is a contract violation. */
const transport: VercelTransport = {
	async request(request) {
		const url = new URL(request.url);
		const found = interaction(request.method, url.pathname);
		const response: TransportResponse = {
			status: found.response.status,
			headers: {},
			body: JSON.stringify(found.response.body ?? {}),
		};
		return response;
	},
};

function credential(): SponsoringCredential {
	return {
		token: new SecretValue(
			parseSecretRef("hobo-token://vercel/sponsor/contract"),
			"FAKE-sponsor-token-000000000000",
		),
		sponsorAccountId: SPONSOR_ACCOUNT,
		tokenId: "FAKEtokenid0000000000000",
	};
}

describe("VercelProjectTransferApi pact (consumer contract)", () => {
	it("names the boundary and pins it to the official REST origin", () => {
		expect(pact.consumer.name).toBe("@hobo/provider-vercel");
		expect(pact.provider.name).toBe("VercelProjectTransferApi");
		expect(pact.metadata.boundary.allowedHosts).toEqual(["api.vercel.com"]);
	});

	it("carries no credential material: every authorization header and code is a placeholder", () => {
		const serialized = JSON.stringify(pact);
		for (const bearer of serialized.matchAll(/"Bearer ([^"]+)"/gu)) {
			expect(bearer[1]).toMatch(/^<redacted-[a-z-]+>$/u);
		}
		expect(serialized).not.toMatch(/[?&]code=/u);
		expect(
			interaction("POST", "/projects/prj-sponsored-demo/transfer-request")
				.response.body?.code,
		).toBe("<redacted-transfer-code>");
	});

	it("seals the returned transfer code and derives the documented 24 hour deadline", async () => {
		const issuedAt = Date.UTC(2026, 7, 8);
		const request = await createProjectTransferRequest(
			transport,
			credential(),
			{ projectId: "prj-sponsored-demo", issuedAt },
		);

		expect(request.expiresAt).toBe(issuedAt + PROJECT_TRANSFER_CODE_TTL_MS);
		expect(JSON.stringify(request)).not.toContain("<redacted-transfer-code>");
		expect(request.code.expose()).toBe("<redacted-transfer-code>");
	});

	it("reads accountId as the ownership fact, before and after the transfer", async () => {
		const sponsored = await getProject(transport, credential(), {
			projectId: "prj-sponsored-demo",
		});
		expect(sponsored.accountId).toBe(SPONSOR_ACCOUNT);

		expect(
			await observeOrAdoptProject(transport, credential(), {
				projectId: "prj-sponsored-demo",
			}),
		).toEqual({ state: "owned-by-sponsor", accountId: SPONSOR_ACCOUNT });

		expect(
			await observeOrAdoptProject(transport, credential(), {
				projectId: "prj-claimed-demo",
			}),
		).toEqual({ state: "already-transferred", accountId: "team-claiming" });
	});

	it("treats a forbidden read as unreachable-by-sponsor rather than a failure", async () => {
		expect(
			await observeOrAdoptProject(transport, credential(), {
				projectId: "prj-unreachable-demo",
			}),
		).toEqual({ state: "unreachable-by-sponsor" });
	});

	it("fails closed when the project response drops the documented accountId", async () => {
		let caught: unknown;
		try {
			await getProject(transport, credential(), {
				projectId: "prj-contract-drift",
			});
		} catch (error) {
			caught = error;
		}
		expect(isVercelProviderError(caught)).toBe(true);
		expect(isVercelProviderError(caught) && caught.code).toBe(
			"PROVIDER_CONTRACT_CHANGED",
		);
	});

	it("revokes a pre-claim token, and counts an already-gone token as revoked", async () => {
		expect(
			await revokeSponsoringToken(transport, credential(), {
				tokenId: "token-sponsor-deploy",
			}),
		).toEqual({ tokenId: "token-sponsor-deploy", alreadyGone: false });

		expect(
			await revokeSponsoringToken(transport, credential(), {
				tokenId: "token-already-revoked",
			}),
		).toEqual({ tokenId: "token-already-revoked", alreadyGone: true });
	});
});
