import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The temporary directories the composition makes for itself: the live Pulumi
// lane's workspace (`hobo-pulumi-live-*`) when HOBO_PULUMI_WORKDIR is unset,
// removed however the process ends, like the bins' event store.

const TSX_LOADER = createRequire(import.meta.url).resolve("tsx");
const FIXTURE = fileURLToPath(
	new URL("./fixtures/composed-temp-dirs.mts", import.meta.url),
);
// Each run imports the whole composition from source.
const RUN_TIMEOUT_MS = 180_000;
const SIGNAL_GRACE_MS = 15_000;

let scratch = "";
beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "hobo-composed-temp-dirs-"));
});
afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

interface Ended {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}

function run(
	mode: string,
	dataDir: string,
	signal?: NodeJS.Signals,
): Promise<Ended> {
	const ready = join(scratch, "ready");
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["--import", TSX_LOADER, FIXTURE, mode, ready, dataDir],
			{
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: scratch,
					NODE_NO_WARNINGS: "1",
				},
				stdio: ["ignore", "ignore", "ignore"],
			},
		);
		child.on("error", reject);
		if (signal !== undefined) {
			const poll = setInterval(() => {
				if (!existsSync(ready)) return;
				clearInterval(poll);
				child.kill(signal);
				const deadline = setTimeout(
					() => child.kill("SIGKILL"),
					SIGNAL_GRACE_MS,
				);
				child.on("close", () => clearTimeout(deadline));
			}, 50);
			child.on("close", () => clearInterval(poll));
		}
		child.on("close", (code, ended) => resolve({ code, signal: ended }));
	});
}

function left(prefix: string): string[] {
	return readdirSync(scratch).filter((name) => name.startsWith(prefix));
}

describe("the live Pulumi lane's own workspace", () => {
	for (const [label, mode, signal, expected] of [
		["a normal end", "normal", undefined, { code: 0, signal: null }],
		["an uncaught error", "throw", undefined, { code: 1, signal: null }],
		[
			"SIGTERM, which still ends the process",
			"wait",
			"SIGTERM",
			{ code: null, signal: "SIGTERM" },
		],
	] as const) {
		it(
			`is removed on ${label}`,
			async () => {
				const yard = join(scratch, "kept-yard");
				mkdirSync(yard);
				const ended = await run(mode, yard, signal);
				expect(ended).toEqual(expected);
				expect(left("hobo-pulumi-live-")).toEqual([]);
				// A directory the caller named is the caller's: it is kept.
				expect(existsSync(join(yard, "eventstore.sqlite"))).toBe(true);
			},
			RUN_TIMEOUT_MS,
		);
	}
});
