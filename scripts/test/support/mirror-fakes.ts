/**
 * Stand-ins for the processes the mirror lane runs, for
 * scripts/test/mirror-lane*.test.ts: a `mirror` that behaves as mirror.cloud
 * does at start-up (its bind, then its banner, as since mirror.cloud#442, or
 * the older order in the `pre-442` and `banner-before-bind` modes;
 * `--tls-self-signed`), and a
 * `pnpm` that starts a worker which ignores SIGTERM, the way a package run
 * starts vitest and its workers. Each can report its pid to a beacon, a
 * loopback socket a test listens on; the socket's close is how the test learns
 * the process ended, without polling.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer, type Socket } from "node:net";
import { join } from "node:path";
import process from "node:process";

import { REPO_ROOT, scratch } from "./pins-support.ts";

/** The test-only certificates the stand-in serves TLS with (their README says what they are). */
export const TLS_FIXTURES = join(
	REPO_ROOT,
	"packages/contract-harness/test/fixtures/tls",
);

export const FAKE_MIRROR = `#!/usr/bin/env node
const { createServer } = require("node:http");
const { createServer: createTlsServer } = require("node:https");
const { copyFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
const bind = args[args.indexOf("--bind") + 1];
const [host, port] = bind.split(":");
const mode = process.env.FAKE_MIRROR_MODE ?? "ok";
if (process.env.FAKE_MIRROR_PIDFILE) writeFileSync(process.env.FAKE_MIRROR_PIDFILE, String(process.pid));
// Tell a waiting test who we are; the socket closes when this process ends.
// It also takes orders on that socket: "bind" (FAKE_MIRROR_MODE=pre-442 binds
// only then, and exits if it cannot) and "exit".
const orders = [];
const onOrder = (order, run) => orders.push([order, run]);
if (process.env.FAKE_BEACON) {
	const beacon = require("node:net").connect(Number(process.env.FAKE_BEACON), "127.0.0.1", () => beacon.write(JSON.stringify({ role: "mirror", pid: process.pid }) + "\\n"));
	let text = "";
	beacon.on("data", (chunk) => {
		text += chunk.toString("utf8");
		for (let at = text.indexOf("\\n"); at !== -1; at = text.indexOf("\\n")) {
			const order = text.slice(0, at);
			text = text.slice(at + 1);
			for (const [name, run] of orders) if (name === order) run();
		}
	});
}
onOrder("exit", () => process.exit(1));
// --tls-self-signed <dir>: like mirror, write the CA into <dir> and serve
// HTTPS; the certificates are the test-only ones in FAKE_MIRROR_TLS_FIXTURES.
const tlsAt = args.indexOf("--tls-self-signed");
const tlsDir = tlsAt === -1 || mode === "plain" ? undefined : args[tlsAt + 1];
const fixtures = process.env.FAKE_MIRROR_TLS_FIXTURES;
if (tlsDir !== undefined) copyFileSync(join(fixtures, "ca.pem"), join(tlsDir, "ca.pem"));
const scheme = tlsDir === undefined ? "http" : "https";
if (mode === "exit") { console.error("mirror: cannot load specs"); process.exit(3); }
if (mode === "busy-once" && !existsSync(process.env.FAKE_MIRROR_MARK)) {
	writeFileSync(process.env.FAKE_MIRROR_MARK, "x");
	console.error("listen tcp " + bind + ": bind: address already in use");
	process.exit(1);
}
const serve = (handler) => tlsDir === undefined
	? createServer(handler)
	: createTlsServer({ key: readFileSync(join(fixtures, "loopback.key")), cert: readFileSync(join(fixtures, "loopback.pem")) }, handler);
const server = serve((request, response) => {
	if (mode === "unhealthy") { response.writeHead(503); response.end("{}"); return; }
	// FAKE_MIRROR_MODE=exit-after-health: health answers, and the first other
	// request (the lane's journal read) ends the process before it is answered.
	if (mode === "exit-after-health" && request.url !== "/_mirror/health") process.exit(1);
	response.writeHead(200, { "content-type": "application/json" });
	if (request.url === "/_mirror/health") { response.end('{"status":"ok","uptime_ms":0,"version":"fake"}'); return; }
	// An empty journal, as mirror encodes one (a Go nil slice).
	if (request.url.startsWith("/_mirror/journal?")) { response.end("null"); return; }
	const mirrorEnv = Object.keys(process.env).filter((key) => key.startsWith("MIRROR_")).sort().map((key) => key + "=" + process.env[key]);
	response.end(JSON.stringify({ args, clock: process.env.MIRROR_CLOCK, faults: process.env.MIRROR_VERCEL_FAULTS, mirrorEnv, cwd: process.cwd(), cwdEntries: require("node:fs").readdirSync("."), readsConfig: existsSync(".mirror/config.json") }));
});
server.on("error", (error) => {
	console.error("listen tcp " + bind + ": bind: " + (error.code === "EADDRINUSE" ? "address already in use" : error.message));
	process.exit(1);
});
const announce = () => {
	if (mode !== "no-banner") console.error("mirror fake listening on " + scheme + "://" + bind);
	if (tlsDir !== undefined) console.error("tls ca: " + join(tlsDir, "ca.pem"));
};
if (mode === "pre-442") {
	// A mirror older than mirror.cloud#442: the banner before the bind, which
	// here happens only when the test orders it.
	announce();
	onOrder("bind", () => server.listen(Number(port), host));
} else if (mode === "banner-before-bind") {
	// A mirror older than mirror.cloud#442 whose port is free: the banner, and
	// the bind 300 ms later, so health asked right after the banner is refused
	// until the bind (the lane retries 40 times, 25 ms apart).
	announce();
	setTimeout(() => server.listen(Number(port), host), 300);
} else {
	// Like mirror since mirror.cloud#442: the banner only once the port is bound.
	server.listen(Number(port), host, announce);
}
// FAKE_MIRROR_IGNORE_TERM=1: a mirror that does not stop on SIGTERM, so a stop waits out its grace.
process.on("SIGTERM", () => { console.log("mirror fake: SIGTERM"); if (process.env.FAKE_MIRROR_IGNORE_TERM !== "1") process.exit(0); });
`;

/** What the runner or its stand-ins read: the lane's knobs, the pins override, and the CI markers `inCi` reads. */
const LANE_KNOB =
	/^(?:HOBO_MIRROR_|MIRROR_|FAKE_)|^(?:HOBO_PINS_ALLOW_OVERRIDE|CI|GITHUB_ACTIONS|TF_BUILD)$/u;

/**
 * The environment a runner or a stand-in mirror under test gets: this
 * process's, without any variable the lane or its stand-ins read, so a knob
 * set in the shell that runs the tests reaches no test that did not set it;
 * `NODE_OPTIONS` emptied; then `env`.
 */
export function laneEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const inherited: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(process.env)) {
		if (!LANE_KNOB.test(name)) inherited[name] = value;
	}
	return { ...inherited, NODE_OPTIONS: "", ...env };
}

/** An executable stand-in mirror in a fresh scratch directory. */
export function fakeMirror(): string {
	const dir = scratch("mirror-lane");
	const bin = join(dir, "mirror");
	writeFileSync(bin, FAKE_MIRROR);
	chmodSync(bin, 0o755);
	return bin;
}

const FAKE_PNPM = `#!/usr/bin/env node
const { connect } = require("node:net");
const { spawn } = require("node:child_process");
const port = Number(process.env.FAKE_BEACON);
const socket = connect(port, "127.0.0.1", () => socket.write(JSON.stringify({ role: "pnpm", pid: process.pid }) + "\\n"));
// The order "pass" on that socket: the package run passes (exits 0).
let orders = "";
socket.on("data", (chunk) => { orders += chunk.toString("utf8"); if (orders.split("\\n").includes("pass")) process.exit(0); });
// What a package run starts in turn; it ignores SIGTERM, as a busy worker can.
spawn(process.execPath, ["-e", [
	"process.on('SIGTERM', () => {});",
	"const socket = require('node:net').connect(" + port + ", '127.0.0.1', () => socket.write(JSON.stringify({ role: 'worker', pid: process.pid }) + '\\\\n'));",
	"setInterval(() => {}, 1 << 30);",
].join("\\n")], { stdio: "ignore" });
setInterval(() => {}, 1 << 30);
`;

/** A directory holding a stand-in `pnpm`, to put first on PATH. */
export function fakePnpmDir(): string {
	const dir = scratch("mirror-lane");
	const bin = join(dir, "pnpm");
	writeFileSync(bin, FAKE_PNPM);
	chmodSync(bin, 0o755);
	return dir;
}

/** One process that reported to a beacon. */
export interface Reported {
	readonly role: string;
	readonly pid: number;
	/** Resolves when the process has ended (its end closes the socket). */
	readonly ended: Promise<void>;
	/**
	 * Whether that socket has closed. While it is open the process is ours and
	 * alive, so its pid may be signalled; once closed the pid may already
	 * belong to another process.
	 */
	readonly hasEnded: () => boolean;
	/** Send the process an order on its socket (the stand-in mirror takes "bind" and "exit"). */
	readonly tell: (order: string) => void;
}

export interface Beacon {
	readonly port: number;
	/** The first report from a process playing `role`. */
	next(role: string): Promise<Reported>;
	close(): Promise<void>;
}

/** A loopback listener the stand-ins report their pids to, one line of JSON each. */
export async function beacon(): Promise<Beacon> {
	const reports = new Map<string, Reported>();
	const waiting = new Map<string, (reported: Reported) => void>();
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		let closed = false;
		const ended = new Promise<void>((resolveEnded) =>
			socket.once("close", () => {
				closed = true;
				resolveEnded();
			}),
		);
		let text = "";
		socket.on("data", (chunk: Buffer) => {
			text += chunk.toString("utf8");
			if (!text.includes("\n")) return;
			// SAFETY: the stand-ins above write exactly this shape.
			const { role, pid } = JSON.parse(text.slice(0, text.indexOf("\n"))) as {
				readonly role: string;
				readonly pid: number;
			};
			const reported = {
				role,
				pid,
				ended,
				hasEnded: () => closed,
				tell: (order: string) => {
					socket.write(`${order}\n`);
				},
			};
			reports.set(role, reported);
			waiting.get(role)?.(reported);
		});
		socket.on("error", () => {
			// A process killed mid-write: its end is what is under test.
		});
	});
	await new Promise<void>((resolveListen) =>
		server.listen(0, "127.0.0.1", () => resolveListen()),
	);
	// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
	const { port } = server.address() as AddressInfo;
	return {
		port,
		next: (role) => {
			const known = reports.get(role);
			return known !== undefined
				? Promise.resolve(known)
				: new Promise((resolveNext) => waiting.set(role, resolveNext));
		},
		close: () =>
			new Promise((resolveClose) => {
				for (const socket of sockets) socket.destroy();
				server.close(() => resolveClose());
			}),
	};
}

/**
 * Whether `pid` is a live process: a zombie (ended, not yet reaped by a parent
 * that has gone) is not. Linux reads /proc; elsewhere signal 0 answers.
 */
export function stillRunning(pid: number): boolean {
	if (existsSync("/proc/self/stat")) {
		let stat: string;
		try {
			stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		} catch {
			return false;
		}
		const state = stat.slice(stat.lastIndexOf(")") + 2).charAt(0);
		return state !== "Z" && state !== "X";
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
