import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CREDENTIAL_BINDINGS_FILE } from "../src/credentials-opensesame.js";
import { isJsonObject, isJsonString, parseJsonValue } from "../src/json.js";

// The composed `hobo` binary itself under HOBO_CREDENTIALS=opensesame (ADR-0170),
// started as a person starts it from source (`node --import tsx src/bin/hobo.ts`),
// with @hobo/adapter-opensesame's stand-in found on PATH as `opensesame`. The
// stand-in's knobs reach it from its wrapper, because the adapter passes
// OpenSesame only its allowlist and the bin's fixed passEnv.

const HOBO_BIN = fileURLToPath(new URL("../src/bin/hobo.ts", import.meta.url));
const FAKE_OPENSESAME = fileURLToPath(
	new URL(
		"../../adapters/adapter-opensesame/test/fixtures/fake-opensesame.mts",
		import.meta.url,
	),
);
const TSX_LOADER = createRequire(import.meta.url).resolve("tsx");
// Each relaunch composes the whole CLI twice (the parent, then the command)
// from source: tens of seconds on a loaded machine.
const RUN_TIMEOUT_MS = 180_000;

const BINDINGS = {
	bindings: [
		{
			locator: "hobo-token://vercel/deploy",
			connection: "conn://acme/vercel",
			provider: "vercel",
			env_name: "VERCEL_TOKEN",
			paths: ["/v9/projects"],
			methods: ["GET"],
			projection: "legacy-token",
		},
	],
};

let root = "";
let work = "";
let binDir = "";
let scratch = "";
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "hobo-bin-opensesame-"));
	work = join(root, "work");
	binDir = join(root, "bin");
	scratch = join(root, "tmp");
	for (const dir of [work, binDir, scratch]) mkdirSync(dir);
	writeFileSync(join(work, CREDENTIAL_BINDINGS_FILE), JSON.stringify(BINDINGS));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function standIn(scenario: string): string {
	const record = join(root, "opensesame-record.json");
	writeFileSync(
		join(binDir, "opensesame"),
		`#!/bin/sh\nFAKE_OPENSESAME_SCENARIO='${scenario}' FAKE_OPENSESAME_RECORD='${record}' exec '${process.execPath}' --no-warnings '${FAKE_OPENSESAME}' "$@"\n`,
	);
	chmodSync(join(binDir, "opensesame"), 0o755);
	return record;
}

interface BinRun {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	/** The command line OpenSesame was asked to run, after `--`; absent when it was not started. */
	readonly command: readonly string[] | undefined;
	readonly childMarker: string | undefined;
}

function recorded(record: string) {
	if (!existsSync(record)) return { command: undefined, marker: undefined };
	const parsed = parseJsonValue(readFileSync(record, "utf8"));
	if (!isJsonObject(parsed) || !Array.isArray(parsed.argv)) {
		return { command: undefined, marker: undefined };
	}
	const argv = parsed.argv.filter(isJsonString);
	return {
		command: argv.slice(argv.indexOf("--") + 1),
		marker: isJsonString(parsed.sawChildMarker)
			? parsed.sawChildMarker
			: undefined,
	};
}

function runBin(
	nodeArgs: readonly string[],
	args: readonly string[],
	env: Record<string, string>,
	record: string,
): Promise<BinRun> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[...nodeArgs, "--import", TSX_LOADER, HOBO_BIN, ...args],
			{
				cwd: work,
				// Built, not inherited: nothing of this test's own environment reaches the bin.
				env: {
					PATH: `${binDir}:${process.env.PATH ?? ""}`,
					HOME: root,
					HOBO_HOME: join(root, ".hobo"),
					TMPDIR: scratch,
					NODE_NO_WARNINGS: "1",
					...env,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const out: string[] = [];
		const err: string[] = [];
		child.stdout.on("data", (chunk) => out.push(String(chunk)));
		child.stderr.on("data", (chunk) => err.push(String(chunk)));
		child.on("error", reject);
		child.on("close", (status) => {
			const { command, marker } = recorded(record);
			resolve({
				status,
				stdout: out.join(""),
				stderr: err.join(""),
				command,
				childMarker: marker,
			});
		});
	});
}

describe("the composed hobo binary under HOBO_CREDENTIALS=opensesame", () => {
	it(
		"relaunches itself under OpenSesame with its TypeScript loader and not its --env-file, and exits as the command did",
		async () => {
			const record = standIn("surrogate-delivered");
			// A file holding another provider's credential: re-read in the command,
			// it would sit beside the surrogate (C-1 of the #1593 review).
			const envFile = join(root, "fixture.env");
			writeFileSync(
				envFile,
				"CLOUDFLARE_API_TOKEN=cf_dummy_marker_not_a_secret\nCLOUDFLARE_ACCOUNT_ID=acct_dummy\n",
			);
			const run = await runBin(
				[`--env-file=${envFile}`],
				["recipes"],
				{ HOBO_CREDENTIALS: "opensesame" },
				record,
			);
			expect(run.stderr.match(/^hobo: .*$/gmu)).toEqual([
				"hobo: not passed to the run under OpenSesame: --env-file (a Node option reaches it only when it reads no environment or code from disk)",
			]);
			expect(run.status).toBe(0);
			expect(run.stdout).toMatch(/recipes\s+listed/u);
			// The bin started OpenSesame, and asked it to run this same invocation,
			// TypeScript loader included (without it the command could not load),
			// --env-file left out.
			expect(run.command).toEqual([
				process.execPath,
				"--import",
				TSX_LOADER,
				HOBO_BIN,
				"recipes",
			]);
			expect(run.childMarker).toBe("1");
		},
		RUN_TIMEOUT_MS,
	);
});
