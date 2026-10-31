/**
 * The Vercel resolvers against the mirror.cloud emulator (ADR-0174).
 *
 * The resolvers run unchanged: the same guard, the same request formation, the
 * same parsing. Only the transport differs, and only after the guard has
 * checked the request: `createMirrorTransport` sends the guarded
 * `https://api.vercel.com/...` call to the emulator with its path, query and
 * `Host`. Each test reads the emulator's journal from a mark taken before it,
 * so what it asserts is what reached the emulator, in order.
 *
 * Emulated, not live: mirror's Vercel emulation follows Vercel's OpenAPI
 * document and has never been compared with api.vercel.com.
 */
import {
	createMirrorTransport,
	type MirrorJournalEntry,
	mirrorControl,
	mirrorLaneEndpoint,
	readMirrorJournal,
} from "@hobo/contract-harness";
import {
	guardTransport,
	type HttpTransport,
	type ResolveRequest,
	ResolverError,
	type ResourceResolver,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	VERCEL_EDGE_CONFIG_PRODUCT_ID,
	VERCEL_PROJECT_PRODUCT_ID,
	VERCEL_RESOLVER_TRANSPORT_POLICY,
	vercelResolvers,
} from "../../src/index.js";

const TOKEN = "mirror_lane_vercel_token";
const endpoint = mirrorLaneEndpoint(process.env);
const transport: HttpTransport = createMirrorTransport(endpoint);
const resolvers = vercelResolvers({ resolveCredential: async () => TOKEN });

function resolverFor(productId: string): ResourceResolver {
	const resolver = resolvers.find(
		(candidate) => candidate.productId === productId,
	);
	if (resolver === undefined) throw new Error(`no resolver for ${productId}`);
	return resolver;
}

const projects = resolverFor(VERCEL_PROJECT_PRODUCT_ID);
const edgeConfigs = resolverFor(VERCEL_EDGE_CONFIG_PRODUCT_ID);

function request(
	productId: string,
	logicalId: string,
	desired: ResolveRequest["desired"],
	physicalId?: string,
): ResolveRequest {
	return {
		ref: {
			slot: "web",
			productId,
			logicalId,
			...(physicalId === undefined ? undefined : { physicalId }),
		},
		desired,
		credentialRef: "hobo-token://vercel/deploy",
	};
}

/** The newest vercel.api journal entry's id: what "since" counts from. */
async function mark(): Promise<string | undefined> {
	const [newest] = await readMirrorJournal(endpoint, {
		service: "vercel.api",
		limit: 1,
	});
	return newest?.requestId;
}

/** What vercel.api recorded after `from`, oldest first. */
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
	if (at === -1) {
		throw new Error(
			`the journal answer no longer holds ${from}: more requests than one answer carries were made since`,
		);
	}
	return entries.slice(0, at).reverse();
}

function calls(entries: readonly MirrorJournalEntry[]): string[] {
	return entries.map((entry) => `${entry.operation} ${entry.status}`);
}

function vercelGet(path: string) {
	return transport({
		method: "GET",
		url: `https://api.vercel.com${path}`,
		headers: { authorization: `Bearer ${TOKEN}`, accept: "application/json" },
		timeoutMs: 10_000,
		maxResponseBytes: 256 * 1024,
	});
}

describe("vercel.project/v1 against the emulator", () => {
	it("creates a vercel.project through the resolver and the emulator holds exactly that project", async () => {
		const from = await mark();

		const outcome = await projects.reconcile(
			request(VERCEL_PROJECT_PRODUCT_ID, "lane-create", {
				framework: "nextjs",
			}),
			transport,
		);

		expect(outcome.action).toBe("create");
		expect(outcome.physicalId).toMatch(/^prj_/u);
		expect(calls(await since(from))).toEqual([
			"GetProject 404",
			"CreateProject 200",
		]);
		const held = await vercelGet("/v9/projects/lane-create");
		expect(held.status).toBe(200);
		expect(JSON.parse(held.body)).toMatchObject({
			id: outcome.physicalId,
			name: "lane-create",
			framework: "nextjs",
		});
	});

	it("a second reconcile is idempotent: the journal shows no second create", async () => {
		const first = await projects.reconcile(
			request(VERCEL_PROJECT_PRODUCT_ID, "lane-idempotent", {
				framework: "vite",
			}),
			transport,
		);
		const from = await mark();

		const again = await projects.reconcile(
			request(VERCEL_PROJECT_PRODUCT_ID, "lane-idempotent", {
				framework: "vite",
			}),
			transport,
		);
		const known = await projects.reconcile(
			request(
				VERCEL_PROJECT_PRODUCT_ID,
				"lane-idempotent",
				{ framework: "vite" },
				first.physicalId,
			),
			transport,
		);

		expect(again.action).toBe("adopt");
		expect(known.action).toBe("noop");
		expect(
			new Set([first.physicalId, again.physicalId, known.physicalId]).size,
		).toBe(1);
		expect(calls(await since(from))).toEqual([
			"GetProject 200",
			"GetProject 200",
		]);
	});

	it("patch converges a changed setting and delete removes the project (404 after)", async () => {
		const created = await projects.reconcile(
			request(VERCEL_PROJECT_PRODUCT_ID, "lane-patch", {
				framework: "nextjs",
			}),
			transport,
		);
		const known = (desired: ResolveRequest["desired"]) =>
			request(
				VERCEL_PROJECT_PRODUCT_ID,
				"lane-patch",
				desired,
				created.physicalId,
			);
		const from = await mark();

		const updated = await projects.reconcile(
			known({ framework: "nextjs", buildCommand: "make site" }),
			transport,
		);
		const read = await projects.read?.(known({}), transport);
		await projects.delete(known({}), transport);
		const gone = await projects.read?.(known({}), transport);
		await projects.delete(known({}), transport);

		expect(updated.action).toBe("update");
		expect(updated.outputs).toMatchObject({ buildCommand: "make site" });
		expect(read?.outputs).toMatchObject({
			id: created.physicalId,
			buildCommand: "make site",
		});
		expect(gone).toBeUndefined();
		expect(calls(await since(from))).toEqual([
			"GetProject 200",
			"UpdateProject 200",
			"GetProject 200",
			"DeleteProject 204",
			"GetProject 404",
			"DeleteProject 404",
		]);
	});
});

describe("vercel.edge-config/v1 against the emulator", () => {
	it("edge-config: create, read, update, delete through /v1/global-config", async () => {
		const from = await mark();

		const created = await edgeConfigs.reconcile(
			request(VERCEL_EDGE_CONFIG_PRODUCT_ID, "lane-flags", {
				slug: "lane_flags",
			}),
			transport,
		);
		const known = (desired: ResolveRequest["desired"]) =>
			request(
				VERCEL_EDGE_CONFIG_PRODUCT_ID,
				"lane-flags",
				desired,
				created.physicalId,
			);
		const adopted = await edgeConfigs.reconcile(
			request(VERCEL_EDGE_CONFIG_PRODUCT_ID, "lane-flags", {
				slug: "lane_flags",
			}),
			transport,
		);
		const renamed = await edgeConfigs.reconcile(
			known({ slug: "lane_flags_v2" }),
			transport,
		);
		const read = await edgeConfigs.read?.(
			known({ slug: "lane_flags_v2" }),
			transport,
		);
		await edgeConfigs.delete(known({}), transport);
		const gone = await edgeConfigs.read?.(known({}), transport);

		expect(created.action).toBe("create");
		expect(created.physicalId).toMatch(/^ecfg_/u);
		expect(adopted).toMatchObject({
			action: "adopt",
			physicalId: created.physicalId,
		});
		expect(renamed).toMatchObject({
			action: "update",
			physicalId: created.physicalId,
			outputs: { slug: "lane_flags_v2" },
		});
		expect(read?.outputs).toMatchObject({ slug: "lane_flags_v2" });
		expect(gone).toBeUndefined();
		expect(calls(await since(from))).toEqual([
			"GetEdgeConfigs 200",
			"CreateEdgeConfig 201",
			"GetEdgeConfigs 200",
			"GetEdgeConfig 200",
			"UpdateEdgeConfig 200",
			"GetEdgeConfig 200",
			"DeleteEdgeConfig 204",
			"GetEdgeConfig 404",
		]);
	});
});

describe("refusals against the emulator", () => {
	it("an armed 429 (POST /_mirror/vercel/rate-limit) surfaces as RESOLVER_PROVIDER_REJECTED with the redacted message", async () => {
		const armed = await mirrorControl(
			endpoint,
			"POST",
			"/_mirror/vercel/rate-limit",
			JSON.stringify({ requests: 1, retryAfter: 2 }),
		);
		expect(armed.status).toBe(200);
		let refusal: Error | undefined;
		try {
			await projects.reconcile(
				request(VERCEL_PROJECT_PRODUCT_ID, "lane-limited", {}),
				transport,
			);
		} catch (error) {
			refusal = error instanceof Error ? error : new Error(String(error));
		} finally {
			await mirrorControl(endpoint, "DELETE", "/_mirror/vercel/rate-limit");
		}

		expect(refusal).toBeInstanceOf(ResolverError);
		expect(refusal).toMatchObject({ code: "RESOLVER_PROVIDER_REJECTED" });
		expect(refusal?.message).toMatch(
			/^vercel rejected GET \/v9\/projects\/\{idOrName\} with status 429: rate_limited: Too many requests/u,
		);
		expect(refusal?.message).not.toContain(TOKEN);
		// Disarmed, the same request goes through.
		const after = await projects.reconcile(
			request(VERCEL_PROJECT_PRODUCT_ID, "lane-limited", {}),
			transport,
		);
		expect(after.action).toBe("create");
	});

	it("a request outside VERCEL_RESOLVER_PATH_PREFIXES never leaves the guard (journal unchanged)", async () => {
		const guarded = guardTransport(transport, VERCEL_RESOLVER_TRANSPORT_POLICY);
		const call = (url: string) =>
			guarded({
				method: "GET",
				url,
				headers: { authorization: `Bearer ${TOKEN}` },
				timeoutMs: 10_000,
				maxResponseBytes: 256 * 1024,
			});
		const from = await mark();

		await expect(call("https://api.vercel.com/v2/user")).rejects.toMatchObject({
			code: "TRANSPORT_PATH_FORBIDDEN",
		});
		await expect(
			call("https://api.vercel.com.attacker.example/v9/projects/x"),
		).rejects.toMatchObject({ code: "TRANSPORT_HOST_FORBIDDEN" });
		await expect(
			call("http://api.vercel.com/v9/projects/x"),
		).rejects.toMatchObject({
			code: "TRANSPORT_SCHEME_FORBIDDEN",
		});
		expect(await mark()).toBe(from);

		// The control: the same path through the bare transport does reach the
		// emulator, so an unchanged journal above means the guard stopped it.
		const reached = await vercelGet("/v2/user");
		expect(reached.status).toBe(200);
		expect(calls(await since(from))).toEqual(["GetAuthUser 200"]);
	});
});
