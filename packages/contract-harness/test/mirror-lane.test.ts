import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HttpProviderError, parseHttpEndpoint } from "../src/http-provider.js";
import {
	createMirrorTransport,
	MirrorLaneError,
	mirrorControl,
	mirrorLaneEndpoint,
	readMirrorJournal,
	recordMirrorLaneReport,
} from "../src/mirror-lane.js";

type Seen = {
	readonly method: string;
	readonly url: string;
	readonly host: string;
	readonly authorization: string;
	readonly body: string;
};

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

async function fakeMirror(
	answer: (seen: Seen, response: ServerResponse) => void,
): Promise<{ readonly url: string; readonly seen: Seen[] }> {
	const seen: Seen[] = [];
	const server = createServer((request: IncomingMessage, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			const record: Seen = {
				method: request.method ?? "",
				url: request.url ?? "",
				host: request.headers.host ?? "",
				authorization: request.headers.authorization ?? "",
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
	return { url: `http://127.0.0.1:${port}`, seen };
}

function answerJson(response: ServerResponse, status: number, body: string) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(body);
}

const ENTRY = `{"At":"2020-01-01T00:00:00Z","RequestID":"r1","ServiceID":"vercel.api","Operation":"CreateProject","Tier":"emulate","Account":"000000000000","Region":"us-east-1","Status":200,"ErrorCode":"","Duration":0,"Note":""}`;

describe("mirrorLaneEndpoint", () => {
	it("fails, naming the command that starts the lane, when HOBO_MIRROR_URL is unset", () => {
		expect(() => mirrorLaneEndpoint({})).toThrow(MirrorLaneError);
		expect(() => mirrorLaneEndpoint({ HOBO_MIRROR_URL: "" })).toThrow(
			/MIRROR_URL_REQUIRED: .*pnpm run test:mirror/u,
		);
	});

	it("reads the URL the lane set", () => {
		expect(
			mirrorLaneEndpoint({ HOBO_MIRROR_URL: "http://127.0.0.1:4566" }),
		).toEqual({ baseUrl: "http://127.0.0.1:4566" });
	});
});

describe("createMirrorTransport", () => {
	it("sends a guarded https request to the emulator with its path, query, headers, body and Host", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, 201, `{"id":"prj_1"}`),
		);
		const transport = createMirrorTransport(
			parseHttpEndpoint({ baseUrl: mirror.url }),
		);

		const answer = await transport({
			method: "POST",
			url: "https://api.vercel.com/v9/projects?teamId=team_1",
			headers: {
				authorization: "Bearer t",
				"content-type": "application/json",
			},
			body: `{"name":"a"}`,
			timeoutMs: 5_000,
			maxResponseBytes: 1024,
		});

		expect(answer.status).toBe(201);
		expect(answer.body).toBe(`{"id":"prj_1"}`);
		expect(mirror.seen).toEqual([
			{
				method: "POST",
				url: "/v9/projects?teamId=team_1",
				host: "api.vercel.com",
				authorization: "Bearer t",
				body: `{"name":"a"}`,
			},
		]);
	});

	it("honours the caller's response cap", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, 200, JSON.stringify({ pad: "x".repeat(2048) })),
		);

		await expect(
			createMirrorTransport(parseHttpEndpoint({ baseUrl: mirror.url }))({
				method: "GET",
				url: "https://s3.us-east-1.amazonaws.com/bucket",
				headers: {},
				timeoutMs: 5_000,
				maxResponseBytes: 512,
			}),
		).rejects.toBeInstanceOf(HttpProviderError);
	});
});

describe("readMirrorJournal", () => {
	it("asks for the filter and the limit and parses each entry", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, 200, `[${ENTRY}]`),
		);

		const entries = await readMirrorJournal(
			parseHttpEndpoint({ baseUrl: mirror.url }),
			{ service: "vercel.api", operation: "CreateProject", limit: 500 },
		);

		expect(entries).toEqual([
			{
				requestId: "r1",
				serviceId: "vercel.api",
				operation: "CreateProject",
				tier: "emulate",
				status: 200,
				errorCode: "",
			},
		]);
		expect(Object.isFrozen(entries[0])).toBe(true);
		expect(mirror.seen.map((seen) => seen.url)).toEqual([
			"/_mirror/journal?service=vercel.api&operation=CreateProject&limit=500",
		]);
	});

	it("reads an empty journal, which mirror encodes as null", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, 200, "null\n"),
		);
		expect(
			await readMirrorJournal(parseHttpEndpoint({ baseUrl: mirror.url })),
		).toEqual([]);
	});

	it.each([
		["a status that is not 200", 400, "limit must be an integer"],
		["a body that is not JSON", 200, "<html>"],
		["a body that is not a list", 200, `{"entries":[]}`],
		[
			"an entry without a status",
			200,
			`[{"RequestID":"r","ServiceID":"s","Operation":"o","Tier":"emulate","ErrorCode":""}]`,
		],
		[
			"an entry whose tier mirror does not have",
			200,
			`[${ENTRY.replace(`"Tier":"emulate"`, `"Tier":"live"`)}]`,
		],
		[
			"an entry with an empty tier",
			200,
			`[${ENTRY.replace(`"Tier":"emulate"`, `"Tier":""`)}]`,
		],
		[
			"an entry whose status is no HTTP status",
			200,
			`[${ENTRY.replace(`"Status":200`, `"Status":0`)}]`,
		],
		[
			"an entry whose status is past 599",
			200,
			`[${ENTRY.replace(`"Status":200`, `"Status":600`)}]`,
		],
		[
			"an entry whose status is not an integer",
			200,
			`[${ENTRY.replace(`"Status":200`, `"Status":200.5`)}]`,
		],
		[
			"an entry with an empty operation",
			200,
			`[${ENTRY.replace(`"Operation":"CreateProject"`, `"Operation":""`)}]`,
		],
	])("refuses %s", async (_name, status, body) => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, status, body),
		);
		await expect(
			readMirrorJournal(parseHttpEndpoint({ baseUrl: mirror.url })),
		).rejects.toMatchObject({ code: "MIRROR_JOURNAL_UNREADABLE" });
	});

	it("names the field and the value it refused", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(
				response,
				200,
				`[${ENTRY.replace(`"Tier":"emulate"`, `"Tier":"live"`)}]`,
			),
		);
		await expect(
			readMirrorJournal(parseHttpEndpoint({ baseUrl: mirror.url })),
		).rejects.toThrow(/Tier "live" is not one of emulate, mock, proxy/u);
	});
});

describe("mirrorControl", () => {
	it("posts JSON to the emulator's own route", async () => {
		const mirror = await fakeMirror((_seen, response) =>
			answerJson(response, 200, `{"requests":1}`),
		);

		const answer = await mirrorControl(
			parseHttpEndpoint({ baseUrl: mirror.url }),
			"POST",
			"/_mirror/vercel/rate-limit",
			`{"requests":1,"retryAfter":2}`,
		);

		expect(answer.status).toBe(200);
		expect(mirror.seen).toEqual([
			{
				method: "POST",
				url: "/_mirror/vercel/rate-limit",
				host: mirror.url.slice("http://".length),
				authorization: "",
				body: `{"requests":1,"retryAfter":2}`,
			},
		]);
	});
});

describe("recordMirrorLaneReport", () => {
	const report = {
		consumer: "HoboVercelDeploy",
		provider: "VercelApi",
		interactions: 4,
		ok: true,
		failures: [],
	};

	it("writes <name>.json where HOBO_MIRROR_REPORTS points, for the runner to print", () => {
		const dir = mkdtempSync(join(tmpdir(), "mirror-reports-"));
		try {
			recordMirrorLaneReport(
				{ HOBO_MIRROR_REPORTS: dir },
				"hobo-vercel-api",
				report,
			);
			expect(readdirSync(dir)).toEqual(["hobo-vercel-api.json"]);
			expect(
				JSON.parse(readFileSync(join(dir, "hobo-vercel-api.json"), "utf8")),
			).toEqual(report);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes nothing when the variable is unset (a file run on its own)", () => {
		expect(() =>
			recordMirrorLaneReport({}, "hobo-vercel-api", report),
		).not.toThrow();
	});

	it.each([
		"../escape",
		"a/b",
		".hidden",
		"",
	])("refuses the name %j", (name) => {
		expect(() =>
			recordMirrorLaneReport({ HOBO_MIRROR_REPORTS: tmpdir() }, name, report),
		).toThrow(/MIRROR_REPORT_NAME_INVALID/u);
	});
});
