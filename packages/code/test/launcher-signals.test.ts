import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { launcherSignals } from "../bin/launcher-signals.mjs";

const launcher = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"bin",
	"hobo-code.mjs",
);

describe("which signals hobo-code's launcher passes on", () => {
	it("passes on the four that end hobo-code where its child has a session of its own", () => {
		for (const platform of ["linux", "darwin", "freebsd"] as const) {
			expect(launcherSignals(platform)).toEqual({
				listen: ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"],
				forward: true,
			});
		}
	});

	it("passes nothing on on Windows, where passing one on is a forced kill, and only waits for its child", () => {
		// The child shares the console and gets Ctrl-C itself. The launcher
		// listens only so that the console's Ctrl-C and Ctrl-Break, which would
		// end it, leave it waiting instead.
		expect(launcherSignals("win32")).toEqual({
			listen: ["SIGINT", "SIGBREAK"],
			forward: false,
		});
	});

	it("is what the launcher acts on", () => {
		const source = readFileSync(launcher, "utf8");
		expect(source).toMatch(/launcherSignals\(process\.platform\)/u);
	});
});
