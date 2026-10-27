import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	explicitHoboBinOverride,
	loadCreateComposedHoboCli,
	loadServeProjectOnLocalYard,
	resolveHoboPackageRoot,
	runComposedHobo,
} from "../src/composed-hobo.js";

/**
 * Run the signals fixture's steps in a fresh process (the composition module
 * is imported once per process): the listeners each ending signal had gained
 * after each load.
 */
function gainedListeners(...steps: string[]): string {
	const run = spawnSync(
		process.execPath,
		[
			"--import",
			createRequire(import.meta.url).resolve("tsx"),
			fileURLToPath(
				new URL("./fixtures/composed-hobo-signals.mts", import.meta.url),
			),
			...steps,
		],
		{
			encoding: "utf8",
			env: { PATH: process.env.PATH ?? "", NODE_NO_WARNINGS: "1" },
		},
	);
	expect(run.status, run.stderr).toBe(0);
	return run.stdout.trim();
}

describe("composed-hobo in-process bridge", () => {
	// The composition keeps its throwaway store in a hobo-yard-* directory
	// under TMPDIR and removes it on `exit`, which a vitest worker never
	// reaches. Each case points TMPDIR at a directory of its own and removes it.
	let tmpBefore: string | undefined;
	let scratch = "";
	beforeEach(() => {
		tmpBefore = process.env.TMPDIR;
		scratch = mkdtempSync(join(tmpdir(), "hobo-code-composed-"));
		process.env.TMPDIR = scratch;
	});
	afterEach(() => {
		if (tmpBefore === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = tmpBefore;
		rmSync(scratch, { recursive: true, force: true });
	});
	const stores = (): string[] =>
		readdirSync(scratch).filter((name) => name.startsWith("hobo-yard-"));

	it("finds the sibling @hobo/hobo package in this checkout", () => {
		const root = resolveHoboPackageRoot();
		expect(root).toMatch(/packages[/\\]hobo$/u);
	});

	it("ignores empty env overrides so in-process is the default", () => {
		expect(
			explicitHoboBinOverride({
				HOBO_CODE_HOBO_BIN: "",
				HOBO_BIN: "  ",
			}),
		).toBeUndefined();
		expect(
			explicitHoboBinOverride({ HOBO_CODE_HOBO_BIN: "/tmp/stub-hobo" }),
		).toBe("/tmp/stub-hobo");
	});

	it("loads serveProjectOnLocalYard from @hobo/hobo dist", async () => {
		const serve = await loadServeProjectOnLocalYard();
		expect(serve instanceof Function).toBe(true);
	}, 120_000);

	it("loads createComposedHoboCli from @hobo/hobo dist", async () => {
		const create = await loadCreateComposedHoboCli();
		expect(create instanceof Function).toBe(true);
		expect(create().run instanceof Function).toBe(true);
		expect(stores()).toHaveLength(1);
	}, 120_000);

	it("installs no signal handler for a library caller, and one per ending signal once the entry point asked, however many verbs load it and whenever it asked", () => {
		// The loader asks for the handlers on every load, as hobo-code does on
		// every /hobo verb; a second set would defer to the first, and the first
		// to it, so SIGINT would end nothing.
		expect(gainedListeners("load")).toBe("[[0,0,0,0]]");
		expect(gainedListeners("ask", "load", "load")).toBe(
			"[[1,1,1,1],[1,1,1,1]]",
		);
		// The ask counts when it comes after a load: the decision is read on
		// every load, not kept from the first.
		expect(gainedListeners("load", "ask", "load")).toBe(
			"[[0,0,0,0],[1,1,1,1]]",
		);
	}, 240_000);

	it("loads a @hobo/hobo dist built before the export, leaving its store to be removed on exit, rather than failing the verb", () => {
		const tree = mkdtempSync(join(tmpdir(), "hobo-code-older-dist-"));
		try {
			const pkg = join(tree, "packages", "hobo");
			mkdirSync(join(pkg, "dist"), { recursive: true });
			writeFileSync(
				join(pkg, "package.json"),
				`${JSON.stringify({ name: "@hobo/hobo", type: "module" })}\n`,
			);
			// The composition as it was: createComposedHoboCli, and no
			// removeOwnedDirsOnSignals beside it.
			writeFileSync(
				join(pkg, "dist", "cli.js"),
				'export function createComposedHoboCli() {\n\treturn { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };\n}\n',
			);
			expect(gainedListeners("ask", `from=${tree}`, "load")).toBe(
				"[[0,0,0,0]]",
			);
		} finally {
			rmSync(tree, { recursive: true, force: true });
		}
	}, 120_000);

	it("loads a removeOwnedDirsOnSignals that does nothing in a worker thread", async () => {
		// The export the hobo-code entry point opts in through, called where a
		// signal handler would end every thread of the process.
		const root = resolveHoboPackageRoot();
		expect(root).toBeDefined();
		const cli = pathToFileURL(join(root ?? "", "dist", "cli.js")).href;
		const worker = new Worker(
			`const { parentPort, workerData } = require("node:worker_threads");
import(workerData).then((mod) => {
	const signals = ["SIGTERM", "SIGHUP", "SIGINT", "SIGQUIT"];
	const before = signals.map((s) => process.listenerCount(s));
	mod.removeOwnedDirsOnSignals();
	parentPort.postMessage({
		exported: typeof mod.removeOwnedDirsOnSignals,
		added: signals.map((s, i) => process.listenerCount(s) - before[i]),
	});
});`,
			{ eval: true, workerData: cli },
		);
		const reply = await new Promise((resolve, reject) => {
			worker.once("message", resolve);
			worker.once("error", reject);
		});
		await worker.terminate();
		expect(reply).toEqual({ exported: "function", added: [0, 0, 0, 0] });
	}, 120_000);

	it("runs --help in-process without PATH hobo", async () => {
		const result = await runComposedHobo(["--help"], {
			env: { ...process.env, PATH: "/no/such/bin" },
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout + result.stderr).toMatch(/hobo/i);
		expect(stores()).toHaveLength(1);
	}, 120_000);
});
