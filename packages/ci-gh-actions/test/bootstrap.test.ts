import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
it("allows a persistent listener without timing out based on registration age", async () => {
	await expect(
		runHostProcess(
			process.execPath,
			["-e", "setTimeout(() => {}, 75)"],
			process.cwd(),
			runnerEnvironment(process.env),
			undefined,
		),
	).resolves.toBeUndefined();
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

it.each([
	"timeout",
	"success",
])("waits for TERM-ignoring descendants after parent %s", async (outcome) => {
	const directory = await mkdtemp(join(tmpdir(), "hobo-host-group-"));
	const marker = join(directory, "descendant");
	const term = process.listenerCount("SIGTERM");
	const interrupt = process.listenerCount("SIGINT");
	const descendant = `
			process.on("SIGTERM", () => {});
			require("node:fs").writeFileSync(process.argv[1], String(process.pid));
			setInterval(() => {}, 1000);
		`;
	const parent = `
			process.on("SIGTERM", () => process.exit(0));
			require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}, process.argv[1]], {stdio:"ignore"});
			setInterval(() => {
				if (process.argv[2] === "success" && require("node:fs").existsSync(process.argv[1])) process.exit(0);
			}, 10);
		`;
	try {
		const operation = runHostProcess(
			process.execPath,
			["-e", parent, marker, outcome],
			directory,
			runnerEnvironment(process.env),
			outcome === "timeout" ? 1000 : 15000,
		);
		if (outcome === "timeout")
			await expect(operation).rejects.toThrow(/timed out/);
		else await operation;
		const pid = Number(await readFile(marker, "utf8"));
		const status = await readFile(`/proc/${pid}/stat`, "utf8").catch(
			() => undefined,
		);
		// Killed orphan zombies cannot execute; some container PID 1 processes reap them later.
		if (status)
			expect(
				status.slice(status.lastIndexOf(")") + 2, status.lastIndexOf(")") + 3),
			).toMatch(/[ZX]/);
		expect(process.listenerCount("SIGTERM")).toBe(term);
		expect(process.listenerCount("SIGINT")).toBe(interrupt);
	} finally {
		const pid = Number(await readFile(marker, "utf8").catch(() => "0"));
		if (pid > 0) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				/* Already stopped. */
			}
		}
		await rm(directory, { recursive: true, force: true });
	}
}, 20000);

it("cleans up cancellation handlers when spawning fails", async () => {
	const term = process.listenerCount("SIGTERM");
	const interrupt = process.listenerCount("SIGINT");
	await expect(
		runHostProcess("/hobo-missing-command", [], process.cwd(), {}, 30000),
	).rejects.toThrow(/ENOENT/);
	expect(process.listenerCount("SIGTERM")).toBe(term);
	expect(process.listenerCount("SIGINT")).toBe(interrupt);
});

it("keeps handling repeated cancellation signals until shutdown is acknowledged", async () => {
	const target =
		'process.on("SIGTERM",()=>setTimeout(()=>process.exit(0),250));process.stdout.write("READY");setInterval(()=>{},1000)';
	const program = `
		import {runHostProcess, runnerEnvironment} from "./src/bootstrap.ts";
		try { await runHostProcess(process.execPath, ["-e", ${JSON.stringify(target)}], process.cwd(), runnerEnvironment(process.env), 30000); }
		catch { process.stdout.write("ACK"); process.exitCode = 1; }
	`;
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", "--input-type=module", "-e", program],
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
				reject(new Error("host exited before ready"));
		});
	});
	try {
		await ready;
		child.kill("SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 25));
		child.kill("SIGTERM");
		expect((await stopped)[0]).toBe(1);
		expect(output).toContain("ACK");
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
	}
});
