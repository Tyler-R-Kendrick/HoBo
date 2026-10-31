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
 *      (`pnpm run pins:fetch mirror` puts it there).
 *   3. Neither: `MIRROR_BIN_REQUIRED`, with the build command. The lane fails;
 *      it never skips.
 *
 * Erasable TypeScript with node builtins only, like the pins it reads.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { constants, existsSync, readFileSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { type AddressInfo, createServer } from "node:net";
import { isAbsolute, join, resolve } from "node:path";

import { PINS_FILE, parsePins } from "./pins.ts";
import { refuseOverridesInCi } from "./pins-asset-ops.ts";
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
	"build one from a mirror.cloud checkout with `CGO_ENABLED=0 go build -o <dir>/mirror ./cmd/mirror` and set MIRROR_BIN=<dir>/mirror (an unverified local build), or pin a release in tools/pins/siblings.json and run `pnpm run pins:fetch mirror`";

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
 * repository whose `tools/pins/siblings.json` is read.
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
	const pins = parsePins(readFileSync(join(root, PINS_FILE), "utf8"));
	const pin = pins.assets.mirror ?? null;
	if (pin === null) {
		throw new MirrorLaneError(
			"MIRROR_BIN_REQUIRED",
			`no mirror release is pinned (${PINS_FILE} assets.mirror is null) and ${variable} is unset; ${BUILD_HELP}`,
		);
	}
	const file = assetFor(pin, "mirror", target);
	const cache = cacheDir(env);
	const unsafe = await cacheProblem(cache, file.sha256);
	if (unsafe !== null) {
		throw new MirrorLaneError(
			"MIRROR_NOT_FETCHED",
			`${unsafe.problem}; ${unsafe.fix}`,
		);
	}
	const cached = await verifyCached(cache, file);
	const path = cachedPath(cache, file);
	if (cached.state !== "ok") {
		throw new MirrorLaneError(
			"MIRROR_NOT_FETCHED",
			`the pinned mirror ${pin.tag} is ${cached.state === "absent" ? "not in the cache" : `unusable in the cache (${cached.state})`} at ${path}; run \`pnpm run pins:fetch mirror\``,
		);
	}
	return {
		path,
		verified: true,
		origin: `pin ${pin.tag} (${target} sha256 ${file.sha256.slice(0, 12)}, re-hashed from the cache)`,
	};
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
	/** SIGTERM, then SIGKILL after 5 s; resolves once the process is gone. */
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

function exited(child: ChildProcess): Promise<void> {
	return child.exitCode !== null || child.signalCode !== null
		? Promise.resolve()
		: new Promise((resolveExit) => child.once("exit", () => resolveExit()));
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
	const child = spawn(options.bin, args, {
		env: {
			...options.env,
			MIRROR_CLOCK: "controllable",
			MIRROR_VERCEL_FAULTS: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	const keep = (chunk: Buffer) => {
		output = `${output}${chunk.toString("utf8")}`.slice(-OUTPUT_LIMIT);
	};
	child.stdout?.on("data", keep);
	child.stderr?.on("data", keep);
	let spawnError: Error | undefined;
	child.once("error", (error) => {
		spawnError = error;
	});
	const tls = options.tlsDir !== undefined;
	const url = `${tls ? "https" : "http"}://127.0.0.1:${port}`;
	const caFile =
		options.tlsDir === undefined ? undefined : join(options.tlsDir, "ca.pem");
	const stop = async () => {
		if (child.exitCode !== null || child.signalCode !== null) return;
		child.kill("SIGTERM");
		const killer = setTimeout(() => child.kill("SIGKILL"), 5_000);
		await exited(child);
		clearTimeout(killer);
	};
	const deadline = Date.now() + (options.startTimeoutMs ?? 120_000);
	for (;;) {
		if (spawnError !== undefined) {
			throw new MirrorLaneError(
				"MIRROR_START_FAILED",
				`${options.bin} could not be started: ${spawnError.message}`,
			);
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			if (/address already in use/u.test(output)) return "port-taken";
			throw new MirrorLaneError(
				"MIRROR_START_FAILED",
				`${options.bin} ${args.join(" ")} exited (${child.exitCode ?? child.signalCode}) before it answered /_mirror/health; it printed:\n${output.trim().slice(-2_000)}`,
			);
		}
		const ca =
			caFile !== undefined && existsSync(caFile)
				? readFileSync(caFile, "utf8")
				: undefined;
		if (!tls || ca !== undefined) {
			try {
				const health = await get(`${url}/_mirror/health`, ca);
				if (health.status === 200 && /"status":"ok"/u.test(health.body)) {
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
			} catch {
				// Not listening yet: mirror loads its specs before it binds.
			}
		}
		if (Date.now() > deadline) {
			await stop();
			throw new MirrorLaneError(
				"MIRROR_UNHEALTHY",
				`${options.bin} did not answer GET ${url}/_mirror/health within ${options.startTimeoutMs ?? 120_000} ms; it printed:\n${output.trim().slice(-2_000)}`,
			);
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 100));
	}
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
		`every port mirror was given was taken before it could bind (${ATTEMPTS} attempts)`,
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

type JsonValue =
	| null
	| boolean
	| number
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

const tagOf = Object.prototype.toString;

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
