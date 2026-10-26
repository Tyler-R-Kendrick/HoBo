import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { runHostProcess, runnerEnvironment } from "../src/bootstrap.js";

it("passes a minimal host environment without outer GitHub context or credentials", () => {
	expect(
		runnerEnvironment({
			PATH: "/bin",
			HOME: "/tmp/test",
			GITHUB_TOKEN: "secret",
			GITHUB_WORKSPACE: "outer",
			RUNNER_TRACKING_ID: "outer",
			ACTIONS_ID_TOKEN_REQUEST_TOKEN: "secret",
			AWS_ACCESS_KEY_ID: "secret",
			HOBO_CI_WEBHOOK_SECRET: "secret",
		}),
	).toEqual({ PATH: "/bin", HOME: "/tmp/test" });
});
it("terminates a timed-out process group and removes cancellation listeners", async () => {
	const term = process.listenerCount("SIGTERM");
	await expect(
		runHostProcess(
			process.execPath,
			["-e", "setInterval(()=>{},1000)"],
			process.cwd(),
			runnerEnvironment(process.env),
			50,
		),
	).rejects.toThrow(/timed out/);
	expect(process.listenerCount("SIGTERM")).toBe(term);
});
it("forwards parent cancellation to the detached child and waits for shutdown", async () => {
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", "test/fixtures/cancel-host.ts"],
		{ cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	const stopped = once(child, "exit");
	const ready = new Promise<void>((resolve, reject) => {
		child.stdout.on("data", (chunk) => {
			output += String(chunk);
			if (output.includes("READY")) resolve();
		});
		child.once("error", reject);
		child.once("exit", () => {
			if (!output.includes("READY"))
				reject(new Error("host fixture exited before ready"));
		});
	});
	try {
		await ready;
		child.kill("SIGTERM");
		expect((await stopped)[0]).toBe(1);
		expect(output).toContain("STOPPED");
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
	}
});
