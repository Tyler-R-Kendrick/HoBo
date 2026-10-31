import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";

import { launcherSignals } from "../bin/launcher-signals.mjs";
import { runInteractiveShell } from "../src/interactive-shell.js";

// `bin/ending-signals.mjs` is the one list of the signals that end hobo-code.
// Here it names a signal no one else uses, so whatever acts on it acts on the
// list, not on a copy of its own.
vi.mock("../bin/ending-signals.mjs", () => ({
	ENDING_SIGNALS: Object.freeze(["SIGUSR2"]),
}));

describe("what acts on hobo-code's ending signals reads the one list", () => {
	it("the launcher listens for it and passes it on", () => {
		expect(launcherSignals("linux")).toEqual({
			listen: ["SIGUSR2"],
			forward: true,
		});
	});

	it("the shell quits on it", async () => {
		const home = mkdtempSync(join(tmpdir(), "hobo-code-ending-"));
		const before = process.listenerCount("SIGUSR2");
		try {
			const quit = runInteractiveShell({
				stdin: new PassThrough(),
				stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
				host: {
					runVerb: async () => "ok",
					complete: async () => "unused",
				},
				hoboHome: home,
				sidecars: false,
				reducedMotion: true,
			});
			const deadline = Date.now() + 15_000;
			while (process.listenerCount("SIGUSR2") === before) {
				if (Date.now() > deadline)
					throw new Error("the shell never listened for the list's signal");
				await sleep(20);
			}
			process.emit("SIGUSR2");
			await expect(quit).resolves.toBe(0);
			expect(process.listenerCount("SIGUSR2")).toBe(before);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	}, 20_000);
});
