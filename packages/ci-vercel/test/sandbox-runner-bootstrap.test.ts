import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as archive from "../src/sandbox-runner-archive.js";
import {
	PREPARE_SANDBOX_RUNNER,
	prepareSandboxRunner,
	type SandboxRunnerBootstrapPort,
	START_SANDBOX_RUNNER,
	startSandboxRunner,
} from "../src/sandbox-runner-bootstrap.js";

describe("isolated runner bootstrap", () => {
	it("keeps JIT out of command metadata and launches only after validated input", async () => {
		const secret = "c2luZ2xlLXVzZS1maXh0dXJl";
		const commands: unknown[] = [];
		const files: { path: string; content: Buffer; mode: number }[][] = [];
		type CommandOptions = { cmd: string; args: string[]; cwd: string };
		function runCommand(
			value: CommandOptions & { detached: true },
		): Promise<{ cmdId: string }>;
		function runCommand(
			value: CommandOptions & { detached: false },
		): Promise<{ exitCode: number }>;
		async function runCommand(value: CommandOptions & { detached: boolean }) {
			commands.push(value);
			return value.detached ? { cmdId: "command-1" } : { exitCode: 0 };
		}
		const sandbox: SandboxRunnerBootstrapPort = {
			writeFiles: async (value) => {
				files.push(value);
			},
			runCommand,
		};
		expect(await startSandboxRunner(sandbox, secret)).toEqual({
			cmdId: "command-1",
		});
		expect(files).toHaveLength(1);
		expect(files[0]?.[0]).toMatchObject({
			path: "/vercel/sandbox/.hobo-ci-jit",
			mode: 0o600,
			content: Buffer.from(secret),
		});
		expect(JSON.stringify(commands)).not.toContain(secret);
		expect(commands).toHaveLength(1);
		await expect(
			startSandboxRunner(sandbox, "invalid\ncommand"),
		).rejects.toThrow("invalid runner JIT configuration");
		expect(files).toHaveLength(1);
	});

	it("does not upload a forged runner archive to the VM", async () => {
		let writes = 0;
		const sandbox: SandboxRunnerBootstrapPort = {
			async writeFiles() {
				writes++;
			},
			async runCommand() {
				throw new Error("must not run");
			},
		};
		const fetcher: typeof fetch = async () => new Response("forged");
		await expect(prepareSandboxRunner(sandbox, fetcher)).rejects.toThrow(
			"checksum mismatch",
		);
		expect(writes).toBe(0);
	});

	it("creates the fresh VM workdir before uploading the verified runner", async () => {
		const download = vi
			.spyOn(archive, "downloadSandboxRunner")
			.mockResolvedValue(Buffer.from("verified archive"));
		const operations: string[] = [];
		const sandbox: SandboxRunnerBootstrapPort = {
			async writeFiles(files) {
				operations.push(`upload:${files[0]?.path}`);
			},
			async runCommand(command) {
				operations.push(`${command.cmd}:${command.cwd}`);
				return command.detached ? { cmdId: "unused" } : { exitCode: 0 };
			},
		};
		try {
			await prepareSandboxRunner(sandbox);
			expect(operations).toEqual([
				"mkdir:/",
				"upload:/vercel/sandbox/hobo-ci-runner.tar.gz",
				"bash:/vercel/sandbox",
			]);
		} finally {
			download.mockRestore();
		}
	});

	it("does not extract a runner archive with a mismatched checksum", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-sandbox-prep-"));
		try {
			writeFileSync(join(root, "hobo-ci-runner.tar.gz"), "forged");
			const script = PREPARE_SANDBOX_RUNNER.replaceAll("/vercel/sandbox", root);
			expect(() =>
				execFileSync("bash", ["-c", script], {
					env: { PATH: "/usr/bin:/bin" },
					stdio: "pipe",
				}),
			).toThrow();
			expect(existsSync(join(root, ".hobo-ci-prepared"))).toBe(false);
			expect(existsSync(join(root, "hobo-ci-runner", "run.sh"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("prepares an isolated writable home for the runner", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-sandbox-prep-"));
		try {
			const source = join(root, "source");
			mkdirSync(source);
			writeFileSync(join(source, "run.sh"), "#!/bin/sh\n");
			chmodSync(join(source, "run.sh"), 0o755);
			const file = join(root, "hobo-ci-runner.tar.gz");
			execFileSync("tar", ["-czf", file, "-C", source, "run.sh"]);
			const hash = createHash("sha256")
				.update(readFileSync(file))
				.digest("hex");
			const script = PREPARE_SANDBOX_RUNNER.replaceAll(
				"/vercel/sandbox",
				root,
			).replace(archive.SANDBOX_RUNNER_SHA256, hash);
			const bin = join(root, "bin");
			mkdirSync(bin);
			const uname = join(bin, "uname");
			writeFileSync(
				uname,
				'#!/bin/sh\n[ "$1" = -s ] && printf \'Linux\\n\' || printf \'x86_64\\n\'\n',
			);
			chmodSync(uname, 0o755);
			execFileSync("bash", ["-c", script], {
				env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
				stdio: "pipe",
			});
			expect(existsSync(join(root, ".hobo-ci-prepared"))).toBe(true);
			expect(existsSync(file)).toBe(false);
			expect(statSync(join(root, ".hobo-ci-home")).mode & 0o777).toBe(0o700);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("unlinks the JIT file, strips inherited credentials, and refuses a second start", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-sandbox-start-"));
		try {
			const runner = join(root, "hobo-ci-runner");
			mkdirSync(runner);
			mkdirSync(join(root, ".hobo-ci-home"));
			writeFileSync(join(root, ".hobo-ci-prepared"), "");
			writeFileSync(join(root, ".hobo-ci-jit"), "c2luZ2xlLXVzZQ==", {
				mode: 0o600,
			});
			const scriptPath = join(runner, "run.sh");
			writeFileSync(
				scriptPath,
				'#!/bin/sh\n[ "$1" = --jitconfig ] && [ "$2" = c2luZ2xlLXVzZQ== ] && [ -z "${HOST_CREDENTIAL+x}" ] && [ "$USER" = "$(id -un)" ] && [ -d "$HOME" ] && [ -w "$HOME" ] || exit 42\nprintf \'run\\n\' >> ../runs\nprintf \'home\\n\' > "$HOME/probe"\n',
			);
			chmodSync(scriptPath, 0o755);
			const script = START_SANDBOX_RUNNER.replaceAll("/vercel/sandbox", root);
			execFileSync("bash", ["-c", script], {
				env: { ...process.env, HOST_CREDENTIAL: "must-not-reach-runner" },
				stdio: "pipe",
			});
			expect(existsSync(join(root, ".hobo-ci-jit"))).toBe(false);
			expect(readFileSync(join(root, ".hobo-ci-home", "probe"), "utf8")).toBe(
				"home\n",
			);
			writeFileSync(join(root, ".hobo-ci-jit"), "c2luZ2xlLXVzZQ==", {
				mode: 0o600,
			});
			expect(() =>
				execFileSync("bash", ["-c", script], { stdio: "pipe" }),
			).toThrow();
			expect(readFileSync(join(root, "runs"), "utf8")).toBe("run\n");
			expect(existsSync(join(root, ".hobo-ci-jit"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
