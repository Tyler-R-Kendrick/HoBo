/**
 * The mirror lane's process side (scripts/lib/mirror-lane.ts and
 * scripts/run-mirror-lane.mts): which binary runs, how it is started and
 * stopped, and what happens when there is none. A stand-in `mirror` (a Node
 * script) plays the emulator; the real one runs only in `pnpm run test:mirror`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { get as httpsGet } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
	MIRROR_LANE_SEED,
	MIRROR_LANE_SERVICES,
	MirrorLaneError,
	type RunningMirror,
	resolveMirrorBin,
	startMirror,
	summarizeJournal,
} from "../lib/mirror-lane.ts";
import { PinsError } from "../lib/pins.ts";
import { cachedPath, currentTarget } from "../lib/pins-assets.ts";
import { beacon, fakeMirror, TLS_FIXTURES } from "./support/mirror-fakes.ts";
import {
	REPO_ROOT,
	scratch,
	sha256Hex,
	writeManifest,
} from "./support/pins-support.ts";

function getJson(url: string): Promise<{
	readonly args: readonly string[];
	readonly clock: string;
	readonly faults: string;
	readonly mirrorEnv: readonly string[];
	readonly cwd: string;
	readonly cwdEntries: readonly string[];
	readonly readsConfig: boolean;
}> {
	return fetch(url).then((response) => response.json());
}

/** GET over TLS, trusting only `ca`. */
function getJsonTls(
	url: string,
	ca: string,
): Promise<Awaited<ReturnType<typeof getJson>>> {
	return new Promise((resolve, reject) => {
		httpsGet(url, { ca, agent: false }, (response) => {
			const chunks: Buffer[] = [];
			response.on("data", (chunk: Buffer) => chunks.push(chunk));
			response.on("end", () => {
				try {
					resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
				} catch (error) {
					reject(error);
				}
			});
		}).on("error", reject);
	});
}

/**
 * `startMirror` must refuse: a mirror it started anyway is stopped before the
 * test fails, so a red run leaves no process behind.
 */
async function refusedStart(
	options: Parameters<typeof startMirror>[0],
	refusal: (error: Error) => boolean,
): Promise<void> {
	let started: RunningMirror;
	try {
		started = await startMirror(options);
	} catch (error) {
		assert.ok(error instanceof Error && refusal(error), String(error));
		return;
	}
	await started.stop();
	assert.fail(
		`startMirror answered ${started.url} where it should have refused`,
	);
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
				/go build -o <dir>\/mirror \.\/cmd\/mirror/u.test(error.message) &&
				// mirror publishes archives: the pin is the archive's `mirror` member.
				error.message.includes(
					'"archive": { "format": "tar.gz", "member": "mirror" }',
				) &&
				/pins:bump mirror <tag>/u.test(error.message),
		);
	});

	it("fails with MIRROR_BIN_REQUIRED, naming the file, when the pins root has no pins file", async () => {
		const root = scratch("mirror-lane");
		await assert.rejects(
			resolveMirrorBin({ MIRROR_BIN: "" }, root),
			(error: Error) =>
				error instanceof MirrorLaneError &&
				error.code === "MIRROR_BIN_REQUIRED" &&
				error.message.includes(join(root, "tools/pins/siblings.json")),
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
		// The origin line names the pins file the pin came from.
		assert.ok(
			found.origin.includes(join(root, "tools/pins/siblings.json")),
			found.origin,
		);
	});
});

/**
 * A pins root holding a pin for this machine's target, and a cache holding
 * bytes that match it: a script that records that it ran. What a CI job
 * would run if `--pins-root` let it pick its own pin.
 */
interface PinnedElsewhere {
	readonly pinsRoot: string;
	readonly cache: string;
	/** Written by the pinned bytes when they run. */
	readonly ran: string;
}

function pinnedElsewhere(): PinnedElsewhere {
	const pinsRoot = scratch("mirror-lane");
	const cache = scratch("mirror-lane");
	const ran = join(scratch("mirror-lane"), "ran");
	const bytes = `#!/bin/sh\necho ran > ${JSON.stringify(ran)}\nexit 3\n`;
	const sha256 = sha256Hex(bytes);
	const url = "https://example.com/mirror";
	writeManifest(
		pinsRoot,
		`{"mirror":{"repo":"https://example.com/o/mirror","tag":"v9.9.9","files":{"${currentTarget()}":{"url":"${url}","sha256":"${sha256}","size":${bytes.length},"entry":"mirror"}}},"opensesame-kit":null}`,
	);
	mkdirSync(join(cache, "siblings", sha256), { recursive: true, mode: 0o700 });
	chmodSync(join(cache, "siblings"), 0o700);
	writeFileSync(
		cachedPath(join(cache, "siblings"), {
			url,
			sha256,
			size: bytes.length,
			entry: "mirror",
		}),
		bytes,
		{ mode: 0o755 },
	);
	return { pinsRoot, cache, ran };
}

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

	it("gives mirror no MIRROR_* variable but the two the lane sets", async () => {
		const mirror = await startMirror({
			bin: fakeMirror(),
			env: {
				...process.env,
				MIRROR_STRICT: "1",
				MIRROR_PERSIST: "/tmp/hobo-mirror-lane-not-this",
				MIRROR_CLOCK: "real",
				MIRROR_VERCEL_FAULTS: "0",
				MIRROR_BIND: "0.0.0.0:4566",
			},
		});
		try {
			const seen = await getJson(`${mirror.url}/argv`);
			assert.deepEqual(seen.mirrorEnv, [
				"MIRROR_CLOCK=controllable",
				"MIRROR_VERCEL_FAULTS=1",
			]);
		} finally {
			await mirror.stop();
		}
	});

	it("runs mirror in an empty directory of its own, so no .mirror/config.json is read, and removes it", async () => {
		const outer = scratch("mirror-lane");
		mkdirSync(join(outer, ".mirror"));
		writeFileSync(
			join(outer, ".mirror", "config.json"),
			`{"bind":"0.0.0.0:4566","strict":true}`,
		);
		const before = process.cwd();
		process.chdir(outer);
		let seen: Awaited<ReturnType<typeof getJson>>;
		try {
			const mirror = await startMirror({ bin: fakeMirror(), env: process.env });
			try {
				seen = await getJson(`${mirror.url}/argv`);
			} finally {
				await mirror.stop();
			}
		} finally {
			process.chdir(before);
		}
		assert.equal(seen.readsConfig, false);
		assert.notEqual(seen.cwd, realpathSync(outer));
		assert.equal(seen.cwd.startsWith(realpathSync(tmpdir())), true);
		assert.deepEqual(seen.cwdEntries, []);
		assert.equal(existsSync(seen.cwd), false);
	});

	it("passes --tls-self-signed and waits for the CA it writes", async () => {
		const tlsDir = scratch("mirror-lane");
		const mirror = await startMirror({
			bin: fakeMirror(),
			env: { ...process.env, FAKE_MIRROR_TLS_FIXTURES: TLS_FIXTURES },
			tlsDir,
		});
		try {
			assert.match(mirror.url, /^https:\/\/127\.0\.0\.1:\d+$/u);
			assert.equal(mirror.caFile, join(tlsDir, "ca.pem"));
			const flag = mirror.args.indexOf("--tls-self-signed");
			assert.notEqual(flag, -1, mirror.args.join(" "));
			assert.equal(mirror.args[flag + 1], tlsDir);
			// What the emulator itself was started with, read over its TLS with its CA.
			const seen = await getJsonTls(
				`${mirror.url}/argv`,
				readFileSync(join(tlsDir, "ca.pem"), "utf8"),
			);
			assert.deepEqual(seen.args.slice(-2), ["--tls-self-signed", tlsDir]);
		} finally {
			await mirror.stop();
		}
	});

	it("does not report a TLS start healthy on the strength of a plain-HTTP banner", async () => {
		const tlsDir = scratch("mirror-lane");
		await refusedStart(
			{
				bin: fakeMirror(),
				// The stand-in ignores the flag: it announces http:// and writes no ca.pem.
				env: { ...process.env, FAKE_MIRROR_MODE: "plain" },
				tlsDir,
				startTimeoutMs: 1_000,
			},
			(error) => /MIRROR_UNHEALTHY: .*listening on https:/u.test(error.message),
		);
	});

	it("fails with MIRROR_START_FAILED and what mirror printed when it exits first", async () => {
		await refusedStart(
			{
				bin: fakeMirror(),
				env: { ...process.env, FAKE_MIRROR_MODE: "exit" },
			},
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

	it("trusts no health answer before mirror's own listening banner", async () => {
		await refusedStart(
			{
				bin: fakeMirror(),
				env: { ...process.env, FAKE_MIRROR_MODE: "no-banner" },
				startTimeoutMs: 500,
			},
			(error: Error) =>
				error instanceof MirrorLaneError &&
				error.code === "MIRROR_UNHEALTHY" &&
				/listening on http:\/\/127\.0\.0\.1:\d+/u.test(error.message),
		);
	});

	for (const [what, health] of [
		[
			"another version",
			'{"status":"ok","uptime_ms":86400000,"version":"another"}',
		],
		// The same build, up for a day: mirror's own child is seconds old.
		[
			"the same version, up longer than mirror's child has lived",
			'{"status":"ok","uptime_ms":86400000,"version":"fake"}',
		],
		["no uptime at all", '{"status":"ok","version":"fake"}'],
	] as const) {
		it(`takes a health answer from another process on the port (${what}) as the port being taken, not as mirror`, async () => {
			const other = createServer((_request, response) => {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(health);
			});
			await new Promise<void>((resolve) =>
				other.listen(0, "127.0.0.1", () => resolve()),
			);
			try {
				// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
				const { port } = other.address() as AddressInfo;
				await refusedStart(
					{ bin: fakeMirror(), env: process.env, port },
					(error: Error) =>
						error instanceof MirrorLaneError &&
						error.code === "MIRROR_START_FAILED" &&
						/taken/u.test(error.message),
				);
			} finally {
				await new Promise<void>((resolve) => other.close(() => resolve()));
			}
		});
	}

	it("two lanes on one port: a mirror that announced before failing to bind (older than mirror.cloud#442) is reported lost, never kept", async () => {
		// Lane 1's mirror holds the port: the same build on a controllable clock,
		// which answers health exactly as lane 2's own child would.
		const lane1 = createServer((_request, response) => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end('{"status":"ok","uptime_ms":0,"version":"fake"}');
		});
		await new Promise<void>((resolve) =>
			lane1.listen(0, "127.0.0.1", () => resolve()),
		);
		const listener = await beacon();
		try {
			// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
			const { port } = lane1.address() as AddressInfo;
			const starting = startMirror({
				bin: fakeMirror(),
				env: {
					...process.env,
					FAKE_MIRROR_MODE: "pre-442",
					FAKE_BEACON: String(listener.port),
				},
				port,
			});
			const child = await listener.next("mirror");
			// Its banner came first and health answered as it would: nothing at
			// start-up tells the two apart.
			const mirror = await starting;
			// Now lane 2's child tries to bind, fails, and exits, as such a mirror does.
			child.tell("bind");
			const lost = await mirror.lost;

			assert.ok(lost instanceof MirrorLaneError, String(lost));
			assert.equal(lost.code, "MIRROR_EXITED");
			assert.match(lost.message, /address already in use/u);
			await mirror.stop();
		} finally {
			await listener.close();
			await new Promise<void>((resolve) => lane1.close(() => resolve()));
		}
	});

	it("a stopped mirror is not reported lost", async () => {
		const mirror = await startMirror({ bin: fakeMirror(), env: process.env });
		const lost = mirror.lost.then(() => "lost");
		await mirror.stop();
		assert.equal(
			await Promise.race([lost, Promise.resolve("stopped")]),
			"stopped",
		);
	});

	it("gives up with MIRROR_UNHEALTHY and stops the process when health never answers ok", async () => {
		const pidFile = join(scratch("mirror-lane"), "pid");
		await refusedStart(
			{
				bin: fakeMirror(),
				env: {
					...process.env,
					FAKE_MIRROR_MODE: "unhealthy",
					FAKE_MIRROR_PIDFILE: pidFile,
				},
				startTimeoutMs: 1_000,
			},
			(error) => /MIRROR_UNHEALTHY/u.test(error.message),
		);
		// startMirror refuses only after the process it started has exited.
		const pid = Number(readFileSync(pidFile, "utf8"));
		const running = alive(pid);
		if (running) process.kill(pid, "SIGKILL");
		assert.equal(running, false, `mirror pid ${pid} still runs`);
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

/** The two fields of turbo.json the test reads. */
interface TurboConfig {
	readonly globalPassThroughEnv?: readonly string[];
	readonly tasks?: { readonly [task: string]: TurboTask };
}

/** A task's settings; only its name matters here. */
interface TurboTask {
	readonly dependsOn?: readonly string[];
}

describe("turbo.json", () => {
	it("declares nothing for the mirror lane: the runner, not turbo, reads MIRROR_BIN and starts each test:mirror", () => {
		// SAFETY: turbo.json is a JSON object; the passthrough list is read as strings and the tasks by name only.
		const turbo = JSON.parse(
			readFileSync(join(REPO_ROOT, "turbo.json"), "utf8"),
		) as TurboConfig;
		assert.equal(
			(turbo.globalPassThroughEnv ?? []).includes("MIRROR_BIN"),
			false,
		);
		assert.deepEqual(
			Object.keys(turbo.tasks ?? {}).filter((task) =>
				task.endsWith("test:mirror"),
			),
			[],
		);
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
		// An empty pins root and an empty cache, never the repository's own pins
		// or the machine's cache: what the outcome depends on is set here.
		const pinsRoot = scratch("mirror-lane");
		const cache = scratch("mirror-lane");
		const run = lane(["--pins-root", pinsRoot], {
			MIRROR_BIN: "",
			CI: "",
			XDG_CACHE_HOME: cache,
		});
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(run.stderr, /fail {2}test:mirror — MIRROR_BIN_REQUIRED/u);
		assert.ok(
			run.stderr.includes(join(pinsRoot, "tools/pins/siblings.json")),
			run.stderr,
		);
		assert.doesNotMatch(run.stdout, /passed|ok \(/u);
	});

	it("refuses --pins-root other than this repository in CI, as pins:status refuses an override, and runs nothing", () => {
		const elsewhere = pinnedElsewhere();
		const run = lane(["--pins-root", elsewhere.pinsRoot], {
			MIRROR_BIN: "",
			CI: "true",
			XDG_CACHE_HOME: elsewhere.cache,
		});
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(run.stderr, /OVERRIDE_IN_CI: --pins-root/u);
		assert.ok(run.stderr.includes(elsewhere.pinsRoot), run.stderr);
		assert.equal(existsSync(elsewhere.ran), false, "the pinned binary ran");
	});

	it("takes --pins-root in CI with HOBO_PINS_ALLOW_OVERRIDE=1, and says which pins file it read", () => {
		const elsewhere = pinnedElsewhere();
		const run = lane(["--pins-root", elsewhere.pinsRoot], {
			MIRROR_BIN: "",
			CI: "true",
			HOBO_PINS_ALLOW_OVERRIDE: "1",
			XDG_CACHE_HOME: elsewhere.cache,
		});
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(
			run.stdout,
			new RegExp(
				`from pin v9\\.9\\.9 in ${join(elsewhere.pinsRoot, "tools/pins/siblings.json").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
				"u",
			),
		);
		// The pinned bytes ran (and, being a stand-in, exited at once).
		assert.equal(existsSync(elsewhere.ran), true);
		assert.match(run.stderr, /MIRROR_START_FAILED/u);
	});

	it("reads the pin from --pins-root and the cache from XDG_CACHE_HOME", () => {
		const pinsRoot = scratch("mirror-lane");
		const cache = scratch("mirror-lane");
		const sha256 = "a".repeat(64);
		writeManifest(
			pinsRoot,
			`{"mirror":{"repo":"https://example.com/o/mirror","tag":"v9.9.9","files":{"${currentTarget()}":{"url":"https://example.com/mirror","sha256":"${sha256}","size":1,"entry":"mirror"}}},"opensesame-kit":null}`,
		);
		const run = lane(["--pins-root", pinsRoot], {
			MIRROR_BIN: "",
			CI: "",
			XDG_CACHE_HOME: cache,
		});
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(
			run.stderr,
			/MIRROR_NOT_FETCHED: the pinned mirror v9\.9\.9 is not in the cache/u,
		);
		assert.ok(run.stderr.includes(join(cache, "siblings")), run.stderr);
	});

	it("exits 2 on a package without a test:mirror script", () => {
		const run = lane(["--package", "@hobo/core"], {});
		assert.equal(run.status, 2);
		assert.match(run.stderr, /no test:mirror in @hobo\/core/u);
	});

	it("exits 2 on a stop grace that is not a positive number of milliseconds", () => {
		const run = lane([], {
			MIRROR_BIN: fakeMirror(),
			HOBO_MIRROR_LANE_STOP_GRACE_MS: "soon",
		});
		assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
		assert.match(
			run.stderr,
			/HOBO_MIRROR_LANE_STOP_GRACE_MS must be a positive integer \(milliseconds\), not "soon"/u,
		);
	});
});
