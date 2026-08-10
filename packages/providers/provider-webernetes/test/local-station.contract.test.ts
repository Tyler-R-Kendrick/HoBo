/**
 * Consumer-driven contract verification for the local station boundary.
 *
 * `contracts/provider-webernetes-local-station.pact.json` records what this
 * package expects a local station host to hand back through
 * `LocalTempTransport`. That transport is the only seam here, so it is the only
 * thing faked: each interaction's recorded reply is served through a stub
 * transport and the *real* `provisionTemporaryEnvironmentStation()` runs
 * against it.
 *
 * Three of the recorded replies are refusals. They are in the pact because the
 * interesting property of this boundary is not that a station comes back — it
 * is that a station which is not local, or whose URL carries a credential,
 * does not.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	type LocalTempTransport,
	parseWebernetesLocalEndpoint,
	provisionTemporaryEnvironmentStation,
	WEBERNETES_REJECTED_CODE,
	WebernetesInputRejectedError,
} from "../src/index.js";

type PactMessage = {
	readonly description: string;
	readonly request: {
		readonly type: string;
		readonly body: Record<string, unknown>;
	};
	readonly response: {
		readonly body: { readonly stationUrl: string; readonly claimUrl: string };
	};
	readonly providerStates?: readonly { readonly name: string }[];
};

type PactFile = {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly interactions: readonly PactMessage[];
};

function loadPact(): PactFile {
	const decoded: unknown = JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL(
					"../contracts/provider-webernetes-local-station.pact.json",
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

/** The seam: one recorded reply, and a record of what was asked for. */
function transportFor(
	entry: PactMessage,
): LocalTempTransport & { readonly requests: readonly string[] } {
	const requests: string[] = [];
	return {
		requests,
		async provision({ stationId }) {
			requests.push(stationId);
			return { ...entry.response.body };
		},
	};
}

function stationIdOf(entry: PactMessage): string {
	return entry.request.body.stationId as string;
}

describe("the pact file itself", () => {
	it("names the seam it describes", () => {
		expect(pact.consumer.name).toBe("@hobo/provider-webernetes");
		expect(pact.provider.name).toBe("WebernetesLocalStationHost");
		expect(
			pact.interactions.every((entry) => entry.request.type === "message"),
		).toBe(true);
	});

	it("carries no credential in any recorded reply except the one it exists to refuse", () => {
		const withUserinfo = pact.interactions.filter((entry) =>
			entry.response.body.stationUrl.includes("@"),
		);
		expect(withUserinfo).toHaveLength(1);
		expect(withUserinfo[0]?.description).toContain("userinfo");
		expect(withUserinfo[0]?.response.body.stationUrl).toContain("REDACTED");
	});
});

describe("the built-in transport, verified against the pact", () => {
	it("produces exactly the .hobo.localhost pair the pact records", async () => {
		const entry = interaction("names a .hobo.localhost host");

		// No transport injected: this exercises the package's own default and
		// asserts it against the reply the pact says the host produces.
		const result = await provisionTemporaryEnvironmentStation({
			stationId: stationIdOf(entry),
		});

		expect(result.stationUrl).toBe(entry.response.body.stationUrl);
		expect(result.claimUrl).toBe(entry.response.body.claimUrl);
	});
});

describe("station replies the host may produce, verified against the pact", () => {
	for (const fragment of [
		"answers same-origin on loopback",
		"bound to a LAN address",
	]) {
		it(`accepts the reply that ${fragment}`, async () => {
			const entry = interaction(fragment);
			const transport = transportFor(entry);

			const result = await provisionTemporaryEnvironmentStation({
				stationId: stationIdOf(entry),
				transport,
			});

			expect(transport.requests).toEqual([stationIdOf(entry)]);
			expect(result.stationUrl).toBe(entry.response.body.stationUrl);
			expect(result.primaryUrl).toBe(entry.response.body.stationUrl);
			expect(result.claimUrl).toBe(entry.response.body.claimUrl);
			expect(result.providerId).toBe("webernetes");
			expect(result.anonymous).toBe(true);
			expect(result.temporary).toBe(true);
			// The lease is finite, which is the other half of "temporary".
			expect(result.ttlSeconds).toBeGreaterThan(0);
			expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
		});
	}
});

describe("station replies the host must not produce, verified against the pact", () => {
	for (const fragment of [
		"points at a public host",
		"carries userinfo",
		"bare .hobo station name",
	]) {
		it(`refuses the reply that ${fragment}`, async () => {
			const entry = interaction(fragment);

			await expect(
				provisionTemporaryEnvironmentStation({
					stationId: stationIdOf(entry),
					transport: transportFor(entry),
				}),
			).rejects.toSatisfy(
				(error: unknown) =>
					error instanceof WebernetesInputRejectedError &&
					error.code === WEBERNETES_REJECTED_CODE &&
					error.field === "stationUrl",
			);
		});
	}

	it("records why each refusal exists", () => {
		for (const fragment of [
			"points at a public host",
			"carries userinfo",
			"bare .hobo station name",
		]) {
			expect(interaction(fragment).providerStates?.[0]?.name).toBeTruthy();
		}
	});
});

describe("the endpoint parser behind those refusals", () => {
	it("classifies each accepted host by where it actually lives", () => {
		expect(
			parseWebernetesLocalEndpoint(
				"https://demo.webernetes.hobo.localhost",
				"stationUrl",
			).locality,
		).toBe("loopback");
		expect(
			parseWebernetesLocalEndpoint("http://192.168.1.20:4321/", "stationUrl")
				.locality,
		).toBe("private-network");
		expect(
			parseWebernetesLocalEndpoint("https://demo.hobo.test/", "stationUrl")
				.locality,
		).toBe("overlay");
	});

	it("lowercases the host it reports, so no caller re-normalizes one", () => {
		expect(
			parseWebernetesLocalEndpoint("https://Demo.HOBO.test/", "stationUrl")
				.host,
		).toBe("demo.hobo.test");
	});
});
