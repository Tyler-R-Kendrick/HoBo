import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
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
const HOBO_MCP_BIN = fileURLToPath(
	new URL("../src/bin/hobo-mcp.ts", import.meta.url),
);
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
/** The project: it holds hobo.credentials.json. */
let work = "";
/** A directory with no bindings, to start the bin from. */
let elsewhere = "";
let binDir = "";
let scratch = "";
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "hobo-bin-opensesame-"));
	work = join(root, "work");
	elsewhere = join(root, "elsewhere");
	binDir = join(root, "bin");
	scratch = join(root, "tmp");
	for (const dir of [work, elsewhere, binDir, scratch]) mkdirSync(dir);
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
	/** Whether OpenSesame was given the store passphrase. */
	readonly sawStorePassword: boolean;
}

function recorded(record: string) {
	const none = {
		command: undefined,
		marker: undefined,
		sawStorePassword: false,
	};
	if (!existsSync(record)) return none;
	const parsed = parseJsonValue(readFileSync(record, "utf8"));
	if (!isJsonObject(parsed) || !Array.isArray(parsed.argv)) return none;
	const argv = parsed.argv.filter(isJsonString);
	return {
		command: argv.slice(argv.indexOf("--") + 1),
		marker: isJsonString(parsed.sawChildMarker)
			? parsed.sawChildMarker
			: undefined,
		sawStorePassword: parsed.sawStorePassword === true,
	};
}

interface BinInput {
	readonly bin?: string;
	readonly nodeArgs?: readonly string[];
	readonly args?: readonly string[];
	readonly env: Record<string, string>;
	readonly record: string;
	readonly cwd?: string;
	/** Written to the bin's stdin, which is then closed. */
	readonly stdin?: string;
}

/** The `hobo-yard-*` event stores the runs left in their TMPDIR (C-8 of the #1593 review). */
function leftYards(): string[] {
	return readdirSync(scratch).filter((name) => name.startsWith("hobo-yard-"));
}

function runBin(input: BinInput): Promise<BinRun> {
	const bin = input.bin ?? HOBO_BIN;
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				...(input.nodeArgs ?? []),
				"--import",
				TSX_LOADER,
				bin,
				...(input.args ?? []),
			],
			{
				cwd: input.cwd ?? work,
				// Built, not inherited: nothing of this test's own environment reaches the bin.
				env: {
					PATH: `${binDir}:${process.env.PATH ?? ""}`,
					HOME: root,
					HOBO_HOME: join(root, ".hobo"),
					TMPDIR: scratch,
					NODE_NO_WARNINGS: "1",
					...input.env,
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		child.stdin.end(input.stdin ?? "");
		const out: string[] = [];
		const err: string[] = [];
		child.stdout.on("data", (chunk) => out.push(String(chunk)));
		child.stderr.on("data", (chunk) => err.push(String(chunk)));
		child.on("error", reject);
		child.on("close", (status) => {
			const { command, marker, sawStorePassword } = recorded(input.record);
			resolve({
				status,
				stdout: out.join(""),
				stderr: err.join(""),
				command,
				childMarker: marker,
				sawStorePassword,
			});
		});
	});
}

describe("the composed hobo binary under HOBO_CREDENTIALS=opensesame", () => {
	it(
		"relaunches itself under OpenSesame with its TypeScript loader and not its --env-file, reads the bindings from --cwd, and exits as the command did",
		async () => {
			const record = standIn("surrogate-delivered");
			// A file holding another provider's credential: re-read in the command,
			// it would sit beside the surrogate (C-1 of the #1593 review).
			const envFile = join(root, "fixture.env");
			writeFileSync(
				envFile,
				"CLOUDFLARE_API_TOKEN=cf_dummy_marker_not_a_secret\nCLOUDFLARE_ACCOUNT_ID=acct_dummy\n",
			);
			// Started where there are no bindings: they are read from --cwd (C-7).
			const run = await runBin({
				nodeArgs: [`--env-file=${envFile}`],
				args: ["--cwd", work, "recipes"],
				env: { HOBO_CREDENTIALS: "opensesame" },
				record,
				cwd: elsewhere,
			});
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
				"--cwd",
				work,
				"recipes",
			]);
			expect(run.childMarker).toBe("1");
			// The composed process removed its event store on the way out.
			expect(leftYards()).toEqual([]);
		},
		RUN_TIMEOUT_MS,
	);

	it(
		"answers --help without starting OpenSesame, with no bindings anywhere",
		async () => {
			const record = standIn("surrogate-delivered");
			const run = await runBin({
				args: ["--help"],
				env: { HOBO_CREDENTIALS: "opensesame" },
				record,
				cwd: elsewhere,
			});
			expect(run.stderr).not.toMatch(/^hobo: /mu);
			expect(run.status).toBe(0);
			expect(run.stdout).toMatch(/^HoBo CLI/u);
			expect(run.command).toBeUndefined();
			// The composed process removed its event store on the way out.
			expect(leftYards()).toEqual([]);
		},
		RUN_TIMEOUT_MS,
	);
});

describe("hobo-mcp under HOBO_CREDENTIALS=opensesame", () => {
	it(
		"relaunches under OpenSesame, given the store passphrase, and serves MCP through it",
		async () => {
			const record = standIn("surrogate-delivered");
			const run = await runBin({
				bin: HOBO_MCP_BIN,
				env: {
					HOBO_CREDENTIALS: "opensesame",
					OPENSESAME_STORE_PASSWORD: "dummy-not-a-secret",
				},
				record,
				stdin: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
			});
			expect(run.stderr).not.toMatch(/^hobo: /mu);
			expect(run.status).toBe(0);
			expect(run.command).toEqual([
				process.execPath,
				"--import",
				TSX_LOADER,
				HOBO_MCP_BIN,
			]);
			expect(run.childMarker).toBe("1");
			// The composed process removed its event store on the way out.
			expect(leftYards()).toEqual([]);
			expect(run.sawStorePassword).toBe(true);
			// The relaunched server answered on the stdout the client reads.
			const reply = parseJsonValue(run.stdout.trim());
			expect(isJsonObject(reply) && reply.id).toBe(1);
			expect(isJsonObject(reply) && isJsonObject(reply.result)).toBe(true);
		},
		RUN_TIMEOUT_MS,
	);

	it(
		"without the store passphrase, starts nothing and says why on one line",
		async () => {
			const record = standIn("surrogate-delivered");
			const run = await runBin({
				bin: HOBO_MCP_BIN,
				env: { HOBO_CREDENTIALS: "opensesame" },
				record,
				stdin: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
			});
			expect(run.status).toBe(1);
			expect(run.stderr).toMatch(
				/^hobo: OPENSESAME_STORE_PASSWORD_REQUIRED: [^\n]*\n$/u,
			);
			expect(run.stdout).toBe("");
			expect(run.command).toBeUndefined();
			// The composed process removed its event store on the way out.
			expect(leftYards()).toEqual([]);
		},
		RUN_TIMEOUT_MS,
	);
});
