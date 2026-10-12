import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FAKE = join(here, "fixtures/fake-opensesame.mts");
const RUNNER = join(here, "fixtures/run-adapter.mts");
const PACKAGE = join(here, "..");

let work = "";
let out = "";
let tmp = "";
beforeEach(() => {
	work = mkdtempSync(join(tmpdir(), "hobo-signals-process-"));
	out = join(work, "out");
	tmp = join(work, "tmp");
	mkdirSync(out);
	mkdirSync(tmp);
});
afterEach(() => {
	for (const file of ["child.pid", "fake.pid"]) end(pidIn(join(out, file)));
	rmSync(work, { recursive: true, force: true });
});

function pidIn(path: string): number | undefined {
	return existsSync(path) ? Number(readFileSync(path, "utf8")) : undefined;
}

function end(pid: number | undefined): void {
	if (pid === undefined) return;
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Already gone.
	}
}

function alive(pid: number | undefined): boolean {
	if (pid === undefined) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function until(condition: () => boolean, ms = 30_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

type Ended = {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
};

/** Run the adapter in a process of its own, signal it once the command is up, and say how it ended. */
async function signalled(signal: NodeJS.Signals): Promise<Ended> {
	const runner = spawn(
		process.execPath,
		["--import", "tsx", RUNNER, FAKE, out],
		{
			cwd: PACKAGE,
			env: {
				PATH: process.env.PATH ?? "",
				NODE_NO_WARNINGS: "1",
				TMPDIR: tmp,
				RUNNER_PASS_ENV: "FAKE_OPENSESAME_SIGNALS,FAKE_OPENSESAME_PIDFILE",
				FAKE_OPENSESAME_SIGNALS: join(work, "signals.log"),
				FAKE_OPENSESAME_PIDFILE: join(out, "fake.pid"),
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	runner.stderr.resume();
	let stdout = "";
	runner.stdout.on("data", (chunk) => {
		stdout += String(chunk);
	});
	const exited = new Promise<Ended>((resolve) => {
		runner.on("exit", (code, exitSignal) =>
			resolve({ code, signal: exitSignal, stdout }),
		);
	});
	await until(() => existsSync(join(out, "child.pid")));
	runner.kill(signal);
	return await exited;
}

function received(): string[] {
	const log = join(work, "signals.log");
	return existsSync(log)
		? readFileSync(log, "utf8").split("\n").filter(Boolean)
		: [];
}

function schemaDirs(): string[] {
	return readdirSync(tmp).filter((n) => n.startsWith("hobo-opensesame-"));
}

async function stops(path: string): Promise<boolean> {
	const pid = pidIn(path);
	try {
		await until(() => !alive(pid), 10_000);
		return true;
	} catch {
		return false;
	}
}

describe("a real process running the adapter, signalled while its command runs", () => {
	for (const [signal, exitCode] of [
		["SIGTERM", 143],
		["SIGHUP", 129],
	] as const) {
		it(`${signal}: OpenSesame is told ${signal}, the command stops, the schema is gone, and the caller gets the outcome`, async () => {
			const ended = await signalled(signal);
			expect(ended.signal).toBeNull();
			expect(ended.code).toBe(0);
			expect(ended.stdout).toContain('"kind":"signalled"');
			expect(ended.stdout).toContain(`"exitCode":${exitCode}`);
			expect(received()).toEqual([signal]);
			expect(schemaDirs()).toEqual([]);
			expect(await stops(join(out, "child.pid"))).toBe(true);
			expect(await stops(join(out, "fake.pid"))).toBe(true);
		}, 90_000);
	}

	for (const signal of ["SIGINT", "SIGQUIT"] as const) {
		it(`${signal}: OpenSesame is told SIGTERM, the command stops, the schema is gone, and the process still ends by ${signal}`, async () => {
			const ended = await signalled(signal);
			expect(ended.signal).toBe(signal);
			expect(ended.stdout).not.toContain("OUTCOME");
			expect(received()).toEqual(["SIGTERM"]);
			expect(schemaDirs()).toEqual([]);
			expect(await stops(join(out, "child.pid"))).toBe(true);
			expect(await stops(join(out, "fake.pid"))).toBe(true);
		}, 90_000);
	}

	it("SIGKILL cannot be handled: the schema stays behind, as references only, and OpenSesame and its command keep running", async () => {
		const ended = await signalled("SIGKILL");
		expect(ended.signal).toBe("SIGKILL");
		const left = schemaDirs();
		expect(left).toHaveLength(1);
		const dir = join(tmp, left[0] ?? "missing");
		const schema = join(dir, ".env.schema");
		expect((statSync(schema).mode & 0o777).toString(8)).toBe("600");
		expect((statSync(dir).mode & 0o777).toString(8)).toBe("700");
		const text = readFileSync(schema, "utf8");
		expect(text).toContain("opensesameConnection(conn://acme/vercel");
		expect(text).not.toMatch(/osr_|ostest_|vtok_|Bearer|PASSWORD/u);
		expect(alive(pidIn(join(out, "child.pid")))).toBe(true);
		expect(alive(pidIn(join(out, "fake.pid")))).toBe(true);
		expect(received()).toEqual([]);
	}, 90_000);
});
