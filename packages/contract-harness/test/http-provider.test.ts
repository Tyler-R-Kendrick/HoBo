import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
	createHttpProviderStub,
	exchangeHttp,
	HttpProviderError,
	parseHttpProviderTarget,
} from "../src/http-provider.js";
import { parsePactDocument } from "../src/pact.js";
import { verifyPact } from "../src/verify.js";

type Seen = {
	readonly method: string;
	readonly url: string;
	readonly host: string;
	readonly contentType: string;
	readonly body: string;
};

type Answer = (seen: Seen, response: ServerResponse) => void;

const servers: Server[] = [];

afterEach(async () => {
	await Promise.all(
		servers
			.splice(0)
			.map(
				(server) =>
					new Promise<void>((resolve) => server.close(() => resolve())),
			),
	);
});

/** A loopback server that records each request and answers with `answer`. */
async function listen(
	answer: Answer,
): Promise<{ readonly baseUrl: string; readonly seen: Seen[] }> {
	const seen: Seen[] = [];
	const server = createServer((request: IncomingMessage, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			const record: Seen = {
				method: request.method ?? "",
				url: request.url ?? "",
				host: request.headers.host ?? "",
				contentType: request.headers["content-type"] ?? "",
				body: Buffer.concat(chunks).toString("utf8"),
			};
			seen.push(record);
			answer(record, response);
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
	const { port } = server.address() as AddressInfo;
	return { baseUrl: `http://127.0.0.1:${port}`, seen };
}

/** A port nothing listens on: bound once to learn a free number, then closed. */
async function closedPort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
	const { port } = server.address() as AddressInfo;
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return port;
}

function json(response: ServerResponse, status: number, body: string): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(body);
}

const pact = parsePactDocument({
	consumer: { name: "TestConsumer" },
	provider: { name: "VercelApi" },
	interactions: [
		{
			description: "create a project",
			request: {
				method: "POST",
				path: "/v9/projects",
				headers: { authorization: "Bearer pact" },
				body: { name: "hobo-pact" },
			},
			response: {
				status: 200,
				headers: { "content-type": "application/json" },
				body: { name: "hobo-pact" },
			},
		},
		{
			description: "an unknown project",
			request: { method: "GET", path: "/v9/projects/missing?teamId=t" },
			response: { status: 404, body: { error: { code: "not_found" } } },
		},
	],
	metadata: { pactSpecification: { version: "3.0.0" } },
});

describe("createHttpProviderStub", () => {
	it("sends each interaction over real HTTP and verifyPact reads the real answers", async () => {
		const provider = await listen((seen, response) => {
			if (seen.method === "POST" && seen.url === "/v9/projects") {
				json(response, 200, `{"id":"prj_1","name":"hobo-pact","extra":true}`);
				return;
			}
			json(response, 404, `{"error":{"code":"not_found","message":"no"}}`);
		});
		const stub = createHttpProviderStub(
			parseHttpProviderTarget({
				name: "VercelApi",
				baseUrl: provider.baseUrl,
				host: "api.vercel.com",
			}),
		);

		const report = await verifyPact(pact, stub);

		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
		expect(provider.seen).toEqual([
			{
				method: "POST",
				url: "/v9/projects",
				host: "api.vercel.com",
				contentType: "application/json",
				body: `{"name":"hobo-pact"}`,
			},
			{
				method: "GET",
				url: "/v9/projects/missing?teamId=t",
				host: "api.vercel.com",
				contentType: "",
				body: "",
			},
		]);
	});

	it("reports the provider's real status, so a provider that does not serve a path fails the pact", async () => {
		const provider = await listen((_seen, response) =>
			json(
				response,
				501,
				`{"error":{"code":"MirrorNotImplemented","message":"not served"}}`,
			),
		);
		const stub = createHttpProviderStub(
			parseHttpProviderTarget({ name: "VercelApi", baseUrl: provider.baseUrl }),
		);

		const report = await verifyPact(pact, stub);

		expect(report.ok).toBe(false);
		expect(report.failures.map((failure) => failure.reason)).toEqual([
			"status expected 200 but got 501",
			"status expected 404 but got 501",
		]);
	});

	it("keeps a body that is not JSON as text", async () => {
		const provider = await listen((_seen, response) => {
			response.writeHead(200, { "content-type": "text/plain" });
			response.end("plain words");
		});
		const answer = await createHttpProviderStub(
			parseHttpProviderTarget({ name: "Plain", baseUrl: provider.baseUrl }),
		).handle({ method: "GET", path: "/x" });

		expect(answer.status).toBe(200);
		expect(answer.body).toBe("plain words");
		expect(answer.headers?.["content-type"]).toBe("text/plain");
	});

	it("joins a base path in front of the pact path", async () => {
		const provider = await listen((_seen, response) =>
			json(response, 200, "{}"),
		);
		await createHttpProviderStub(
			parseHttpProviderTarget({
				name: "Prefixed",
				baseUrl: `${provider.baseUrl}/api/`,
			}),
		).handle({ method: "DELETE", path: "/v1/x" });

		expect(provider.seen.map((seen) => seen.url)).toEqual(["/api/v1/x"]);
	});
});

describe("exchangeHttp", () => {
	it("refuses with ECONNREFUSED in the message when nothing listens", async () => {
		const port = await closedPort();

		const refused = exchangeHttp(
			{ baseUrl: `http://127.0.0.1:${port}` },
			{ method: "GET", path: "/_mirror/health" },
		);

		await expect(refused).rejects.toBeInstanceOf(HttpProviderError);
		await expect(refused).rejects.toMatchObject({
			code: "HTTP_PROVIDER_UNREACHABLE",
			message: expect.stringMatching(/ECONNREFUSED/u),
		});
	});

	it("stops reading at the response cap rather than buffering an unbounded body", async () => {
		const provider = await listen((_seen, response) => {
			response.writeHead(200, { "content-type": "text/plain" });
			response.end("x".repeat(4096));
		});

		await expect(
			exchangeHttp(
				{ baseUrl: provider.baseUrl, maxResponseBytes: 1024 },
				{ method: "GET", path: "/big" },
			),
		).rejects.toMatchObject({ code: "HTTP_PROVIDER_RESPONSE_TOO_LARGE" });
	});

	it("gives up at the deadline when the provider never answers", async () => {
		const provider = await listen(() => {
			// Hold the request open: no answer is the behaviour under test.
		});

		await expect(
			exchangeHttp(
				{ baseUrl: provider.baseUrl, timeoutMs: 50 },
				{ method: "GET", path: "/slow" },
			),
		).rejects.toMatchObject({ code: "HTTP_PROVIDER_TIMEOUT" });
	});

	it("sends a string body as given, with the caller's headers", async () => {
		const provider = await listen((_seen, response) => {
			response.writeHead(200, { "content-type": "text/xml" });
			response.end("<ok/>");
		});

		const answer = await exchangeHttp(
			{ baseUrl: provider.baseUrl, host: "sqs.us-east-1.amazonaws.com" },
			{
				method: "POST",
				path: "/",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "Action=CreateQueue&QueueName=q",
			},
		);

		expect(answer).toEqual({
			status: 200,
			headers: expect.objectContaining({ "content-type": "text/xml" }),
			body: "<ok/>",
		});
		expect(provider.seen).toEqual([
			{
				method: "POST",
				url: "/",
				host: "sqs.us-east-1.amazonaws.com",
				contentType: "application/x-www-form-urlencoded",
				body: "Action=CreateQueue&QueueName=q",
			},
		]);
	});
});

describe("what an exchange's refusal says about the request", () => {
	const SECRET = "tok_query_secret_8c1f";

	it("names the path and drops the query, so a token in it never reaches an error message", async () => {
		const port = await closedPort();
		const slow = await listen(() => {
			// Never answer: the deadline is what is under test.
		});
		const big = await listen((_seen, response) => {
			response.writeHead(200, { "content-type": "text/plain" });
			response.end("x".repeat(4096));
		});
		const path = `/v9/projects?teamId=t&token=${SECRET}`;
		const refusals = [
			{
				code: "HTTP_PROVIDER_UNREACHABLE",
				attempt: () =>
					exchangeHttp(
						{ baseUrl: `http://127.0.0.1:${port}` },
						{ method: "GET", path },
					),
			},
			{
				code: "HTTP_PROVIDER_TIMEOUT",
				attempt: () =>
					exchangeHttp(
						{ baseUrl: slow.baseUrl, timeoutMs: 50 },
						{ method: "GET", path },
					),
			},
			{
				code: "HTTP_PROVIDER_RESPONSE_TOO_LARGE",
				attempt: () =>
					exchangeHttp(
						{ baseUrl: big.baseUrl, maxResponseBytes: 1024 },
						{ method: "GET", path },
					),
			},
		];

		for (const { code, attempt: start } of refusals) {
			const attempt = start();
			await expect(attempt).rejects.toMatchObject({ code });
			// The path, then a space: nothing of the query follows it.
			await expect(attempt).rejects.toThrow(
				/ GET http:\/\/127\.0\.0\.1:\d+\/v9\/projects /u,
			);
			await expect(attempt).rejects.not.toThrow(SECRET);
			await expect(attempt).rejects.not.toThrow("teamId");
		}
	});
});

describe("parseHttpProviderTarget", () => {
	it.each([
		[{ name: "Ok", baseUrl: "ftp://127.0.0.1:1" }, /http or https/u],
		[{ name: "Ok", baseUrl: "http://user:pw@127.0.0.1:1" }, /userinfo/u],
		[{ name: "Ok", baseUrl: "http://127.0.0.1:1/?q=1" }, /query/u],
		[{ name: "Ok", baseUrl: "not a url" }, /absolute URL/u],
		[{ name: "lower", baseUrl: "http://127.0.0.1:1" }, /name/u],
		[{ name: "Ok", baseUrl: "http://127.0.0.1:1", timeoutMs: 0 }, /timeoutMs/u],
		[{ name: "Ok", baseUrl: "http://127.0.0.1:1", host: "a b" }, /host/u],
		[{ name: "Ok", baseUrl: "http://127.0.0.1:1", ca: "not pem" }, /PEM/u],
	])("refuses %j", (input, reason) => {
		expect(() => parseHttpProviderTarget(input)).toThrow(reason);
		expect(() => parseHttpProviderTarget(input)).toThrow(HttpProviderError);
	});

	it("returns a frozen target", () => {
		const target = parseHttpProviderTarget({
			name: "VercelApi",
			baseUrl: "https://127.0.0.1:4566",
			host: "api.vercel.com",
		});
		expect(Object.isFrozen(target)).toBe(true);
		expect(target).toEqual({
			name: "VercelApi",
			baseUrl: "https://127.0.0.1:4566",
			host: "api.vercel.com",
		});
	});
});
