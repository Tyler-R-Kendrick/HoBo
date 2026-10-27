import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runHoboCodeCli } from "../src/cli.js";
import {
	resolveHoboBin,
	resolveHoboSpawn,
	startDevBrowserSession,
} from "../src/dev-browser.js";
import { runInteractiveShell } from "../src/interactive-shell.js";
import { createDefaultShellHost } from "../src/shell-host.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

function temp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	roots.push(dir);
	return dir;
}

function writeStubHobo(path: string): string {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(
		path,
		`#!/usr/bin/env node
import { createServer } from "node:http";
const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 4173;
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<h1>ok</h1>");
});
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  process.stderr.write(\`hobo dev: listening on http://127.0.0.1:\${address.port}/ (Ctrl-C to stop)\\n\`);
});
const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
`,
	);
	chmodSync(path, 0o755);
	return path;
}

function projectWithBindle(root: string): string {
	const projectDir = join(root, "app");
	mkdirSync(join(projectDir, "src"), { recursive: true });
	writeFileSync(join(projectDir, "src", "bindle.ts"), "export default {};\n");
	return projectDir;
}

function isolatedWorkspace(root: string): string {
	const bin = join(root, "packages", "hobo", "dist", "bin", "hobo.js");
	mkdirSync(join(root, "packages", "hobo", "dist", "bin"), { recursive: true });
	writeStubHobo(bin);
	return bin;
}

describe("hobo CLI resolution (the shipped /dev and run-it spawn)", () => {
	it("never defaults to the bare name hobo when this checkout has packages/hobo", () => {
		const spawned = resolveHoboSpawn({
			env: { PATH: "/no/such/bin" },
			argv: ["dev", "--cwd", "/tmp/app", "--port", "0"],
		});
		expect(spawned.command).toBe(process.execPath);
		expect(spawned.command).not.toBe("hobo");
		expect(spawned.bin).toMatch(
			/packages[/\\]hobo[/\\]dist[/\\]bin[/\\]hobo\.js$/u,
		);
		expect(spawned.args).toContain("--import");
		expect(spawned.args).toContain(spawned.bin);
		expect(spawned.args.slice(spawned.args.indexOf(spawned.bin))).toEqual([
			spawned.bin,
			"dev",
			"--cwd",
			"/tmp/app",
			"--port",
			"0",
		]);
	});

	it("ignores empty and whitespace env overrides so they cannot hide the workspace bin", () => {
		const shipped = resolveHoboBin({
			env: {
				PATH: "/no/such/bin",
				HOBO_CODE_HOBO_BIN: "",
				HOBO_BIN: "   ",
			},
		});
		expect(shipped).toMatch(
			/packages[/\\]hobo[/\\]dist[/\\]bin[/\\]hobo\.js$/u,
		);
	});

	it("prefers HOBO_CODE_HOBO_BIN over HOBO_BIN over the workspace walk", () => {
		const root = temp("hobo-bin-pref-");
		const workspaceBin = isolatedWorkspace(root);
		const codeBin = join(root, "override-code");
		const legacyBin = join(root, "override-legacy");
		writeFileSync(codeBin, "x");
		writeFileSync(legacyBin, "y");
		const from = join(root, "packages", "code", "src");
		expect(
			resolveHoboBin({
				env: { HOBO_CODE_HOBO_BIN: codeBin, HOBO_BIN: legacyBin },
				from,
			}),
		).toBe(codeBin);
		expect(resolveHoboBin({ env: { HOBO_BIN: legacyBin }, from })).toBe(
			legacyBin,
		);
		expect(resolveHoboBin({ env: { PATH: "/no/such/bin" }, from })).toBe(
			workspaceBin,
		);
	});

	it("walks from compiled dist and from a file path to the same workspace bin", () => {
		const root = temp("hobo-bin-walk-");
		const workspaceBin = isolatedWorkspace(root);
		expect(
			resolveHoboBin({
				env: { PATH: "/no/such/bin" },
				from: join(root, "packages", "code", "dist", "dev-browser.js"),
			}),
		).toBe(workspaceBin);
		expect(
			resolveHoboBin({
				env: { PATH: "/no/such/bin" },
				from: join(root, "packages", "code", "src", "nested", "deep"),
			}),
		).toBe(workspaceBin);
	});

	it("refuses a bare PATH name when the tree has no composed hobo.js", () => {
		const root = temp("hobo-bin-missing-");
		mkdirSync(join(root, "packages", "hobo"), { recursive: true });
		expect(() =>
			resolveHoboBin({
				env: { PATH: "/no/such/bin" },
				from: join(root, "packages", "code", "src"),
			}),
		).toThrow(/does not require `hobo` on PATH/u);
		expect(() =>
			resolveHoboSpawn({
				env: { PATH: "/no/such/bin" },
				from: join(root, "packages", "code", "src"),
				argv: ["dev"],
			}),
		).toThrow(/does not require `hobo` on PATH/u);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("spawns a non-.js override as the command itself", () => {
		const spawned = resolveHoboSpawn({
			hoboBin: "/usr/local/bin/hobo",
			argv: ["yard", "status"],
		});
		expect(spawned).toEqual({
			command: "/usr/local/bin/hobo",
			args: ["yard", "status"],
			bin: "/usr/local/bin/hobo",
		});
	});

	it("spawns a shebang file named hobo via process.execPath when PATH has no node", () => {
		const root = temp("hobo-bin-shebang-");
		const stub = writeStubHobo(join(root, "hobo"));
		const spawned = resolveHoboSpawn({
			hoboBin: stub,
			env: { PATH: "/no/such/bin" },
			argv: ["dev"],
		});
		expect(spawned.command).toBe(process.execPath);
		expect(spawned.args.at(-2)).toBe(stub);
		expect(spawned.args.at(-1)).toBe("dev");
	});

	it("turns a missing binary into a product ENOENT, not spawn hobo ENOENT", async () => {
		const root = temp("hobo-bin-enoent-");
		const projectDir = projectWithBindle(root);
		const hoboHome = join(root, "home");
		await expect(
			startDevBrowserSession({
				projectDir,
				hoboHome,
				hoboBin: join(root, "definitely-missing-hobo"),
				appPort: 0,
				debugPort: 0,
				sessionId: "dev-missing",
				env: { PATH: "/no/such/bin" },
				startupTimeoutMs: 3_000,
			}),
		).rejects.toSatisfy((error: Error) => {
			const message = error instanceof Error ? error.message : String(error);
			return (
				/hobo override binary not found|not found/u.test(message) &&
				!/spawn hobo ENOENT/u.test(message)
			);
		});
	}, 15_000);

	it("runs hobo-code dev through the real startDevBrowserSession when PATH has no hobo", async () => {
		const root = temp("hobo-bin-cli-");
		const projectDir = projectWithBindle(root);
		const hoboHome = join(root, "home");
		const stub = writeStubHobo(join(root, "hobo"));
		const result = await runHoboCodeCli(
			[
				"dev",
				"--cwd",
				projectDir,
				"--port",
				"0",
				"--debug-port",
				"0",
				"--once",
			],
			{
				hoboHome,
				cwd: projectDir,
				env: {
					PATH: "/no/such/bin",
					HOBO_HOME: hoboHome,
					HOBO_CODE_HOBO_BIN: stub,
				},
			},
		);
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_DEV");
		expect(result.message).not.toContain("spawn hobo ENOENT");
		expect(result.message).not.toContain("hobo CLI not found");
	}, 15_000);

	it("runs the user's 'run it' phrase through the host without a mocked startDevSession", async () => {
		const root = temp("hobo-bin-runit-");
		const projectDir = projectWithBindle(root);
		const hoboHome = join(root, "home");
		const stub = writeStubHobo(join(root, "hobo"));
		const host = createDefaultShellHost({
			cwd: projectDir,
			hoboHome,
			env: {
				PATH: "/no/such/bin",
				HOBO_HOME: hoboHome,
				HOBO_CODE_HOBO_BIN: stub,
			},
		});
		try {
			const text = await host.tryWorkspaceAction?.("run it");
			expect(text).toBeTruthy();
			expect(text).toMatch(/https?:\/\//);
			expect(text).not.toContain("spawn hobo ENOENT");
			expect(text).not.toContain("hobo CLI not found");
		} finally {
			await host.dispose?.();
		}
	}, 25_000);

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("keeps debug it on the same live-dev path as run it", async () => {
		const root = temp("hobo-bin-debug-");
		const projectDir = projectWithBindle(root);
		const hoboHome = join(root, "home");
		const stub = writeStubHobo(join(root, "hobo"));
		const host = createDefaultShellHost({
			cwd: projectDir,
			hoboHome,
			env: {
				PATH: "/no/such/bin",
				HOBO_HOME: hoboHome,
				HOBO_CODE_HOBO_BIN: stub,
			},
		});
		try {
			const text = await host.tryWorkspaceAction?.("debug it");
			expect(text).toMatch(/https?:\/\//);
			expect(text).not.toContain("spawn hobo ENOENT");
		} finally {
			await host.dispose?.();
		}
	}, 15_000);

	it("scripts run it through the Bo TUI without mocking startDevSession", async () => {
		const root = temp("hobo-bin-tui-");
		const projectDir = projectWithBindle(root);
		const hoboHome = join(root, "home");
		const stub = writeStubHobo(join(root, "hobo"));
		const host = createDefaultShellHost({
			cwd: projectDir,
			hoboHome,
			env: {
				PATH: "/no/such/bin",
				HOBO_HOME: hoboHome,
				HOBO_CODE_HOBO_BIN: stub,
			},
		});
		let output = "";
		try {
			await runInteractiveShell({
				stdin: new PassThrough(),
				stdout: new Writable({
					write: (chunk, _encoding, done) => {
						output += chunk.toString();
						done();
					},
				}),
				host,
				reducedMotion: true,
				scriptedKeys: "run it\r",
			});
			const deadline = Date.now() + 60_000;
			while (!/https?:\/\//u.test(output) && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect(output).toMatch(/https?:\/\//);
			expect(output).not.toContain("spawn hobo ENOENT");
			expect(output).not.toContain("hobo CLI not found");
		} finally {
			await host.dispose?.();
		}
	}, 120_000);

	it("tells the user to create an app when run it has no Bindle", async () => {
		const root = temp("hobo-bin-empty-");
		const host = createDefaultShellHost({
			cwd: root,
			hoboHome: join(root, "home"),
			env: { PATH: "/no/such/bin", HOBO_HOME: join(root, "home") },
		});
		try {
			expect(await host.tryWorkspaceAction?.("run it")).toMatch(
				/create a hello world app/i,
			);
		} finally {
			await host.dispose?.();
		}
	});

	it("does not let an isolated tree pick up this checkout's hobo.js", () => {
		const root = temp("hobo-bin-isolate-");
		expect(() =>
			resolveHoboBin({
				env: { PATH: "/no/such/bin" },
				from: join(root, "packages", "code", "src"),
			}),
		).toThrow(/composed @hobo\/hobo not found/u);
	});

	it("default resolveHoboBin points at a real file in this checkout", () => {
		const bin = resolveHoboBin({ env: { PATH: "/no/such/bin" } });
		expect(readFileSync(bin, "utf8")).toContain("createComposedHoboCli");
	});
});
