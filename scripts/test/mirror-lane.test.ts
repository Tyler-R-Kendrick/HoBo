/**
 * The mirror lane's process side (scripts/lib/mirror-lane.ts and
 * scripts/run-mirror-lane.mts): which binary runs, how it is started and
 * stopped, and what happens when there is none. A stand-in `mirror` (a Node
 * script) plays the emulator; the real one runs only in `pnpm run test:mirror`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
	MIRROR_LANE_SEED,
	MIRROR_LANE_SERVICES,
	MirrorLaneError,
	resolveMirrorBin,
	startMirror,
	summarizeJournal,
} from "../lib/mirror-lane.ts";
import { PinsError } from "../lib/pins.ts";
import { cachedPath } from "../lib/pins-assets.ts";
import {
	REPO_ROOT,
	scratch,
	sha256Hex,
	writeManifest,
} from "./support/pins-support.ts";

const FAKE_MIRROR = `#!/usr/bin/env node
const { createServer } = require("node:http");
const { existsSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const bind = args[args.indexOf("--bind") + 1];
const [host, port] = bind.split(":");
const mode = process.env.FAKE_MIRROR_MODE ?? "ok";
if (mode === "exit") { console.error("mirror: cannot load specs"); process.exit(3); }
if (mode === "busy-once" && !existsSync(process.env.FAKE_MIRROR_MARK)) {
	writeFileSync(process.env.FAKE_MIRROR_MARK, "x");
	console.error("listen tcp " + bind + ": bind: address already in use");
	process.exit(1);
}
const server = createServer((request, response) => {
	if (mode === "unhealthy") { response.writeHead(503); response.end("{}"); return; }
	response.writeHead(200, { "content-type": "application/json" });
	if (request.url === "/_mirror/health") { response.end('{"status":"ok","uptime_ms":0,"version":"fake"}'); return; }
	response.end(JSON.stringify({ args, clock: process.env.MIRROR_CLOCK, faults: process.env.MIRROR_VERCEL_FAULTS }));
});
setTimeout(() => server.listen(Number(port), host, () => console.log("mirror fake listening on http://" + bind)), 150);
process.on("SIGTERM", () => { console.log("mirror fake: SIGTERM"); process.exit(0); });
`;

function fakeMirror(): string {
	const dir = scratch("mirror-lane");
	const bin = join(dir, "mirror");
	writeFileSync(bin, FAKE_MIRROR);
	chmodSync(bin, 0o755);
	return bin;
}

function getJson(url: string): Promise<{
	readonly args: readonly string[];
	readonly clock: string;
	readonly faults: string;
}> {
	return fetch(url).then((response) => response.json());
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("resolveMirrorBin", () => {
	it("takes MIRROR_BIN and says it is an unverified local build", async () => {
		const bin = fakeMirror();
		const found = await resolveMirrorBin({ MIRROR_BIN: bin }, REPO_ROOT);
		assert.equal(found.path, bin);
		assert.equal(found.verified, false);
		assert.match(found.origin, /MIRROR_BIN .*unverified/u);
	});

	it("refuses a MIRROR_BIN that is not an executable file", async () => {
		const dir = scratch("mirror-lane");
		const plain = join(dir, "mirror");
		writeFileSync(plain, "not executable");
		await assert.rejects(
			resolveMirrorBin({ MIRROR_BIN: plain }, REPO_ROOT),
			(error: Error) =>
				error instanceof MirrorLaneError &&
				error.code === "MIRROR_BIN_UNUSABLE",
		);
		await assert.rejects(
			resolveMirrorBin({ MIRROR_BIN: join(dir, "absent") }, REPO_ROOT),
			/MIRROR_BIN_UNUSABLE/u,
		);
	});

	it("refuses MIRROR_BIN in CI the way pins:status does, unless HOBO_PINS_ALLOW_OVERRIDE=1", async () => {
		const bin = fakeMirror();
		await assert.rejects(
			resolveMirrorBin({ MIRROR_BIN: bin, CI: "true" }, REPO_ROOT),
			(error: Error) =>
				error instanceof PinsError && error.code === "OVERRIDE_IN_CI",
		);
		const allowed = await resolveMirrorBin(
			{ MIRROR_BIN: bin, CI: "true", HOBO_PINS_ALLOW_OVERRIDE: "1" },
			REPO_ROOT,
		);
		assert.equal(allowed.verified, false);
	});

	it("fails with MIRROR_BIN_REQUIRED, and the build command, when nothing is pinned or named", async () => {
		const root = scratch("mirror-lane");
		writeManifest(root, `{"mirror":null,"opensesame-kit":null}`);
		await assert.rejects(
			resolveMirrorBin({ MIRROR_BIN: "" }, root),
			(error: Error) =>
				error instanceof MirrorLaneError &&
				error.code === "MIRROR_BIN_REQUIRED" &&
				/go build -o <dir>\/mirror \.\/cmd\/mirror/u.test(error.message),
		);
	});

	it("runs a pinned release only from the cache, after re-hashing it", async () => {
		const root = scratch("mirror-lane");
		const cache = scratch("mirror-lane");
		const bytes = "#!/bin/sh\nexit 0\n";
		const sha256 = sha256Hex(bytes);
		const file = `{"url":"https://example.com/mirror-linux-x64","sha256":"${sha256}","size":${bytes.length},"entry":"mirror"}`;
		writeManifest(
			root,
			`{"mirror":{"repo":"https://example.com/o/mirror","tag":"v1.0.0","files":{"linux-x64":${file}}},"opensesame-kit":null}`,
		);
		const env = { XDG_CACHE_HOME: cache };

		await assert.rejects(
			resolveMirrorBin(env, root, "linux-x64"),
			/MIRROR_NOT_FETCHED: .*not in the cache.*pins:fetch mirror/u,
		);

		const path = cachedPath(join(cache, "siblings"), {
			url: "https://example.com/mirror-linux-x64",
			sha256,
			size: bytes.length,
			entry: "mirror",
		});
		mkdirSync(join(cache, "siblings", sha256), {
			recursive: true,
			mode: 0o700,
		});
		chmodSync(join(cache, "siblings"), 0o700);
		writeFileSync(path, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
		await assert.rejects(
			resolveMirrorBin(env, root, "linux-x64"),
			/MIRROR_NOT_FETCHED: .*mismatch/u,
		);

		writeFileSync(path, bytes, { mode: 0o755 });
		const found = await resolveMirrorBin(env, root, "linux-x64");
		assert.equal(found.path, path);
		assert.equal(found.verified, true);
		assert.match(found.origin, /pin v1\.0\.0/u);
	});
});

describe("startMirror", () => {
	it("starts the lane's services on a free loopback port with the seed, the controllable clock and the fault routes, and stops it", async () => {
		const mirror = await startMirror({ bin: fakeMirror(), env: process.env });
		try {
			assert.match(mirror.url, /^http:\/\/127\.0\.0\.1:\d+$/u);
			const seen = await getJson(`${mirror.url}/argv`);
			assert.deepEqual(seen.args, [
				"up",
				...MIRROR_LANE_SERVICES,
				"--bind",
				`127.0.0.1:${mirror.port}`,
				"--seed",
				MIRROR_LANE_SEED,
			]);
			assert.equal(seen.clock, "controllable");
			assert.equal(seen.faults, "1");
		} finally {
			await mirror.stop();
		}
		assert.equal(alive(mirror.pid), false);
		assert.match(mirror.output(), /SIGTERM/u);
	});

	it("passes --tls-self-signed and waits for the CA it writes", async () => {
		const tlsDir = scratch("mirror-lane");
		await assert.rejects(
			startMirror({
				bin: fakeMirror(),
				env: process.env,
				tlsDir,
				startTimeoutMs: 1_000,
			}),
			// The stand-in serves plain HTTP and writes no ca.pem: a TLS start
			// must not be reported healthy on the strength of an HTTP answer.
			/MIRROR_UNHEALTHY/u,
		);
	});

	it("fails with MIRROR_START_FAILED and what mirror printed when it exits first", async () => {
		await assert.rejects(
			startMirror({
				bin: fakeMirror(),
				env: { ...process.env, FAKE_MIRROR_MODE: "exit" },
			}),
			(error: Error) =>
				error instanceof MirrorLaneError &&
				error.code === "MIRROR_START_FAILED" &&
				/cannot load specs/u.test(error.message),
		);
	});

	it("tries another port when the chosen one was taken before mirror bound it", async () => {
		const mark = join(scratch("mirror-lane"), "busy");
		const mirror = await startMirror({
			bin: fakeMirror(),
			env: {
				...process.env,
				FAKE_MIRROR_MODE: "busy-once",
				FAKE_MIRROR_MARK: mark,
			},
		});
		await mirror.stop();
		assert.equal(existsSync(mark), true);
	});

	it("gives up with MIRROR_UNHEALTHY and stops the process when health never answers ok", async () => {
		await assert.rejects(
			startMirror({
				bin: fakeMirror(),
				env: { ...process.env, FAKE_MIRROR_MODE: "unhealthy" },
				startTimeoutMs: 1_000,
			}),
			/MIRROR_UNHEALTHY/u,
		);
	});
});

describe("summarizeJournal", () => {
	const servers: ReturnType<typeof createServer>[] = [];
	after(() => {
		for (const server of servers) server.close();
	});

	async function journalServer(
		answer: (url: string, response: ServerResponse) => void,
	): Promise<string> {
		const server = createServer((request: IncomingMessage, response) =>
			answer(request.url ?? "", response),
		);
		servers.push(server);
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", () => resolve()),
		);
		// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
		const { port } = server.address() as AddressInfo;
		return `http://127.0.0.1:${port}`;
	}

	function entry(service: string, operation: string, status: number) {
		return { ServiceID: service, Operation: operation, Status: status };
	}

	it("counts per service, operation and status, asking each service for up to 10000 entries", async () => {
		const asked: string[] = [];
		const url = await journalServer((path, response) => {
			asked.push(path);
			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				path.includes("service=vercel.api")
					? JSON.stringify([
							entry("vercel.api", "CreateProject", 200),
							entry("vercel.api", "CreateProject", 200),
							entry("vercel.api", "GetProject", 404),
						])
					: "null\n",
			);
		});

		const summary = await summarizeJournal({ url }, ["vercel.api", "aws.s3"]);

		assert.deepEqual(summary, {
			counts: [
				{
					service: "vercel.api",
					operation: "CreateProject",
					status: 200,
					count: 2,
				},
				{
					service: "vercel.api",
					operation: "GetProject",
					status: 404,
					count: 1,
				},
			],
			truncated: [],
		});
		assert.deepEqual(asked, [
			"/_mirror/journal?service=vercel.api&limit=10000",
			"/_mirror/journal?service=aws.s3&limit=10000",
		]);
	});

	for (const [name, status, body] of [
		["an answer that is not 200", 500, `{"error":"boom"}`],
		["an answer that is not JSON", 200, "<html>busy</html>"],
		["an answer that is not a list", 200, `{"entries":[]}`],
		["an entry that is not an object", 200, `["CreateProject"]`],
	] as const) {
		it(`refuses ${name} with the lane's own MIRROR_JOURNAL_UNREADABLE`, async () => {
			const url = await journalServer((_path, response) => {
				response.writeHead(status, { "content-type": "application/json" });
				response.end(body);
			});
			await assert.rejects(
				summarizeJournal({ url }, ["aws.s3"]),
				(error: Error) =>
					error instanceof MirrorLaneError &&
					error.code === "MIRROR_JOURNAL_UNREADABLE" &&
					/aws\.s3/u.test(error.message),
			);
		});
	}

	it("reports a service whose answer is exactly 100 entries as truncated (an emulator without ?limit=)", async () => {
		const url = await journalServer((_path, response) => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				JSON.stringify(
					Array.from({ length: 100 }, () => entry("aws.s3", "HeadBucket", 200)),
				),
			);
		});
		const summary = await summarizeJournal({ url }, ["aws.s3"]);
		assert.deepEqual(summary.truncated, ["aws.s3"]);
	});
});

describe("run-mirror-lane.mts", () => {
	function lane(args: readonly string[], env: NodeJS.ProcessEnv) {
		return spawnSync(
			process.execPath,
			[
				"--import",
				"tsx",
				join(REPO_ROOT, "scripts/run-mirror-lane.mts"),
				...args,
			],
			{ encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", ...env } },
		);
	}

	it("exits 1 with MIRROR_BIN_REQUIRED when there is no binary: the lane fails, it does not skip", () => {
		const run = lane([], { MIRROR_BIN: "", CI: "" });
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(run.stderr, /fail {2}test:mirror — MIRROR_BIN_REQUIRED/u);
		assert.doesNotMatch(run.stdout, /passed|ok \(/u);
	});

	it("exits 2 on a package without a test:mirror script", () => {
		const run = lane(["--package", "@hobo/core"], {});
		assert.equal(run.status, 2);
		assert.match(run.stderr, /no test:mirror in @hobo\/core/u);
	});
});
