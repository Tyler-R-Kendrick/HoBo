#!/usr/bin/env node
/**
 * `pnpm run test:mirror`: the env-gated mirror.cloud contract lane (ADR-0174).
 *
 *   node --import tsx scripts/run-mirror-lane.mts [--tls] [--package <name>]... [--pins-root <dir>]
 *
 * Starts the mirror.cloud emulator (`mirror up vercel.api aws.dynamodb aws.s3
 * aws.secretsmanager aws.sns aws.sqs aws.ssm`, `--seed hobo-contract`,
 * `MIRROR_CLOCK=controllable`, `MIRROR_VERCEL_FAULTS=1`) on a free loopback
 * port, sets `HOBO_MIRROR_URL` (and `HOBO_MIRROR_CA` with `--tls`), runs each
 * package's own `test:mirror` script one after another, always stops the
 * emulator and any package run (each in its own process group, tracked from
 * the moment it is spawned, so SIGINT or SIGTERM during start-up stops mirror
 * too), prints what its journal recorded and the pact verification
 * reports the tests left in `HOBO_MIRROR_REPORTS`, and exits 1 if any package
 * failed.
 *
 * The binary is `MIRROR_BIN` (a local build, refused in CI unless
 * `HOBO_PINS_ALLOW_OVERRIDE=1`) or the `mirror` pin in tools/pins/siblings.json
 * (under `--pins-root`, default this repository) from the cache under
 * `XDG_CACHE_HOME` (`pnpm run pins:fetch mirror`). With neither the lane exits 1
 * with `MIRROR_BIN_REQUIRED`: it fails, it never skips.
 *
 * What a green run proves: HoBo's clients against mirror's reading of the
 * providers' API documents. Mirror says itself that its Vercel emulation has
 * never been compared with api.vercel.com; this lane is "emulated", never
 * "live". It is not part of `agent:check`.
 *
 * Exit: 0 every package passed, 1 a package failed or the emulator could not
 * run, 2 wrong usage.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { commandForPlatform, sanitizeNodeOptions } from "./lib/env.ts";
import { LaneChildren } from "./lib/lane-children.ts";
import {
	MIRROR_LANE_SEED,
	MIRROR_LANE_SERVICES,
	type RunningMirror,
	resolveMirrorBin,
	startMirror,
	summarizeJournal,
} from "./lib/mirror-lane.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The packages with a `test:mirror` script, in the order they run. */
const LANE_PACKAGES = Object.freeze([
	"@hobo/provider-vercel",
	"@hobo/provider-aws",
	"@hobo/hobo",
]);

const USAGE =
	"usage: run-mirror-lane.mts [--tls] [--package <name>]... [--pins-root <dir>]   (packages: " +
	`${LANE_PACKAGES.join(", ")})`;

/** What the command line asked for. */
interface LaneOptions {
	readonly tls: boolean;
	readonly packages: readonly string[];
	/** Where tools/pins/siblings.json is read; the packages always run from this repository. */
	readonly pinsRoot: string;
}

function readArgs(): LaneOptions {
	try {
		const { values } = parseArgs({
			args: process.argv.slice(2).filter((arg) => arg !== "--"),
			options: {
				tls: { type: "boolean" },
				package: { type: "string", multiple: true },
				"pins-root": { type: "string" },
			},
		});
		const packages = values.package ?? [...LANE_PACKAGES];
		const unknown = packages.filter((name) => !LANE_PACKAGES.includes(name));
		if (unknown.length > 0) {
			throw new Error(`no test:mirror in ${unknown.join(", ")}`);
		}
		return {
			tls: values.tls === true,
			packages,
			pinsRoot: resolve(values["pins-root"] ?? root),
		};
	} catch (error) {
		console.error(
			`mirror-lane: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
		);
		process.exit(2);
	}
}

/** Every process the lane starts: a signal or the runner's exit stops each, process group included. */
const children = new LaneChildren();

function runPackage(name: string, env: NodeJS.ProcessEnv): Promise<number> {
	const { command, args } = commandForPlatform("pnpm", [
		"--filter",
		name,
		"run",
		"test:mirror",
	]);
	return new Promise((resolveRun) => {
		const child = children.spawn(command, args, {
			cwd: root,
			env,
			// Nothing reads the terminal: a child in its own process group must not.
			stdio: ["ignore", "inherit", "inherit"],
			shell: false,
		});
		child.once("error", (error) => {
			console.error(`mirror-lane: ${name}: ${error.message}`);
			resolveRun(1);
		});
		child.once("exit", (code, signal) =>
			resolveRun(code ?? (signal === null ? 1 : 128)),
		);
	});
}

/** The provider verifications the tests recorded (`recordMirrorLaneReport`). */
function printReports(dir: string): void {
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".json"))
		.sort();
	for (const file of files) {
		const text = readFileSync(join(dir, file), "utf8").trim();
		console.log(`mirror-lane: pact provider report ${file}: ${text}`);
	}
	if (files.length === 0) {
		console.log("mirror-lane: no pact provider report was recorded");
	}
}

async function printJournal(mirror: RunningMirror): Promise<void> {
	try {
		const summary = await summarizeJournal(mirror);
		console.log(
			"mirror-lane: journal (what the emulator recorded: service, operation, status, count)",
		);
		for (const line of summary.counts) {
			console.log(
				`  ${line.service.padEnd(20)} ${line.operation.padEnd(28)} ${String(line.status).padEnd(4)} x${line.count}`,
			);
		}
		if (summary.counts.length === 0) console.log("  (nothing was recorded)");
		for (const service of summary.truncated) {
			console.log(
				`  ${service}: the journal answer hit its cap; older entries are not counted (a mirror older than ?limit= answers 100 at most)`,
			);
		}
	} catch (error) {
		console.error(
			`mirror-lane: could not read the journal: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

const options = readArgs();
/** The emulator's start, in flight or done: what cleanUp waits on and stops. */
let starting: Promise<RunningMirror> | undefined;
let tlsDir: string | undefined;
let reportDir: string | undefined;
/** Set by SIGINT or SIGTERM: the exit code, and that nothing more may start. */
let signalled: number | undefined;
let cleaning: Promise<void> | undefined;

/** Stop every child (the emulator, a package run) and remove the lane's directories; once. */
function cleanUp(): Promise<void> {
	cleaning ??= (async () => {
		await children.stopAll();
		// A start the stop interrupted settles once it has cleaned up after itself.
		await starting?.then(
			(running) => running.stop(),
			() => undefined,
		);
		if (tlsDir !== undefined) rmSync(tlsDir, { recursive: true, force: true });
		tlsDir = undefined;
		if (reportDir !== undefined) {
			rmSync(reportDir, { recursive: true, force: true });
		}
		reportDir = undefined;
	})();
	return cleaning;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		signalled = signal === "SIGINT" ? 130 : 143;
		console.error(
			`mirror-lane: ${signal}: stopping the emulator and any package run`,
		);
		void cleanUp().finally(() => process.exit(signalled));
	});
}
// The last word, which cannot wait: no group the lane started outlives it.
process.once("exit", () => children.killAllNow());

let status = 1;
try {
	const binary = await resolveMirrorBin(process.env, options.pinsRoot);
	console.log(`mirror-lane: mirror ${binary.path}`);
	console.log(`mirror-lane:   from ${binary.origin}`);
	if (options.tls) tlsDir = mkdtempSync(join(tmpdir(), "hobo-mirror-tls-"));
	starting = startMirror({
		bin: binary.path,
		env: process.env,
		children,
		...(tlsDir === undefined ? undefined : { tlsDir }),
	});
	const mirror = await starting;
	console.log(
		`mirror-lane: mirror up on ${mirror.url} (port ${mirror.port}, pid ${mirror.pid}, seed ${MIRROR_LANE_SEED}; ${MIRROR_LANE_SERVICES.join(", ")})`,
	);
	if (mirror.caFile !== undefined) {
		console.log(`mirror-lane:   tls ca ${mirror.caFile}`);
	}
	reportDir = mkdtempSync(join(tmpdir(), "hobo-mirror-reports-"));
	const env = sanitizeNodeOptions({
		...process.env,
		HOBO_MIRROR_URL: mirror.url,
		HOBO_MIRROR_REPORTS: reportDir,
		...(mirror.caFile === undefined
			? undefined
			: { HOBO_MIRROR_CA: mirror.caFile }),
	});
	const results: { readonly name: string; readonly code: number }[] = [];
	for (const name of options.packages) {
		if (signalled !== undefined) break;
		console.log(`mirror-lane: ${name} test:mirror`);
		results.push({ name, code: await runPackage(name, env) });
	}
	if (signalled !== undefined) throw new Error("stopped by a signal");
	await printJournal(mirror);
	printReports(reportDir);
	for (const result of results) {
		console.log(
			`mirror-lane: ${result.name} ${result.code === 0 ? "passed" : `FAILED (exit ${result.code})`}`,
		);
	}
	status = results.every((result) => result.code === 0) ? 0 : 1;
	console.log(
		status === 0
			? "mirror-lane: ok (emulated: HoBo against mirror's reading of the providers' API documents, not the providers)"
			: "mirror-lane: failed",
	);
} catch (error) {
	// After a signal the refusal is the signal's doing, not the lane's verdict.
	if (signalled === undefined) {
		console.error(
			`fail  test:mirror — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	status = 1;
} finally {
	await cleanUp();
}
process.exit(signalled ?? status);
