/**
 * The composed hobo's Vercel deploy path against the mirror.cloud emulator
 * (ADR-0174): `createVercelClient` and `createVercelDeployProvider` as
 * `compose.ts` builds them, with only `fetch` replaced by one that sends the
 * `https://api.vercel.com/...` request to the emulator, path, query, body and
 * `Host` kept. `compose.ts` is unchanged; the seam is the `fetch` it already
 * injects (`deps.vercelFetch`).
 *
 * Emulated, not live: mirror's Vercel emulation follows Vercel's OpenAPI
 * document and has never been compared with api.vercel.com.
 */
import {
	exchangeHttp,
	type MirrorJournalEntry,
	mirrorControl,
	mirrorLaneEndpoint,
	readMirrorJournal,
} from "@hobo/contract-harness";
import { describe, expect, it } from "vitest";

import type { JsonValue } from "../../src/json.js";
import {
	createVercelClient,
	type VercelFetch,
} from "../../src/vercel-client.js";
import { createVercelDeployProvider } from "../../src/vercel-deploy-provider.js";

/** What `apply` takes: the Executor's program, read here only for its deploymentId. */
type IacProgram = Parameters<
	ReturnType<typeof createVercelDeployProvider>["apply"]
>[0];

const TOKEN = "mirror_lane_vercel_token";
const endpoint = mirrorLaneEndpoint(process.env);

const mirrorFetch: VercelFetch = async (url, init) => {
	const target = new URL(url);
	const answer = await exchangeHttp(
		{ ...endpoint, host: target.host },
		{
			method: init.method,
			path: `${target.pathname}${target.search}`,
			headers: init.headers,
			body: init.body,
		},
	);
	return {
		ok: answer.status >= 200 && answer.status < 300,
		status: answer.status,
		text: async () => answer.body,
		// SAFETY: JSON.parse yields a JSON value at this document boundary.
		json: async () => JSON.parse(answer.body) as JsonValue,
	};
};

/** A Vercel call the client does not make itself: project setup and reads. */
async function vercel(
	method: "GET" | "POST" | "DELETE",
	path: string,
	body?: string,
) {
	const answer = await exchangeHttp(
		{ ...endpoint, host: "api.vercel.com" },
		{
			method,
			path,
			headers: {
				authorization: `Bearer ${TOKEN}`,
				...(body === undefined
					? undefined
					: { "content-type": "application/json" }),
			},
			...(body === undefined ? undefined : { body }),
		},
	);
	return {
		status: answer.status,
		// SAFETY: JSON.parse yields a JSON value at this document boundary.
		body: (answer.body === "" ? null : JSON.parse(answer.body)) as {
			readonly [key: string]: JsonValue;
		} | null,
	};
}

async function project(name: string): Promise<void> {
	await vercel("DELETE", `/v9/projects/${name}`);
	const created = await vercel(
		"POST",
		"/v9/projects",
		JSON.stringify({ name }),
	);
	expect(created.status).toBe(200);
}

async function mark(): Promise<string | undefined> {
	const [newest] = await readMirrorJournal(endpoint, {
		service: "vercel.api",
		limit: 1,
	});
	return newest?.requestId;
}

async function since(
	from: string | undefined,
): Promise<readonly MirrorJournalEntry[]> {
	const entries = await readMirrorJournal(endpoint, {
		service: "vercel.api",
		limit: 1000,
	});
	const at =
		from === undefined
			? entries.length
			: entries.findIndex((entry) => entry.requestId === from);
	if (at === -1) throw new Error(`the journal answer no longer holds ${from}`);
	return entries.slice(0, at).reverse();
}

const files = [
	{ file: "index.html", data: "PGgxPmhvYm88L2gxPg==", encoding: "base64" },
] as const;

describe("createVercelClient against the emulator", () => {
	it("createVercelClient posts a deployment the emulator accepts and returns its id and url", async () => {
		await project("hobo-lane-site");
		const from = await mark();

		const result = await createVercelClient({
			token: TOKEN,
			fetch: mirrorFetch,
		}).createDeployment({
			name: "hobo-lane-site",
			files,
			target: "production",
		});

		expect(result.id).toMatch(/^dpl_[0-9a-f]+$/u);
		expect(result.url).toMatch(
			/^https:\/\/hobo-lane-site-[0-9a-z]+\.vercel\.app$/u,
		);
		expect(result.readyState).toBe("QUEUED");
		expect(
			(await since(from)).map((entry) => `${entry.operation} ${entry.status}`),
		).toEqual(["CreateDeployment 200"]);
		const held = await vercel("GET", `/v13/deployments/${result.id}`);
		expect(held.status).toBe(200);
		expect(held.body).toMatchObject({
			id: result.id,
			url: result.url.slice("https://".length),
			name: "hobo-lane-site",
			target: "production",
		});
	});

	it("after the emulator clock advances the deployment reads READY", async () => {
		await project("hobo-lane-clock");
		const { id } = await createVercelClient({
			token: TOKEN,
			fetch: mirrorFetch,
		}).createDeployment({
			name: "hobo-lane-clock",
			files,
			target: "production",
		});

		const queued = await vercel("GET", `/v13/deployments/${id}`);
		const advanced = await mirrorControl(
			endpoint,
			"POST",
			"/_mirror/clock/advance",
			JSON.stringify({ duration: "3s" }),
		);
		const ready = await vercel("GET", `/v13/deployments/${id}`);

		expect(queued.body).toMatchObject({ readyState: "QUEUED" });
		expect(advanced.status).toBe(204);
		expect(ready.body).toMatchObject({ readyState: "READY" });
	});

	it("a deployment to a project nobody created is refused with Vercel's 404, as on Vercel", async () => {
		await vercel("DELETE", "/v9/projects/hobo-lane-nobody");

		await expect(
			createVercelClient({ token: TOKEN, fetch: mirrorFetch }).createDeployment(
				{
					name: "hobo-lane-nobody",
					files,
					target: "production",
				},
			),
		).rejects.toThrow(/HTTP 404.*not_found/u);
	});
});

describe("createVercelDeployProvider against the emulator", () => {
	it("createVercelDeployProvider.apply returns the same url and deploymentId the emulator recorded", async () => {
		await project("hobo-lane-hello");
		const provider = createVercelDeployProvider({
			token: TOKEN,
			fetch: mirrorFetch,
			projectName: "hobo-lane-hello",
		});
		// SAFETY: apply reads only deploymentId; the rest of the program is the Executor's.
		const program = { deploymentId: "dep_mirror_lane_1" } as IacProgram;
		const from = await mark();

		const outputs = await provider.apply(program);
		const again = await provider.apply(program);

		expect(again).toEqual(outputs);
		expect(
			(await since(from)).map((entry) => `${entry.operation} ${entry.status}`),
		).toEqual(["CreateDeployment 200"]);
		const deploymentId = String(outputs.deploymentId);
		const held = await vercel("GET", `/v13/deployments/${deploymentId}`);
		expect(held.status).toBe(200);
		expect(held.body).toMatchObject({ id: deploymentId, target: "production" });
		expect(outputs).toMatchObject({
			provider: "vercel",
			target: "production",
			url: `https://${String(held.body?.url)}`,
		});
	});
});
