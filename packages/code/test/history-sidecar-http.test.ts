/**
 * The station-local shell-memory sidecar.
 *
 * This is occupancy's own history host for `hobo-code` — a SQLite store of
 * command history, aliases, and environment behind an HTTP surface. It is not
 * an Atuin deploy, so the boundary is ours to get right.
 *
 * **Every field of a recorded command is coerced, not trusted.** A numeric
 * `paneId` is dropped rather than stringified, an unknown actor kind falls
 * back, and a missing `command` coerces to the empty string — which the store
 * then refuses outright. History that silently keeps a malformed entry is
 * worse than one that rejects it, because it looks complete.
 *
 * **An unknown actor kind falls back to `human`.** The alternative — accepting
 * whatever string arrived — would let a caller mislabel automation as a person
 * in the audit trail.
 *
 * **Search filters are read from the query string.** `failed=1` is a literal
 * match rather than a truthiness test, so `failed=0` and `failed=false` both
 * mean "no filter" rather than "only successes".
 *
 * The server binds an ephemeral loopback port over a real on-disk SQLite
 * database in a temp directory, so these tests exercise the whole path.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	HISTORY_SIDECAR_HOSTING,
	HISTORY_SIDECAR_NAME,
	type HistorySidecarServer,
	startHistorySidecar,
} from "../src/history-sidecar-server.js";

const servers: HistorySidecarServer[] = [];
const homes: string[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

async function sidecar(): Promise<HistorySidecarServer> {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-history-"));
	homes.push(hoboHome);
	const server = await startHistorySidecar({
		hoboHome,
		stationId: "station-1",
		environment: "dev",
	});
	servers.push(server);
	return server;
}

/** Call the sidecar and return status plus parsed body. */
async function call(
	server: HistorySidecarServer,
	path: string,
	options: { method?: string; body?: unknown } = {},
) {
	const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
		method: options.method ?? "GET",
		...(options.body !== undefined
			? {
					body: JSON.stringify(options.body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});
	// SAFETY: the sidecar always answers JSON, on every status.
	return { status: response.status, body: (await response.json()) as never };
}

/** Record one command and return the stored event. */
async function record(
	server: HistorySidecarServer,
	body: Record<string, unknown>,
) {
	return await call(server, "/commands", { method: "POST", body });
}

describe("the sidecar's identity", () => {
	it("names itself `history`", () => {
		// Occupancy addresses the sidecar by this name; a rename orphans every
		// `occupancyNamedOrigin("history", ...)` caller.
		expect(HISTORY_SIDECAR_NAME).toBe("history");
	});

	it("declares station hosting rather than a Bindle kind", () => {
		expect(HISTORY_SIDECAR_HOSTING).toBe("station");
	});

	it("publishes an origin carrying its own port", async () => {
		const server = await sidecar();
		expect(server.url).toContain(String(server.port));
	});

	it("binds an ephemeral port when none is asked for", async () => {
		const server = await sidecar();
		// A fixed default would collide with a second station on one host.
		expect(server.port).toBeGreaterThan(0);
	});

	it("hands back the live store, not a copy", async () => {
		const server = await sidecar();
		server.store.setAlias("ll", "ls -l");
		const { body } = await call(server, "/aliases");
		expect(body.aliases).toHaveLength(1);
	});

	it("answers health on the root path", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/");
		expect(status).toBe(200);
		expect(body.name).toBe("history");
	});

	it("answers /health identically", async () => {
		const server = await sidecar();
		expect((await call(server, "/health")).body).toEqual(
			(await call(server, "/")).body,
		);
	});

	it("tolerates a trailing slash", async () => {
		const server = await sidecar();
		expect((await call(server, "/health/")).status).toBe(200);
	});

	it("names the store engine it fronts", async () => {
		const server = await sidecar();
		// The health body is what the capability matrix reads; naming the real
		// store is what keeps it from being reported as a stub.
		expect((await call(server, "/health")).body.engine).toBe(
			"SessionShellStore",
		);
	});

	it("marks responses no-store", async () => {
		const server = await sidecar();
		const response = await fetch(`http://127.0.0.1:${server.port}/health`);
		// Shell history is per-station and often sensitive; a cached copy in an
		// intermediary is a leak.
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("answers 404 for an unrouted path", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/nope");
		expect(status).toBe(404);
		expect(body.error).toBe("not found");
	});

	it("closes cleanly and refuses later connections", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-history-"));
		homes.push(hoboHome);
		const server = await startHistorySidecar({
			hoboHome,
			stationId: "s",
			environment: "dev",
		});
		const port = server.port;
		await server.close();
		await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
	});
});

describe("recording commands", () => {
	it("answers 201 with the stored event", async () => {
		const server = await sidecar();
		const { status, body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
		});
		expect(status).toBe(201);
		expect(body.command).toBe("ls");
	});

	it("stamps the station and environment it was opened with", async () => {
		const server = await sidecar();
		const { body } = await record(server, { command: "ls", cwd: "/tmp" });
		// History from two environments in one store would be indistinguishable
		// without these; a replay would run dev commands against prod.
		expect(body.stationId).toBe("station-1");
		expect(body.environment).toBe("dev");
	});

	it("defaults the session id to `cli`", async () => {
		const server = await sidecar();
		const { body } = await record(server, { command: "ls", cwd: "/tmp" });
		expect(body.sessionId).toBe("cli");
	});

	it("keeps a supplied session id", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			sessionId: "pane-7",
		});
		expect(body.sessionId).toBe("pane-7");
	});

	it("refuses a body with no command", async () => {
		const server = await sidecar();
		// The HTTP layer coerces a missing `command` to the empty string, and the
		// store refuses it there. An empty row would occupy a history slot and a
		// replay would run nothing while reporting a hit.
		const { status, body } = await record(server, { cwd: "/tmp" });
		expect(status).toBe(400);
		expect(body.code).toEqual(expect.any(String));
	});

	it("keeps an agent actor kind", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			actor: { kind: "agent", name: "bo", instanceId: "i-1", generation: 3 },
		});
		expect(body.actor).toMatchObject({ kind: "agent", name: "bo" });
	});

	it("keeps an automation actor kind", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			actor: { kind: "automation" },
		});
		expect(body.actor.kind).toBe("automation");
	});

	it("falls back to human for an unrecognised actor kind", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			actor: { kind: "root" },
		});
		// Accepting the string as given would let a caller invent an actor class
		// the audit trail does not know how to read.
		expect(body.actor.kind).toBe("human");
	});

	it("falls back to human when no actor is given", async () => {
		const server = await sidecar();
		const { body } = await record(server, { command: "ls", cwd: "/tmp" });
		expect(body.actor).toMatchObject({
			kind: "human",
			name: "cli",
			instanceId: "cli",
			generation: 1,
		});
	});

	it("keeps a supplied actor generation", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			actor: { kind: "agent", generation: 9 },
		});
		// Generation is how a replayed agent run is told from the original.
		expect(body.actor.generation).toBe(9);
	});

	it("keeps a pane id when it is a string", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			paneId: "pane-2",
		});
		expect(body.paneId).toBe("pane-2");
	});

	it("drops a non-string pane id", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			paneId: 2,
		});
		// A number coerced into the pane column would look like a real pane that
		// no terminal ever owned.
		expect(body.paneId).toBeUndefined();
	});

	it("records an outcome when one is given", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "false",
			cwd: "/tmp",
			outcome: { exitCode: 1, durationMs: 12 },
		});
		expect(body.outcome).toMatchObject({ exitCode: 1, durationMs: 12 });
	});

	it("defaults outcome fields that are missing", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			outcome: {},
		});
		// A present-but-empty outcome means the command finished; treating the
		// absent exit code as anything but 0 would invent a failure.
		expect(body.outcome).toMatchObject({ exitCode: 0, durationMs: 0 });
	});

	it("omits the outcome when none is given", async () => {
		const server = await sidecar();
		const { body } = await record(server, { command: "sleep 1", cwd: "/tmp" });
		// A command still running has no outcome; a zeroed one would read as a
		// clean exit that never happened.
		expect(body.outcome).toBeUndefined();
	});

	it("ignores an outcome that is not an object", async () => {
		const server = await sidecar();
		const { body } = await record(server, {
			command: "ls",
			cwd: "/tmp",
			outcome: 0,
		});
		expect(body.outcome).toBeUndefined();
	});

	it("gives each recorded command its own id", async () => {
		const server = await sidecar();
		const first = await record(server, { command: "ls", cwd: "/tmp" });
		const second = await record(server, { command: "ls", cwd: "/tmp" });
		// Two identical commands are two events; a shared id would collapse them
		// and lose the repetition that makes history useful.
		expect(second.body.id).not.toBe(first.body.id);
	});

	it("answers 400 for a body that is not JSON", async () => {
		const server = await sidecar();
		const response = await fetch(`http://127.0.0.1:${server.port}/commands`, {
			method: "POST",
			body: "{",
			headers: { "content-type": "application/json" },
		});
		// A malformed body is the caller's fault; it must not surface as a 500.
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: expect.any(String) });
	});
});

describe("searching commands", () => {
	it("lists nothing before anything is recorded", async () => {
		const server = await sidecar();
		expect((await call(server, "/commands")).body.commands).toEqual([]);
	});

	it("lists a recorded command", async () => {
		const server = await sidecar();
		await record(server, { command: "ls", cwd: "/tmp" });
		expect((await call(server, "/commands")).body.commands).toHaveLength(1);
	});

	it("filters by query text", async () => {
		const server = await sidecar();
		await record(server, { command: "git status", cwd: "/tmp" });
		await record(server, { command: "ls", cwd: "/tmp" });
		const { body } = await call(server, "/commands?q=git");
		expect(body.commands).toHaveLength(1);
	});

	it("treats an empty query as no filter", async () => {
		const server = await sidecar();
		await record(server, { command: "ls", cwd: "/tmp" });
		// `?q=` is what a cleared search box sends; it must show everything
		// rather than matching the empty string against nothing.
		expect((await call(server, "/commands?q=")).body.commands).toHaveLength(1);
	});

	it("ranks by working directory rather than filtering on it", async () => {
		const server = await sidecar();
		await record(server, { command: "ls -b", cwd: "/tmp/b" });
		await record(server, { command: "ls -a", cwd: "/tmp/a" });
		const { body } = await call(
			server,
			`/commands?q=ls&cwd=${encodeURIComponent("/tmp/a")}`,
		);
		// `cwd` is a relevance boost, not a filter: a command run elsewhere is
		// still offered, just lower. Treating it as a filter would hide the
		// history a user is most likely reaching for after a `cd`.
		expect(body.commands).toHaveLength(2);
		expect(body.commands[0].cwd).toBe("/tmp/a");
	});

	it("filters to failures with failed=1", async () => {
		const server = await sidecar();
		await record(server, {
			command: "false",
			cwd: "/tmp",
			outcome: { exitCode: 1, durationMs: 1 },
		});
		await record(server, {
			command: "true",
			cwd: "/tmp",
			outcome: { exitCode: 0, durationMs: 1 },
		});
		const { body } = await call(server, "/commands?failed=1");
		expect(body.commands).toHaveLength(1);
		expect(body.commands[0].command).toBe("false");
	});

	it("treats failed=0 as no filter at all", async () => {
		const server = await sidecar();
		await record(server, {
			command: "true",
			cwd: "/tmp",
			outcome: { exitCode: 0, durationMs: 1 },
		});
		// The check is a literal `=== "1"`, so `failed=0` does not mean "only
		// successes" — it means the filter is off. A caller sending a boolean
		// would otherwise think it had narrowed the list.
		expect(
			(await call(server, "/commands?failed=0")).body.commands,
		).toHaveLength(1);
	});

	it("filters by human author", async () => {
		const server = await sidecar();
		await record(server, { command: "ls", cwd: "/tmp" });
		await record(server, {
			command: "git push",
			cwd: "/tmp",
			actor: { kind: "agent" },
		});
		const { body } = await call(server, "/commands?author=human");
		expect(body.commands).toHaveLength(1);
		expect(body.commands[0].command).toBe("ls");
	});

	it("filters by agent author", async () => {
		const server = await sidecar();
		await record(server, { command: "ls", cwd: "/tmp" });
		await record(server, {
			command: "git push",
			cwd: "/tmp",
			actor: { kind: "agent" },
		});
		// Telling agent work from human work in one history is the whole reason
		// the actor kind is recorded.
		expect(
			(await call(server, "/commands?author=agent")).body.commands,
		).toHaveLength(1);
	});

	it("filters by automation author", async () => {
		const server = await sidecar();
		await record(server, {
			command: "cron-job",
			cwd: "/tmp",
			actor: { kind: "automation" },
		});
		expect(
			(await call(server, "/commands?author=automation")).body.commands,
		).toHaveLength(1);
	});

	it("ignores an unrecognised author filter rather than matching nothing", async () => {
		const server = await sidecar();
		await record(server, { command: "ls", cwd: "/tmp" });
		// An empty result for a typo'd filter reads as "no such history"; showing
		// everything makes the mistake visible instead.
		expect(
			(await call(server, "/commands?author=root")).body.commands,
		).toHaveLength(1);
	});
});

describe("aliases", () => {
	it("lists nothing before any alias is set", async () => {
		const server = await sidecar();
		expect((await call(server, "/aliases")).body.aliases).toEqual([]);
	});

	it("sets an alias and returns it", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({ name: "ll", body: "ls -l" });
	});

	it("lists a set alias", async () => {
		const server = await sidecar();
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		expect((await call(server, "/aliases")).body.aliases).toHaveLength(1);
	});

	it("overwrites an alias rather than duplicating it", async () => {
		const server = await sidecar();
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -la" },
		});
		const { body } = await call(server, "/aliases");
		// Two rows for one name would make the exported dotfile define the alias
		// twice, and which one wins depends on row order.
		expect(body.aliases).toHaveLength(1);
		expect(body.aliases[0].body).toBe("ls -la");
	});

	it("stores an empty body when none is given", async () => {
		const server = await sidecar();
		const { body } = await call(server, "/aliases/ll", {
			method: "PUT",
			body: {},
		});
		expect(body.body).toBe("");
	});

	it("decodes a percent-escaped alias name", async () => {
		const server = await sidecar();
		await call(server, "/aliases/%6Cl", {
			method: "PUT",
			body: { body: "ls" },
		});
		// Without the decode the alias would be stored under its escaped form and
		// never match what the shell asks for.
		expect((await call(server, "/aliases")).body.aliases[0].name).toBe("ll");
	});

	it("refuses an alias name a shell could not define", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/aliases/my%20alias", {
			method: "PUT",
			body: { body: "ls" },
		});
		// A name with a space stores fine in SQLite and then breaks the exported
		// dotfile at source time, far from the request that caused it.
		expect(status).toBe(400);
		expect(body.code).toBe("shell-alias-invalid");
	});

	it("refuses an alias body that looks like a secret", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/aliases/deploy", {
			method: "PUT",
			body: { body: "export AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLEKEY123" },
		});
		// Aliases are exported to a dotfile on disk; a credential baked into one
		// outlives the session that set it.
		expect(status).toBe(400);
		expect(String(body.code)).toContain("secret");
	});

	it("removes an alias", async () => {
		const server = await sidecar();
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		const { status, body } = await call(server, "/aliases/ll", {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(body).toEqual({ ok: true });
		expect((await call(server, "/aliases")).body.aliases).toEqual([]);
	});

	it("reports success when removing an alias that was never set", async () => {
		const server = await sidecar();
		// Removal is idempotent: a retried delete must not become an error the
		// caller has to special-case.
		expect(
			(await call(server, "/aliases/ghost", { method: "DELETE" })).status,
		).toBe(200);
	});
});

describe("environment variables", () => {
	it("lists nothing before any variable is set", async () => {
		const server = await sidecar();
		expect((await call(server, "/env")).body.env).toEqual([]);
	});

	it("sets a variable and returns it", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({ name: "EDITOR", value: "vim" });
	});

	it("lists a set variable", async () => {
		const server = await sidecar();
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		expect((await call(server, "/env")).body.env).toHaveLength(1);
	});

	it("overwrites a variable rather than duplicating it", async () => {
		const server = await sidecar();
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "nano" },
		});
		const { body } = await call(server, "/env");
		expect(body.env).toHaveLength(1);
		expect(body.env[0].value).toBe("nano");
	});

	it("stores an empty value when none is given", async () => {
		const server = await sidecar();
		// An explicitly empty variable is different from an unset one; the shell
		// distinguishes them and so must the store.
		expect(
			(await call(server, "/env/EMPTY", { method: "PUT", body: {} })).body
				.value,
		).toBe("");
	});

	it("decodes a percent-escaped variable name", async () => {
		const server = await sidecar();
		await call(server, "/env/%45DITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		expect((await call(server, "/env")).body.env[0].name).toBe("EDITOR");
	});

	it("refuses a variable name a shell could not export", async () => {
		const server = await sidecar();
		const { status, body } = await call(server, "/env/MY%20VAR", {
			method: "PUT",
			body: { value: "1" },
		});
		expect(status).toBe(400);
		expect(String(body.code)).toContain("shell-env");
	});

	it("removes a variable", async () => {
		const server = await sidecar();
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		const { status, body } = await call(server, "/env/EDITOR", {
			method: "DELETE",
		});
		expect(status).toBe(200);
		expect(body).toEqual({ ok: true });
		expect((await call(server, "/env")).body.env).toEqual([]);
	});

	it("reports success when removing a variable that was never set", async () => {
		const server = await sidecar();
		expect(
			(await call(server, "/env/GHOST", { method: "DELETE" })).status,
		).toBe(200);
	});
});

describe("dotfile export", () => {
	it("exports a bash script alongside the raw rows", async () => {
		const server = await sidecar();
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		const { status, body } = await call(server, "/dotfiles");
		expect(status).toBe(200);
		// The script is what a new shell sources; the rows are what a UI renders.
		// Shipping only one of them would force the other side to re-parse.
		expect(typeof body.script).toBe("string");
		expect(body.aliases).toHaveLength(1);
		expect(body.env).toHaveLength(1);
	});

	it("names each alias in the exported script", async () => {
		const server = await sidecar();
		await call(server, "/aliases/ll", {
			method: "PUT",
			body: { body: "ls -l" },
		});
		expect(String((await call(server, "/dotfiles")).body.script)).toContain(
			"ll",
		);
	});

	it("names each variable in the exported script", async () => {
		const server = await sidecar();
		await call(server, "/env/EDITOR", {
			method: "PUT",
			body: { value: "vim" },
		});
		expect(String((await call(server, "/dotfiles")).body.script)).toContain(
			"EDITOR",
		);
	});

	it("exports an empty script when nothing is set", async () => {
		const server = await sidecar();
		// A station with no shell memory must still export something sourceable;
		// a 404 here would make every new shell's startup script fail.
		expect((await call(server, "/dotfiles")).status).toBe(200);
	});
});
