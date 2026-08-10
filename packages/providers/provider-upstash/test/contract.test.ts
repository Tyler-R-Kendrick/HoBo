/**
 * Consumer-driven contract verification for the `start-redis` boundary.
 *
 * `contracts/provider-upstash-start-redis.pact.json` states what this package
 * expects of the provider. A pact file nobody replays is a wish, so this suite
 * loads it and drives the real client against each interaction: the request
 * the client emits must match the one the pact describes, and the client must
 * behave as documented when handed the pact's response.
 *
 * The provider side of the pact is not verifiable here — nobody can verify
 * Upstash's half offline, and the point of the file is to make the drift
 * visible when a human next re-checks the surface. What *is* verified is that
 * this consumer still sends what it says it sends.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	createInMemoryIdempotencyStore,
	createUpstashClient,
	UPSTASH_START_REDIS_URL,
} from "../src/client.js";
import { isProviderError } from "../src/errors.js";
import type { TransportRequest, UpstashTransport } from "../src/transport.js";

type PactHeaders = Readonly<Record<string, string>>;

type PactInteraction = {
	readonly description: string;
	readonly request: {
		readonly method: string;
		readonly path: string;
		readonly headers?: PactHeaders;
	};
	readonly response: {
		readonly status: number;
		readonly headers?: PactHeaders;
		readonly body?: string;
	};
};

type PactFile = {
	readonly consumer: { readonly name: string };
	readonly provider: { readonly name: string };
	readonly metadata: {
		readonly source: { readonly url: string; readonly checkedAt: string };
	};
	readonly interactions: readonly PactInteraction[];
};

/**
 * Parse the pact rather than trusting its shape.
 *
 * The file is checked-in JSON, so this is not a security boundary — it is a
 * legibility one. A test that reads `pact.interactions[0].request.method` off
 * an `unknown` and fails with "cannot read property of undefined" three
 * assertions later is worse than one that says the pact is malformed.
 */
function loadPact(): PactFile {
	const raw = readFileSync(
		fileURLToPath(
			new URL(
				"../contracts/provider-upstash-start-redis.pact.json",
				import.meta.url,
			),
		),
		"utf8",
	);
	const decoded: unknown = JSON.parse(raw);
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
	if (candidate.metadata?.source?.checkedAt === undefined) {
		throw new Error(
			"the pact file does not record when its source was checked",
		);
	}
	return candidate as PactFile;
}

const pact = loadPact();

function interaction(fragment: string): PactInteraction {
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

/** A transport that answers with one pact response and records the request. */
function transportFor(
	response: PactInteraction["response"],
): UpstashTransport & { readonly requests: readonly TransportRequest[] } {
	const requests: TransportRequest[] = [];
	return {
		requests,
		async request(request) {
			requests.push(request);
			return {
				status: response.status,
				headers: Object.fromEntries(
					Object.entries(response.headers ?? {}).map(([key, value]) => [
						key.toLowerCase(),
						value,
					]),
				),
				body: response.body ?? "",
			};
		},
	};
}

function clientOver(transport: UpstashTransport) {
	return createUpstashClient({
		transport,
		store: createInMemoryIdempotencyStore(),
		clock: () => Date.UTC(2026, 7, 8),
	});
}

function headerOf(request: TransportRequest, name: string): string | undefined {
	const entry = Object.entries(request.headers).find(
		([key]) => key.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

describe("the pact file itself", () => {
	it("names this package as the consumer and dates its source", () => {
		expect(pact.consumer.name).toBe("@hobo/provider-upstash");
		expect(pact.metadata.source.url).toBe(UPSTASH_START_REDIS_URL);
		expect(pact.metadata.source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
	});

	it("carries no live credential in any recorded body", () => {
		// The create interaction embeds a whole response document. Every
		// credential-shaped string in it has to be visibly fake.
		for (const entry of pact.interactions) {
			const body = entry.response.body ?? "";
			if (body.length === 0) continue;
			expect(body).toContain("FAKE-");
			expect(body).toMatch(/DO-NOT-USE/u);
		}
	});
});

describe("create, verified against the pact", () => {
	const create = interaction("create a temporary Redis database");
	const key = create.request.headers?.["Idempotency-Key"] as string;

	it("sends the method and path the pact declares", async () => {
		const transport = transportFor(create.response);

		await clientOver(transport).createDatabase({ idempotencyKey: key });

		const [request] = transport.requests;
		expect(request?.method).toBe(create.request.method);
		expect(new URL(request?.url ?? "").pathname).toBe(create.request.path);
	});

	it("sends the idempotency key as the pact's header", async () => {
		const transport = transportFor(create.response);

		await clientOver(transport).createDatabase({ idempotencyKey: key });

		expect(
			headerOf(transport.requests[0] as TransportRequest, "Idempotency-Key"),
		).toBe(key);
	});

	it("asks for the markdown the pact returns", async () => {
		const transport = transportFor(create.response);

		await clientOver(transport).createDatabase({ idempotencyKey: key });

		expect(
			headerOf(transport.requests[0] as TransportRequest, "Accept"),
		).toContain("text/markdown");
	});

	it("parses the pact's recorded response into the documented fields", async () => {
		const transport = transportFor(create.response);

		const outcome = await clientOver(transport).createDatabase({
			idempotencyKey: key,
		});

		expect(outcome.adopted).toBe(false);
		expect(outcome.database.databaseId).toBe(key);
		expect(outcome.database.restEndpointHost).toMatch(/\.upstash\.io$/u);
		expect(outcome.database.expiresOn).toBe("2026-08-11");
	});
});

describe("adoption, verified against the pact", () => {
	const create = interaction("create a temporary Redis database");
	const adopt = interaction("re-POSTing the same idempotency key");
	const key = create.request.headers?.["Idempotency-Key"] as string;

	it("re-POSTs the original key rather than creating a second database", async () => {
		// The pact's adoption interaction is the same request as the create.
		// That is the contract: adoption is not a distinct endpoint, it is the
		// same call, which is the only reason retrying is safe.
		expect(adopt.request.method).toBe(create.request.method);
		expect(adopt.request.path).toBe(create.request.path);
		expect(adopt.request.headers?.["Idempotency-Key"]).toBe(key);

		const transport = transportFor(create.response);
		const client = clientOver(transport);

		await client.createDatabase({ idempotencyKey: key });
		const adopted = await client.adoptDatabase(key);

		expect(adopted.databaseId).toBe(key);
		expect(transport.requests).toHaveLength(2);
		expect(
			transport.requests.every(
				(request) => headerOf(request, "Idempotency-Key") === key,
			),
		).toBe(true);
	});
});

describe("rate limiting, verified against the pact", () => {
	const limited = interaction("rate-limited creation");

	it("maps the pact's 429 to PROVIDER_RATE_LIMITED and carries its Retry-After", async () => {
		const transport = transportFor(limited.response);

		await expect(
			clientOver(transport).createDatabase({
				idempotencyKey: "fa1cefa1-ce00-4000-8000-000000000002",
			}),
		).rejects.toSatisfy(
			(error: unknown) =>
				isProviderError(error) &&
				error.code === "PROVIDER_RATE_LIMITED" &&
				error.retryable &&
				error.retryAfterMs ===
					Number(limited.response.headers?.["Retry-After"] ?? 0) * 1000,
		);
	});
});
