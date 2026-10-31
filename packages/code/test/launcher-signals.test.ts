import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { forwardSignal, launcherSignals } from "../bin/launcher-signals.mjs";

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

describe("how hobo-code's launcher passes a signal on", () => {
	const child = () => {
		const killed: string[] = [];
		return { pid: 4242, kill: (signal: string) => killed.push(signal), killed };
	};

	it("signals the child's process group, so what the child started gets it too", () => {
		const target = child();
		const sent: string[] = [];
		forwardSignal(target, "SIGTERM", (pid, signal) =>
			sent.push(`${pid} ${signal}`),
		);
		expect(sent).toEqual(["-4242 SIGTERM"]);
		expect(target.killed).toEqual([]);
	});

	it("signals the child alone when it leads no such group", () => {
		const target = child();
		forwardSignal(target, "SIGHUP", () => {
			throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
		});
		expect(target.killed).toEqual(["SIGHUP"]);
	});

	it("lets any other failure through", () => {
		const target = child();
		expect(() =>
			forwardSignal(target, "SIGINT", () => {
				throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
			}),
		).toThrow("EPERM");
		expect(target.killed).toEqual([]);
	});
});
