/**
 * The mirror lane's process side (ADR-0174): find the mirror.cloud emulator,
 * start it on a free loopback port, wait until it answers, read its journal,
 * and stop it. `scripts/run-mirror-lane.mts` drives it; the tests' side
 * (reaching the started emulator) is `@hobo/contract-harness`'s `mirror-lane`.
 *
 * Which binary runs, in order:
 *   1. `MIRROR_BIN`, a local build nobody verified. Refused in CI unless
 *      `HOBO_PINS_ALLOW_OVERRIDE=1`, with the same refusal `pins:status` uses
 *      (ADR-0169, item 7), and reported as unverified when it runs.
 *   2. The `mirror` asset pin in `tools/pins/siblings.json`, from the
 *      machine-wide cache, re-hashed before it is trusted
 *      (`pnpm run pins:fetch mirror` puts it there). Mirror releases are
 *      archives, so the pin is one member of one (`"archive": { "format":
 *      "tar.gz", "member": "mirror" }`): `verifyCached` re-hashes the archive
 *      and checks the member, `cachedPath` names the member, and anything but
 *      `ok` is `MIRROR_NOT_FETCHED` with `pins:fetch mirror` as the fix.
 *   3. Neither: `MIRROR_BIN_REQUIRED`, with the build command. The lane fails;
 *      it never skips.
 *
 * Erasable TypeScript with node builtins only, like the pins it reads.
 */
import type { ChildProcess } from "node:child_process";
import {
	constants,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { access } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { LaneChildren } from "./lane-children.ts";
import { PINS_FILE, PinsError, parsePins } from "./pins.ts";
import { inCi, refuseOverridesInCi } from "./pins-asset-ops.ts";
import {
	assetFor,
	cacheDir,
	cachedPath,
	currentTarget,
	overrideEnv,
} from "./pins-assets.ts";
import { cacheProblem } from "./pins-cache.ts";
import { verifyCached } from "./pins-fetch.ts";

export type MirrorLaneErrorCode =
	| "MIRROR_BIN_REQUIRED"
	| "MIRROR_BIN_UNUSABLE"
	| "MIRROR_NOT_FETCHED"
	| "MIRROR_START_FAILED"
	| "MIRROR_UNHEALTHY"
	| "MIRROR_JOURNAL_UNREADABLE";

/** Every refusal of the lane is named, and its message starts with the name. */
export class MirrorLaneError extends Error {
	readonly code: MirrorLaneErrorCode;
	constructor(code: MirrorLaneErrorCode, message: string) {
		super(`${code}: ${message}`);
		this.name = "MirrorLaneError";
		this.code = code;
	}
}

/** A JSON value as `JSON.parse` returns it. */
type JsonValue =
	| null
	| boolean
	| number
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

const tagOf = Object.prototype.toString;

/** The emulated services the lane starts: Vercel's REST API and the AWS services HoBo's resolvers reach. */
export const MIRROR_LANE_SERVICES = Object.freeze([
	"vercel.api",
	"aws.dynamodb",
	"aws.s3",
	"aws.secretsmanager",
	"aws.sns",
	"aws.sqs",
	"aws.ssm",
] as const);

/** Every id, URL and token mirror generates is a function of this seed and the order of requests. */
export const MIRROR_LANE_SEED = "hobo-contract";

const BUILD_HELP =
	'build one from a mirror.cloud checkout with `CGO_ENABLED=0 go build -o <dir>/mirror ./cmd/mirror` and set MIRROR_BIN=<dir>/mirror (an unverified local build), or pin a mirror release with `pnpm run pins:bump mirror <tag>` and run `pnpm run pins:fetch mirror`: mirror publishes each release as mirror_<tag>_<os>_<arch>.tar.gz, so each target\'s pin is that archive\'s sha256 and size with "entry": "mirror", "archive": { "format": "tar.gz", "member": "mirror" } (asset pins that unpack an archive: ADR-0174, residuals)';

export interface MirrorBinary {
	readonly path: string;
	/** False for `MIRROR_BIN`: nothing checked those bytes. */
	readonly verified: boolean;
	/** One line for the lane's output: where the binary came from. */
	readonly origin: string;
}

async function executable(path: string): Promise<boolean> {
	try {
		if (!statSync(path).isFile()) return false;
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * The binary the lane runs, or a refusal that says what to do. `root` is the
 * directory whose `tools/pins/siblings.json` is read (the repository; a test
 * names an empty one); a root without that file pins nothing.
 */
export async function resolveMirrorBin(
	env: NodeJS.ProcessEnv,
	root: string,
	target: string = currentTarget(),
): Promise<MirrorBinary> {
	refuseOverridesInCi(["mirror"], env);
	const variable = overrideEnv("mirror");
	const override = env[variable];
	if (override !== undefined && override !== "") {
		const path = isAbsolute(override) ? override : resolve(override);
		if (!(await executable(path))) {
			throw new MirrorLaneError(
				"MIRROR_BIN_UNUSABLE",
				`${variable}=${override} is not an executable file; ${BUILD_HELP}`,
			);
		}
		return {
			path,
			verified: false,
			origin: `${variable} (a local build: unverified, not the pinned release)`,
		};
	}
	const file = join(root, PINS_FILE);
	if (!existsSync(file)) {
		throw new MirrorLaneError(
			"MIRROR_BIN_REQUIRED",
			`no mirror release is pinned (${file} does not exist) and ${variable} is unset; ${BUILD_HELP}`,
		);
	}
	const pins = parsePins(readFileSync(file, "utf8"));
	const pin = pins.assets.mirror ?? null;
	if (pin === null) {
		throw new MirrorLaneError(
			"MIRROR_BIN_REQUIRED",
			`no mirror release is pinned (${file} assets.mirror is null) and ${variable} is unset; ${BUILD_HELP}`,
		);
	}
	const asset = assetFor(pin, "mirror", target);
	const cache = cacheDir(env);
	const unsafe = await cacheProblem(cache, asset.sha256);
	if (unsafe !== null) {
		throw new MirrorLaneError(
			"MIRROR_NOT_FETCHED",
			`${unsafe.problem}; ${unsafe.fix}`,
		);
	}
	const cached = await verifyCached(cache, asset);
	const path = cachedPath(cache, asset);
	if (cached.state !== "ok") {
		throw new MirrorLaneError(
			"MIRROR_NOT_FETCHED",
			`the pinned mirror ${pin.tag} is ${cached.state === "absent" ? "not in the cache" : `unusable in the cache (${cached.state})`} at ${path}; run \`pnpm run pins:fetch mirror\``,
		);
	}
	return {
		path,
		verified: true,
		origin: `pin ${pin.tag} in ${file} (${target} sha256 ${asset.sha256.slice(0, 12)}, re-hashed from the cache)`,
	};
}

/**
 * `--pins-root` reads the pin from a directory other than the repository: an
 * override like `MIRROR_BIN`, since whoever names the directory chooses the
 * bytes. In CI it is refused with the refusal `pins:status` uses for one
 * (ADR-0169, item 7), unless `HOBO_PINS_ALLOW_OVERRIDE=1`.
 */
export function refusePinsRootInCi(
	env: NodeJS.ProcessEnv,
	pinsRoot: string,
	repositoryRoot: string,
): void {
	if (resolve(pinsRoot) === resolve(repositoryRoot)) return;
	if (!inCi(env) || env.HOBO_PINS_ALLOW_OVERRIDE === "1") return;
	throw new PinsError(
		"OVERRIDE_IN_CI",
		`--pins-root ${pinsRoot} is set in CI: a pin read from outside the repository is chosen by whoever names the directory, so a green run would not mean the repository's pinned release ran. Drop it, or set HOBO_PINS_ALLOW_OVERRIDE=1 if this run is meant to test another pin`,
	);
}

/** A loopback port nothing listened on a moment ago (mirror has no way to report a port it chose). */
export function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			// SAFETY: a server listening on a TCP port reports an AddressInfo, never a pipe name.
			const { port } = server.address() as AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

export interface MirrorOptions {
	readonly bin: string;
	readonly env: NodeJS.ProcessEnv;
	/** Serve HTTPS with a throwaway CA kept in this directory (`--tls-self-signed`). */
	readonly tlsDir?: string;
	readonly services?: readonly string[];
	/** How long a start may take before it is `MIRROR_UNHEALTHY`. Default 120000: mirror loads its specs first. */
	readonly startTimeoutMs?: number;
	/** Tests only: the port to bind instead of a fresh free one. */
	readonly port?: number;
	/**
	 * Where the emulator's process is tracked from the moment it is spawned,
	 * so the runner can stop it during start-up too. Default: a registry of
	 * its own.
	 */
	readonly children?: LaneChildren;
	/**
	 * A directory the caller owns and removes on every way out, signals
	 * included: mirror's working directory is made inside it. Default: the
	 * system temporary directory.
	 */
	readonly workDir?: string;
}

export interface RunningMirror {
	readonly url: string;
	readonly port: number;
	readonly pid: number;
	/** The CA file mirror wrote, when it serves TLS. */
	readonly caFile?: string;
	/** The arguments it was started with. */
	readonly args: readonly string[];
	/** What it printed so far (stdout and stderr, interleaved), bounded. */
	output(): string;
	/** SIGTERM to its process group, SIGKILL after 5 s; resolves once the process is gone. */
	stop(): Promise<void>;
}

const OUTPUT_LIMIT = 64 * 1024;
const ATTEMPTS = 3;

/** Answer of one GET, or the reason there was none. */
function get(
	url: string,
	ca: string | undefined,
): Promise<{ readonly status: number; readonly body: string }> {
	const parsed = new URL(url);
	const send = parsed.protocol === "https:" ? httpsRequest : httpRequest;
	return new Promise((resolveGet, reject) => {
		const outgoing = send(
			parsed,
			{
				method: "GET",
				agent: false,
				timeout: 5_000,
				...(ca === undefined ? undefined : { ca }),
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () =>
					resolveGet({
						status: response.statusCode ?? 0,
						body: Buffer.concat(chunks).toString("utf8"),
					}),
				);
				response.on("error", reject);
			},
		);
		outgoing.on("timeout", () => outgoing.destroy(new Error("timed out")));
		outgoing.on("error", reject);
		outgoing.end();
	});
}

/**
 * The environment mirror runs with: the caller's, without a `MIRROR_*`
 * variable of its own (mirror reads its bind, seed, persistence, strictness
 * and proxy mode from them), plus the two the lane sets.
 */
function mirrorEnv(ambient: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(ambient)) {
		if (!name.startsWith("MIRROR_")) env[name] = value;
	}
	return { ...env, MIRROR_CLOCK: "controllable", MIRROR_VERCEL_FAULTS: "1" };
}

/** How mirror's start-up ended before it could be asked for its health. */
type Announcement =
	| { readonly kind: "banner"; readonly version: string }
	| { readonly kind: "closed" }
	| { readonly kind: "spawn-error"; readonly error: Error }
	| { readonly kind: "timeout" };

/** `mirror <version> listening on <scheme>://<address>`, the line mirror prints once its specs are loaded. */
const BANNER = /^mirror (\S+) listening on (https?):\/\/(\S+)$/u;

/**
 * Wait for this child's own banner naming exactly `scheme://address`, or for
 * it to end first. Decided by the child's output and exit events, and by one
 * deadline: nothing is polled.
 */
function announced(
	child: ChildProcess,
	scheme: string,
	address: string,
	timeoutMs: number,
): Promise<Announcement> {
	return new Promise((resolveAnnouncement) => {
		let partial = "";
		const read = (chunk: Buffer) => {
			const lines = `${partial}${chunk.toString("utf8")}`.split("\n");
			partial = lines.pop() ?? "";
			for (const line of lines) {
				const banner = BANNER.exec(line.trim());
				if (banner?.[2] === scheme && banner[3] === address) {
					finish({ kind: "banner", version: banner[1] ?? "" });
				}
			}
		};
		const closed = () => finish({ kind: "closed" });
		const failed = (error: Error) => finish({ kind: "spawn-error", error });
		const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
		function finish(announcement: Announcement): void {
			clearTimeout(timer);
			child.stdout?.off("data", read);
			child.stderr?.off("data", read);
			child.off("close", closed);
			child.off("error", failed);
			resolveAnnouncement(announcement);
		}
		child.stdout?.on("data", read);
		child.stderr?.on("data", read);
		child.once("close", closed);
		child.once("error", failed);
	});
}

/** What `/_mirror/health` said once the banner was printed. */
type Health =
	| { readonly kind: "ours" }
	| { readonly kind: "another"; readonly version: string }
	| { readonly kind: "unhealthy"; readonly detail: string };

/** Mirror prints its banner just before it binds: a refusal right after it is retried, 25 ms apart, at most this often. */
const BIND_RETRIES = 40;

/** The two fields of a `/_mirror/health` answer the lane reads. */
interface HealthAnswer {
	readonly ok: boolean;
	readonly version: string;
}

function healthOf(body: string): HealthAnswer {
	let parsed: JsonValue;
	try {
		// SAFETY: JSON.parse yields a JSON value; its shape is checked below.
		parsed = JSON.parse(body) as JsonValue;
	} catch {
		return { ok: false, version: "" };
	}
	if (tagOf.call(parsed) !== "[object Object]") {
		return { ok: false, version: "" };
	}
	// SAFETY: the tag check above proves this JSON value is an object.
	const record = parsed as { readonly [key: string]: JsonValue };
	const version = record.version;
	return {
		ok: record.status === "ok",
		version: tagOf.call(version) === "[object String]" ? String(version) : "",
	};
}

function refused(error: Error): boolean {
	return "code" in error && error.code === "ECONNREFUSED";
}

/**
 * Ask the health route, after the banner, whether the process answering is
 * the one that printed it: the same version, and status ok.
 */
async function confirmHealth(
	url: string,
	ca: string | undefined,
	version: string,
): Promise<Health> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const health = await get(`${url}/_mirror/health`, ca);
			const answer = healthOf(health.body);
			if (health.status !== 200 || !answer.ok) {
				return {
					kind: "unhealthy",
					detail: `answered ${health.status} ${health.body.slice(0, 200)}`,
				};
			}
			return answer.version === version
				? { kind: "ours" }
				: { kind: "another", version: answer.version };
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!refused(error) ||
				attempt >= BIND_RETRIES
			) {
				return {
					kind: "unhealthy",
					detail: `could not be reached: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
			await new Promise((resolveWait) => setTimeout(resolveWait, 25));
		}
	}
}

async function startOnce(
	options: MirrorOptions,
	port: number,
): Promise<RunningMirror | "port-taken"> {
	const services = options.services ?? MIRROR_LANE_SERVICES;
	const args = [
		"up",
		...services,
		"--bind",
		`127.0.0.1:${port}`,
		"--seed",
		MIRROR_LANE_SEED,
		...(options.tlsDir === undefined
			? []
			: ["--tls-self-signed", options.tlsDir]),
	];
	// An empty directory of its own: mirror reads `.mirror/config.json` and
	// keeps `.mirror/cassettes` relative to where it runs.
	const cwd = mkdtempSync(
		join(options.workDir ?? tmpdir(), "hobo-mirror-cwd-"),
	);
	const children = options.children ?? new LaneChildren();
	let child: ChildProcess;
	try {
		child = children.spawn(options.bin, args, {
			cwd,
			env: mirrorEnv(options.env),
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		rmSync(cwd, { recursive: true, force: true });
		throw error;
	}
	let output = "";
	const keep = (chunk: Buffer) => {
		output = `${output}${chunk.toString("utf8")}`.slice(-OUTPUT_LIMIT);
	};
	child.stdout?.on("data", keep);
	child.stderr?.on("data", keep);
	child.on("error", () => {
		// Reported through `announced`; kept here so it is never unhandled.
	});
	const scheme = options.tlsDir === undefined ? "http" : "https";
	const address = `127.0.0.1:${port}`;
	const url = `${scheme}://${address}`;
	const caFile =
		options.tlsDir === undefined ? undefined : join(options.tlsDir, "ca.pem");
	const gone = () => child.exitCode !== null || child.signalCode !== null;
	const stop = async () => {
		await children.stop(child);
		rmSync(cwd, { recursive: true, force: true });
	};
	const printed = () => output.trim().slice(-2_000);
	const portTaken = () => /address already in use/u.test(output);
	const timeoutMs = options.startTimeoutMs ?? 120_000;

	const announcement = await announced(child, scheme, address, timeoutMs);
	if (announcement.kind === "spawn-error") {
		await stop();
		throw new MirrorLaneError(
			"MIRROR_START_FAILED",
			`${options.bin} could not be started: ${announcement.error.message}`,
		);
	}
	if (announcement.kind === "closed") {
		await stop();
		if (portTaken()) return "port-taken";
		throw new MirrorLaneError(
			"MIRROR_START_FAILED",
			`${options.bin} ${args.join(" ")} exited (${child.exitCode ?? child.signalCode}) before it printed that it is listening on ${url}; it printed:\n${printed()}`,
		);
	}
	if (announcement.kind === "timeout") {
		await stop();
		throw new MirrorLaneError(
			"MIRROR_UNHEALTHY",
			`${options.bin} did not print "mirror <version> listening on ${url}" within ${timeoutMs} ms; it printed:\n${printed()}`,
		);
	}
	const ca =
		caFile !== undefined && existsSync(caFile)
			? readFileSync(caFile, "utf8")
			: undefined;
	if (caFile !== undefined && ca === undefined) {
		await stop();
		throw new MirrorLaneError(
			"MIRROR_START_FAILED",
			`${options.bin} announced ${url} but wrote no ${caFile}; it printed:\n${printed()}`,
		);
	}
	const health = await confirmHealth(url, ca, announcement.version);
	if (health.kind === "ours" && !gone() && !portTaken()) {
		return {
			url,
			port,
			pid: child.pid ?? 0,
			...(caFile === undefined ? undefined : { caFile }),
			args,
			output: () => output,
			stop,
		};
	}
	if (health.kind === "another" || portTaken()) {
		// Another process holds the port: mirror cannot bind it and exits.
		await stop();
		return "port-taken";
	}
	await stop();
	throw new MirrorLaneError(
		"MIRROR_UNHEALTHY",
		`${options.bin} announced ${url}, but GET /_mirror/health ${health.kind === "unhealthy" ? health.detail : "came from a process that has since exited"}; it printed:\n${printed()}`,
	);
}

/**
 * Start `mirror up <services> --bind 127.0.0.1:<port> --seed hobo-contract`
 * with `MIRROR_CLOCK=controllable` and `MIRROR_VERCEL_FAULTS=1`, and resolve
 * once `GET /_mirror/health` answers ok. A port taken between choosing it and
 * binding it is retried on another (three attempts).
 */
export async function startMirror(
	options: MirrorOptions,
): Promise<RunningMirror> {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
		const port = options.port ?? (await freePort());
		const started = await startOnce(options, port);
		if (started !== "port-taken") return started;
		if (options.port !== undefined) break;
	}
	throw new MirrorLaneError(
		"MIRROR_START_FAILED",
		options.port === undefined
			? `every port mirror was given was taken before it could bind (${ATTEMPTS} attempts)`
			: `port ${options.port} was taken by another process`,
	);
}

export interface JournalCount {
	readonly service: string;
	readonly operation: string;
	readonly status: number;
	readonly count: number;
}

export interface JournalSummary {
	readonly counts: readonly JournalCount[];
	/** Services whose answer held exactly the cap: older entries may be missing. */
	readonly truncated: readonly string[];
}

const JOURNAL_LIMIT = 10_000;
const LEGACY_JOURNAL_CAP = 100;

/** One journal entry, as far as the summary reads it. */
interface JournalLine {
	readonly service: string;
	readonly operation: string;
	readonly status: number;
}

/** The entries of one journal answer, or MIRROR_JOURNAL_UNREADABLE naming what is wrong. */
function journalEntries(service: string, body: string): readonly JournalLine[] {
	const unreadable = (problem: string) =>
		new MirrorLaneError(
			"MIRROR_JOURNAL_UNREADABLE",
			`GET /_mirror/journal?service=${service} ${problem}`,
		);
	let parsed: JsonValue;
	try {
		// SAFETY: JSON.parse yields a JSON value; its shape is checked below.
		parsed = JSON.parse(body) as JsonValue;
	} catch {
		throw unreadable("did not answer JSON");
	}
	// Mirror encodes an empty journal as `null`, a Go nil slice.
	if (parsed === null) return [];
	if (!Array.isArray(parsed)) throw unreadable("did not answer a list");
	return parsed.map((entry: JsonValue) => {
		if (tagOf.call(entry) !== "[object Object]") {
			throw unreadable("answered an entry that is not an object");
		}
		// SAFETY: the tag check above proves this JSON value is an object.
		const record = entry as { readonly [key: string]: JsonValue };
		return {
			service: String(record.ServiceID ?? ""),
			operation: String(record.Operation ?? ""),
			status: Number(record.Status ?? 0),
		};
	});
}

/**
 * Count what the emulator recorded, per service, operation and status.
 * Each service is read separately with `?limit=10000`; a mirror older than
 * that parameter answers at most 100 entries, and a service whose answer is
 * exactly at a cap is reported as truncated rather than counted as complete.
 */
export async function summarizeJournal(
	mirror: Pick<RunningMirror, "url" | "caFile">,
	services: readonly string[] = MIRROR_LANE_SERVICES,
): Promise<JournalSummary> {
	const ca =
		mirror.caFile === undefined
			? undefined
			: readFileSync(mirror.caFile, "utf8");
	const tally = new Map<string, JournalCount>();
	const truncated: string[] = [];
	for (const service of services) {
		const answer = await get(
			`${mirror.url}/_mirror/journal?service=${encodeURIComponent(service)}&limit=${JOURNAL_LIMIT}`,
			ca,
		);
		if (answer.status !== 200) {
			throw new MirrorLaneError(
				"MIRROR_JOURNAL_UNREADABLE",
				`GET /_mirror/journal?service=${service} answered ${answer.status}`,
			);
		}
		const entries = journalEntries(service, answer.body);
		if (
			entries.length === LEGACY_JOURNAL_CAP ||
			entries.length === JOURNAL_LIMIT
		) {
			truncated.push(service);
		}
		for (const line of entries) {
			const key = `${line.service} ${line.operation} ${line.status}`;
			const seen = tally.get(key);
			tally.set(key, { ...line, count: (seen?.count ?? 0) + 1 });
		}
	}
	return {
		counts: [...tally.values()].sort(
			(left, right) =>
				left.service.localeCompare(right.service) ||
				left.operation.localeCompare(right.operation) ||
				left.status - right.status,
		),
		truncated,
	};
}
