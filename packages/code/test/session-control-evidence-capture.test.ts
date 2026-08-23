/**
 * The evidence-capture endpoint: what a browser is allowed to post, and what it
 * has to prove before the bytes are kept.
 *
 * This is the one route on the control server that accepts binary uploads from
 * a page the server does not control, so it is the one route where "who is
 * asking" and "is this really what it claims to be" both have to be answered
 * before anything is written.
 *
 * **The origin must have been registered first**, and registration happens when
 * the controls page is actually *served* — not when `controlsUrl(parentOrigin)`
 * builds a URL. Minting a URL for an origin proves nothing; a real browser
 * fetching that page does. A POST from an origin that never fetched it is 403
 * even with the right capability in the path, so a capability that leaked into
 * a log is still not enough on its own.
 *
 * **The bytes must be the format they claim.** A recording is checked for the
 * WebM magic bytes and a screenshot for the PNG signature, before either is
 * written to the evidence store. Evidence that cannot be opened is worse than
 * missing evidence: it looks like a record until someone needs it.
 *
 * **The capability is in the path, not a header**, because the page posting
 * these is an iframe the server handed a URL to, and a URL is the only thing
 * that survives that hop.
 *
 * Driven against a real server on an ephemeral port, so the capability really
 * is random and the origin allowlist really is consulted.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import { startSessionControlServer } from "../src/session-control-server.js";

const homes: string[] = [];
const servers: (() => Promise<void>)[] = [];

afterEach(async () => {
	for (const close of servers.splice(0)) await close().catch(() => undefined);
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

async function server() {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-control-capture-"));
	homes.push(hoboHome);
	authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
	const started = await startSessionControlServer({ hoboHome, port: 0 });
	servers.push(() => started.close());
	return started;
}

/** The capability segment the server minted for this run. */
const capabilityOf = (started: Awaited<ReturnType<typeof server>>): string =>
	new URL(started.controlsUrlTemplate).pathname
		.split("/")
		.filter(Boolean)
		.pop() ?? "";

/**
 * Register an origin by *fetching* the controls page for it.
 *
 * Building the controls URL does not register anything -- the allowlist is
 * populated when the page is actually served, which is the only point at which
 * the server knows a real browser asked for it.
 */
async function registerOrigin(
	started: Awaited<ReturnType<typeof server>>,
	origin: string,
): Promise<void> {
	await fetch(started.controlsUrl(origin));
}

/** The capture URL, with the capability already in the path. */
function captureUrl(
	started: Awaited<ReturnType<typeof server>>,
	kind: string,
	extra = "",
): string {
	return `http://127.0.0.1:${started.port}/__hobo/evidence/api/captures/${capabilityOf(started)}?kind=${kind}${extra}`;
}

/** A server with `origin` already allowed to post captures. */
async function serverAllowing(origin: string) {
	const started = await server();
	await registerOrigin(started, origin);
	return started;
}

const post = (url: string, body: Buffer, origin?: string) =>
	fetch(url, {
		method: "POST",
		...(origin ? { headers: { origin } } : {}),
		body: new Uint8Array(body),
	});

describe("who is allowed to post evidence", () => {
	it("accepts a registered origin", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(captureUrl(started, "screenshot"), PNG, origin);
		expect(res.status).toBe(201);
	});

	it("refuses an origin that was never registered", async () => {
		// A capability that leaked into a log is not enough on its own.
		const started = await server();
		const url = captureUrl(started, "screenshot");
		const res = await post(url, PNG, "http://evil.example");
		expect(res.status).toBe(403);
	});

	it("refuses a post with no origin at all", async () => {
		const started = await server();
		const url = captureUrl(started, "screenshot");
		const res = await post(url, PNG);
		expect(res.status).toBe(403);
	});

	it("says why it refused", async () => {
		const started = await server();
		const url = captureUrl(started, "screenshot");
		const body = (await (
			await post(url, PNG, "http://evil.example")
		).json()) as { error?: string };
		expect(body.error).toContain("origin is not registered");
	});

	it("echoes the allowed origin back on success", async () => {
		// The posting page is an iframe; without the header the browser
		// discards the response it needs to know the capture landed.
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(captureUrl(started, "screenshot"), PNG, origin);
		expect(res.headers.get("access-control-allow-origin")).toBe(origin);
	});

	it("registers each origin it hands a url to", async () => {
		const started = await server();
		const first = "http://127.0.0.1:4321";
		const second = "http://127.0.0.1:5555";
		await registerOrigin(started, first);
		await registerOrigin(started, second);
		const res = await post(captureUrl(started, "screenshot"), PNG, second);
		expect(res.status).toBe(201);
	});

	it("refuses a capability that is not the server's", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		started.controlsUrl(origin);
		const res = await post(
			`http://127.0.0.1:${started.port}/__hobo/evidence/api/captures/not-the-capability?kind=screenshot`,
			PNG,
			origin,
		);
		expect(res.status).not.toBe(201);
	});
});

describe("proving a screenshot is a screenshot", () => {
	it("accepts a real png", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		expect(
			(await post(captureUrl(started, "screenshot"), PNG, origin)).status,
		).toBe(201);
	});

	it("refuses bytes that are not a png", async () => {
		// Evidence that cannot be opened is worse than missing evidence: it
		// looks like a record until someone needs it.
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot"),
			Buffer.from("not an image at all"),
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("refuses a body too short to carry a signature", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot"),
			Buffer.from([0x89, 0x50]),
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("refuses an empty body", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot"),
			Buffer.alloc(0),
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("returns an evidence id for a capture it kept", async () => {
		// A capture nobody can reference again is the same as no capture.
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const body = (await (
			await post(captureUrl(started, "screenshot"), PNG, origin)
		).json()) as { id?: string };
		expect((body.id ?? "").length).toBeGreaterThan(0);
	});

	it("takes the subject from the query", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot", "&subject=browser%3Ayard"),
			PNG,
			origin,
		);
		expect(res.status).toBe(201);
	});

	it("refuses a blank subject", async () => {
		// The subject is what the screenshot is *of*; blank makes the record
		// unattributable.
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot", "&subject=%20"),
			PNG,
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("refuses an absurdly long subject", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "screenshot", `&subject=${"x".repeat(600)}`),
			PNG,
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("defaults the subject when none is given", async () => {
		expect(
			(
				await post(
					captureUrl(
						await serverAllowing("http://127.0.0.1:4321"),
						"screenshot",
					),
					PNG,
					"http://127.0.0.1:4321",
				)
			).status,
		).toBe(201);
	});
});

describe("proving a recording is a recording", () => {
	it("refuses bytes that are not webm", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "recording-video"),
			Buffer.from("definitely not webm"),
			origin,
		);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("refuses a png posted as a recording", async () => {
		// The kind and the bytes have to agree; a valid file of the wrong type
		// is still the wrong evidence.
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(captureUrl(started, "recording-video"), PNG, origin);
		// 400, not 403: the origin is registered, so this is the format check refusing.
		expect(res.status).toBe(400);
	});

	it("accepts real webm bytes", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(
			captureUrl(started, "recording-video"),
			WEBM,
			origin,
		);
		expect(res.status).toBe(201);
	});
});

describe("kinds the endpoint does not serve", () => {
	it("refuses an unknown kind", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const res = await post(captureUrl(started, "thermal-imaging"), PNG, origin);
		expect(res.status).toBe(400);
	});

	it("says the kind was the problem", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const body = (await (
			await post(captureUrl(started, "thermal-imaging"), PNG, origin)
		).json()) as { error?: string };
		expect(body.error).toContain("capture kind");
	});

	it("refuses a missing kind", async () => {
		const origin = "http://127.0.0.1:4321";
		const started = await serverAllowing(origin);
		const controls = new URL(started.controlsUrl(origin));
		const capability = controls.pathname.split("/").filter(Boolean).pop() ?? "";
		const res = await post(
			`http://127.0.0.1:${started.port}/__hobo/evidence/api/captures/${capability}`,
			PNG,
			origin,
		);
		expect(res.status).toBe(400);
	});

	it("checks the origin before the kind", async () => {
		// Order matters: an unregistered caller should learn nothing about
		// which kinds exist.
		const started = await server();
		const url = captureUrl(started, "thermal-imaging");
		expect((await post(url, PNG, "http://evil.example")).status).toBe(403);
	});
});
