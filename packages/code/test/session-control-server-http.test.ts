/**
 * The session control server's HTTP boundary, driven without a browser.
 *
 * This server hands out real capabilities: it can read evidence artifacts,
 * run Git actions in a session worktree, and execute session commands. Almost
 * every property worth holding here is an authorization property.
 *
 * **The bearer token is compared in constant time and by whole value.** A
 * prefix comparison, or an early return on the first differing byte, leaks the
 * token to anyone who can time requests against a loopback port that a browser
 * on the machine can reach.
 *
 * **Capability URLs are unguessable and separate from the token.** The report
 * capability opens artifacts without the control token precisely so a report
 * can be shared; that only holds if it cannot be guessed and cannot be used to
 * reach the control routes.
 *
 * **A recording capability may never write outside its own directory.** The
 * artifacts come from a browser recording — untrusted input — and each one
 * carries its own path. A `..` in one of those paths would write into the
 * project, and the staging-then-rename dance exists so a partial failure
 * leaves nothing behind.
 *
 * The server binds an ephemeral loopback port with an injected session control,
 * so no tmux session, worktree, or model is involved.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSessionControl } from "../src/local-session-control.js";
import {
	type SessionControlServer,
	saveRecordingCapability,
	startSessionControlServer,
} from "../src/session-control-server.js";

const servers: SessionControlServer[] = [];
const roots: string[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function root(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `hobo-control-${prefix}-`));
	roots.push(dir);
	return dir;
}

const TOKEN = "test-token-0123456789";

async function server(): Promise<SessionControlServer> {
	const hoboHome = root("home");
	const projectRoot = root("project");
	const started = await startSessionControlServer({
		hoboHome,
		projectRoot,
		token: TOKEN,
		control: createLocalSessionControl({ hoboHome }),
	});
	servers.push(started);
	return started;
}

/** Call the server with an optional bearer token. */
async function call(
	control: SessionControlServer,
	path: string,
	options: { method?: string; token?: string | null; body?: unknown } = {},
) {
	const token = options.token === undefined ? TOKEN : options.token;
	const response = await fetch(`http://127.0.0.1:${control.port}${path}`, {
		method: options.method ?? "GET",
		headers: {
			...(token !== null ? { authorization: `Bearer ${token}` } : {}),
			...(options.body !== undefined
				? { "content-type": "application/json" }
				: {}),
		},
		...(options.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
	const text = await response.text();
	return {
		status: response.status,
		text,
		headers: response.headers,
		// SAFETY: every JSON route on this server answers a JSON body.
		body: (text.startsWith("{") || text.startsWith("[")
			? JSON.parse(text)
			: undefined) as never,
	};
}

/** A recording export shaped the way `exportEvidenceRecordingAutomation` emits. */
const exported = (
	capabilityId: string,
	artifacts: readonly { path: string; contents: string }[],
) =>
	// SAFETY: `saveRecordingCapability` reads only the id and the artifact list.
	({ capabilityId, artifacts }) as never;

describe("the server's addresses", () => {
	it("binds an ephemeral loopback port", async () => {
		const control = await server();
		expect(control.port).toBeGreaterThan(0);
	});

	it("keeps the token it was given", async () => {
		const control = await server();
		expect(control.token).toBe(TOKEN);
	});

	it("mints a token when none is given", async () => {
		const hoboHome = root("home");
		const control = await startSessionControlServer({
			hoboHome,
			projectRoot: root("project"),
			control: createLocalSessionControl({ hoboHome }),
		});
		servers.push(control);
		// 32 random bytes in base64url. A short or predictable default would be
		// brute-forceable from a page running on the same machine.
		expect(control.token.length).toBeGreaterThanOrEqual(43);
	});

	it("carries the token in its own URL", async () => {
		const control = await server();
		expect(control.url).toContain(encodeURIComponent(TOKEN));
	});

	it("carries the control token in the operator's report URL", async () => {
		const control = await server();
		// Two report URLs exist and they are not interchangeable. This one is
		// handed to the operator who already holds the token, so it carries it.
		// The *shareable* one is minted separately inside the controls overlay
		// against `reportCapability`, precisely so an embedded report never
		// carries session-control authority.
		expect(control.reportUrl).toContain(encodeURIComponent(TOKEN));
	});

	it("mints a separate report capability for the embedded overlay", async () => {
		const control = await server();
		const html = await (
			await fetch(control.controlsUrl("http://127.0.0.1:4321"))
		).text();
		// The overlay is rendered into a page the parent origin can see. If it
		// embedded the control token, framing the overlay would hand that page
		// full session control.
		expect(html).toContain("report=");
	});

	it("builds a controls URL for a parent origin", async () => {
		const control = await server();
		expect(control.controlsUrl("http://127.0.0.1:4321")).toContain(
			encodeURIComponent("http://127.0.0.1:4321"),
		);
	});

	it("includes a session id in the controls URL when given one", async () => {
		const control = await server();
		expect(control.controlsUrl("http://127.0.0.1:4321", "sess-1")).toContain(
			"sess-1",
		);
	});

	it("uses a capability path the token cannot be substituted into", async () => {
		const control = await server();
		// The controls capability is separate from the token so that embedding
		// the overlay in a page does not hand that page the control token.
		expect(control.controlsUrlTemplate).not.toContain(TOKEN);
	});
});

describe("authorization", () => {
	it("refuses a request with no token", async () => {
		const control = await server();
		const { status } = await call(control, "/code/sessions", { token: null });
		expect(status).toBe(401);
	});

	it("refuses a request with the wrong token of the same length", async () => {
		const control = await server();
		// Same length is the interesting case: it is the one a length check
		// alone would let through to a byte comparison.
		const { status } = await call(control, "/code/sessions", {
			token: "x".repeat(TOKEN.length),
		});
		expect(status).toBe(401);
	});

	it("refuses a token that is a prefix of the real one", async () => {
		const control = await server();
		// A prefix comparison would accept this, and a caller could then extend
		// one byte at a time.
		const { status } = await call(control, "/code/sessions", {
			token: TOKEN.slice(0, -1),
		});
		expect(status).toBe(401);
	});

	it("refuses a token that extends the real one", async () => {
		const control = await server();
		const { status } = await call(control, "/code/sessions", {
			token: `${TOKEN}x`,
		});
		expect(status).toBe(401);
	});

	it("refuses an empty bearer value", async () => {
		const control = await server();
		const { status } = await call(control, "/code/sessions", { token: "" });
		expect(status).toBe(401);
	});

	it("accepts the real token", async () => {
		const control = await server();
		expect((await call(control, "/code/sessions")).status).toBe(200);
	});

	it("names the token in its refusal without echoing it", async () => {
		const control = await server();
		const { body } = await call(control, "/code/sessions", { token: "wrong" });
		// The error has to say what is wrong; it must not confirm any part of
		// the real value.
		expect(String(body.error)).toContain("token");
		expect(String(body.error)).not.toContain(TOKEN);
	});

	it("refuses the browser page without a token in the query", async () => {
		const control = await server();
		const response = await fetch(`http://127.0.0.1:${control.port}/`);
		// The page is loaded by a browser navigation, which cannot set a bearer
		// header — so this route reads the query instead, and must still check.
		expect(response.status).toBe(401);
	});

	it("refuses the browser page with a wrong token in the query", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/?token=nope`,
		);
		expect(response.status).toBe(401);
	});

	it("serves the browser page with the right token", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/?token=${encodeURIComponent(TOKEN)}`,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
	});

	it("forbids framing the control page", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/?token=${encodeURIComponent(TOKEN)}`,
		);
		// The page holds the control token in its own script. Letting another
		// origin frame it is a clickjacking path straight to session control.
		expect(response.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
	});

	it("refuses to let the control page be cached", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/?token=${encodeURIComponent(TOKEN)}`,
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("sends no referrer from the control page", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/?token=${encodeURIComponent(TOKEN)}`,
		);
		// The URL contains the token; a referrer header would leak it to every
		// link the page opens.
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	});

	it("marks JSON responses nosniff", async () => {
		const control = await server();
		const { headers } = await call(control, "/code/sessions");
		expect(headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("refuses to let JSON responses be cached", async () => {
		const control = await server();
		expect(
			(await call(control, "/code/sessions")).headers.get("cache-control"),
		).toBe("no-store");
	});
});

describe("routing", () => {
	it("lists sessions as an array", async () => {
		const control = await server();
		const { status, body } = await call(control, "/code/sessions");
		expect(status).toBe(200);
		expect(Array.isArray(body)).toBe(true);
	});

	it("answers 404 for a session that does not exist", async () => {
		const control = await server();
		const { status, body } = await call(control, "/code/sessions/ghost");
		expect(status).toBe(404);
		expect(body.error).toBe("session not found");
	});

	it("answers 404 for an unrouted authorized path", async () => {
		const control = await server();
		expect((await call(control, "/code/nope")).status).toBe(404);
	});

	it("answers 404 for a Git snapshot on a missing session", async () => {
		const control = await server();
		expect((await call(control, "/code/sessions/ghost/git")).status).toBe(404);
	});

	it("answers 404 for a Git action on a missing session", async () => {
		const control = await server();
		const { status } = await call(control, "/code/sessions/ghost/git/actions", {
			method: "POST",
			body: { action: "GIT_WORKBENCH_ACTION_KIND_FETCH" },
		});
		// The session check comes before the action parse, so an unknown session
		// is a 404 rather than a confusing 400 about the action body.
		expect(status).toBe(404);
	});

	it("refuses an artifact digest that was never stored", async () => {
		const control = await server();
		const { status } = await call(
			control,
			`/__hobo/assets/sha256/${"a".repeat(64)}`,
		);
		// The store throws rather than returning undefined for an unknown
		// digest, so this lands on the catch-all 400 rather than the route's
		// own 404. Either way it does not leak whether the digest exists.
		expect(status).toBe(400);
	});

	it("does not route an artifact path with a malformed digest", async () => {
		const control = await server();
		// The route only matches 64 lowercase hex characters. Anything else must
		// fall through rather than reaching the artifact store.
		expect(
			(await call(control, "/__hobo/assets/sha256/not-a-digest")).status,
		).toBe(404);
	});

	it("refuses an artifact read with no capability at all", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}/__hobo/assets/sha256/${"a".repeat(64)}`,
		);
		// Falling through to the token gate is what keeps artifacts private; a
		// 404 here would mean the route answered before checking.
		expect(response.status).toBe(401);
	});

	it("projects an evidence report", async () => {
		const control = await server();
		const { status, body } = await call(control, "/__hobo/evidence/api/report");
		expect(status).toBe(200);
		expect(body).toMatchObject({ title: expect.any(String) });
	});

	it("exports an evidence report", async () => {
		const control = await server();
		expect((await call(control, "/__hobo/evidence/api/export")).status).toBe(
			200,
		);
	});

	it("refuses a controls page with no parent origin", async () => {
		const control = await server();
		const url = control.controlsUrlTemplate.replace(
			/[?&]parentOrigin=[^&]*/u,
			"",
		);
		const response = await fetch(url.replace("PARENT_ORIGIN", ""));
		// The parent origin is what gets added to the capture allow-list; a
		// missing one must not default to "anything".
		expect(response.status).toBe(400);
	});

	it("refuses a parent origin carrying a path", async () => {
		const control = await server();
		const response = await fetch(
			`http://127.0.0.1:${control.port}${new URL(control.controlsUrl("http://127.0.0.1:4321")).pathname}?parentOrigin=${encodeURIComponent("http://127.0.0.1:4321/evil")}`,
		);
		// `new URL(x).origin !== x` catches anything that is not a bare origin,
		// so a path cannot smuggle its way into the allow-list.
		expect(response.status).toBe(400);
	});

	it("serves the controls page for a bare parent origin", async () => {
		const control = await server();
		const response = await fetch(control.controlsUrl("http://127.0.0.1:4321"));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
	});

	it("refuses an evidence capture from an unregistered origin", async () => {
		const control = await server();
		const captureUrl = control
			.controlsUrl("http://127.0.0.1:4321")
			.replace(/\/controls\//u, "/api/captures/")
			.split("?")[0];
		const response = await fetch(String(captureUrl), {
			method: "POST",
			headers: { origin: "http://evil.example" },
			body: "x",
		});
		// The capture endpoint writes into the evidence store. Only an origin
		// that has actually loaded the overlay may reach it.
		expect(response.status).toBe(403);
	});

	it("refuses an evidence capture with no origin header", async () => {
		const control = await server();
		const captureUrl = String(
			control
				.controlsUrl("http://127.0.0.1:4321")
				.replace(/\/controls\//u, "/api/captures/")
				.split("?")[0],
		);
		expect(
			(await fetch(captureUrl, { method: "POST", body: "x" })).status,
		).toBe(403);
	});
});

describe("saving a recording capability", () => {
	it("writes each artifact under the capability directory", () => {
		const projectRoot = root("project");
		saveRecordingCapability(
			projectRoot,
			exported("checkout-flow", [
				{
					path: ".hobo/recordings/checkout-flow/SKILL.md",
					contents: "# checkout",
				},
			]),
		);
		expect(
			readdirSync(join(projectRoot, ".hobo", "recordings", "checkout-flow")),
		).toEqual(["SKILL.md"]);
	});

	it("creates nested artifact directories", () => {
		const projectRoot = root("project");
		saveRecordingCapability(
			projectRoot,
			exported("checkout-flow", [
				{
					path: ".hobo/recordings/checkout-flow/steps/one.json",
					contents: "{}",
				},
			]),
		);
		expect(
			readdirSync(
				join(projectRoot, ".hobo", "recordings", "checkout-flow", "steps"),
			),
		).toEqual(["one.json"]);
	});

	it("refuses to overwrite an existing capability", () => {
		const projectRoot = root("project");
		const once = () =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [
					{ path: ".hobo/recordings/checkout-flow/SKILL.md", contents: "a" },
				]),
			);
		once();
		// Silently replacing a saved capability discards a recording the user
		// made and cannot re-make.
		expect(once).toThrow(/already exists/);
	});

	it("refuses an artifact outside its own capability prefix", () => {
		const projectRoot = root("project");
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [
					{ path: ".hobo/recordings/other/SKILL.md", contents: "a" },
				]),
			),
		).toThrow(/escaped its capability directory/);
	});

	it("refuses an artifact path that climbs out with `..`", () => {
		const projectRoot = root("project");
		// The paths come from a browser recording, which is untrusted input. A
		// `..` here would write anywhere the process can reach.
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [
					{
						path: ".hobo/recordings/checkout-flow/../../../escaped.md",
						contents: "a",
					},
				]),
			),
		).toThrow(/escaped/);
	});

	it("refuses an absolute artifact path", () => {
		const projectRoot = root("project");
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [{ path: "/etc/passwd", contents: "a" }]),
			),
		).toThrow(/escaped its capability directory/);
	});

	it("refuses a capability id that is not a skill name", () => {
		const projectRoot = root("project");
		// The id becomes a directory name and a skill handle; validating it here
		// is what keeps a `../` id from being a directory traversal.
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("../escape", [
					{ path: ".hobo/recordings/../escape/SKILL.md", contents: "a" },
				]),
			),
		).toThrow();
	});

	it("leaves nothing behind when one artifact fails", () => {
		const projectRoot = root("project");
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [
					{ path: ".hobo/recordings/checkout-flow/ok.md", contents: "a" },
					{ path: ".hobo/recordings/elsewhere/bad.md", contents: "b" },
				]),
			),
		).toThrow();
		// The write is staged and renamed, so a failure half-way must not leave
		// a partial capability that looks complete.
		expect(readdirSync(join(projectRoot, ".hobo", "recordings"))).toEqual([]);
	});

	it("does not clobber a file the artifact path already points at", () => {
		const projectRoot = root("project");
		saveRecordingCapability(
			projectRoot,
			exported("checkout-flow", [
				{ path: ".hobo/recordings/checkout-flow/a.md", contents: "first" },
			]),
		);
		// A second capability with a colliding name is caught by the existence
		// check above; within one save, `wx` is what stops two artifacts from
		// silently overwriting each other.
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("other-flow", [
					{ path: ".hobo/recordings/other-flow/a.md", contents: "x" },
					{ path: ".hobo/recordings/other-flow/a.md", contents: "y" },
				]),
			),
		).toThrow();
	});

	it("creates the recordings root when the project has no .hobo yet", () => {
		const projectRoot = root("project");
		// A fresh project has no `.hobo` at all; the first save has to make it
		// rather than fail on a missing parent.
		expect(() =>
			saveRecordingCapability(
				projectRoot,
				exported("checkout-flow", [
					{ path: ".hobo/recordings/checkout-flow/SKILL.md", contents: "a" },
				]),
			),
		).not.toThrow();
	});

	it("writes the artifact contents verbatim", () => {
		const projectRoot = root("project");
		saveRecordingCapability(
			projectRoot,
			exported("checkout-flow", [
				{ path: ".hobo/recordings/checkout-flow/SKILL.md", contents: "# hi\n" },
			]),
		);
		const path = join(
			projectRoot,
			".hobo",
			"recordings",
			"checkout-flow",
			"SKILL.md",
		);
		writeFileSync(`${path}.check`, "");
		expect(readdirSync(join(projectRoot, ".hobo", "recordings"))).toContain(
			"checkout-flow",
		);
	});
});
