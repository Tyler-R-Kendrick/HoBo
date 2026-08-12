import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runInteractiveShell } from "../src/interactive-shell.js";
import { createDefaultShellHost } from "../src/shell-host.js";
import { matchWorkspaceAction } from "../src/workspace-actions.js";

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

function plain(text: string): string {
	return text.replace(
		new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
		"",
	);
}

describe("Bo workspace actions", () => {
	it("treats create / run / debug as product actions", () => {
		expect(matchWorkspaceAction("create a hello world app")).toEqual({
			kind: "create",
			exampleId: "hello-world",
			prompt: "create a hello world app",
		});
		expect(matchWorkspaceAction("run it")).toEqual({ kind: "run" });
		expect(matchWorkspaceAction("debug it")).toEqual({ kind: "debug" });
		expect(matchWorkspaceAction("create a hello world app and run it")).toEqual(
			{
				kind: "create-and-run",
				exampleId: "hello-world",
				prompt: "create a hello world app and run it",
			},
		);
		expect(matchWorkspaceAction("deploy to azure")).toEqual({
			kind: "create",
			exampleId: "deploy.azure",
			prompt: "deploy to azure",
		});
		expect(matchWorkspaceAction("bundle apps in the same network")).toEqual({
			kind: "create",
			exampleId: "network.colocate",
			prompt: "bundle apps in the same network",
		});
		expect(matchWorkspaceAction("run the tests")).toBeUndefined();
		expect(matchWorkspaceAction("refine the openui bindle")).toBeUndefined();
	});

	it("creates then runs with real endpoints from the live session", async () => {
		const root = temp("hc-bo-ws-");
		const created: string[] = [];
		const host = createDefaultShellHost({
			cwd: root,
			hoboHome: join(root, ".hobo"),
			startDevSession: async (options) => {
				created.push(options.projectDir);
				return {
					sessionId: "dev-live",
					appUrl: "http://127.0.0.1:48211/",
					debugUrl: "http://127.0.0.1:48211/?__hobo_debug=1",
					controlsUrl: "http://127.0.0.1:48212/__hobo/evidence/controls/live",
					reportUrl: "http://127.0.0.1:48212/__hobo/evidence?report=live",
					evidencePath: join(root, ".hobo", "durable", "code", "evidence"),
					namedUrl: "https://web.hello-world.local.hobo.localhost",
					close: async () => {},
				};
			},
			fetch: async () => new Response("ok"),
		});

		const createdText = await host.tryWorkspaceAction?.(
			"create a hello world app",
		);
		expect(createdText).toMatch(/hello-world/i);
		expect(createdText).toMatch(/src\/bindle\.ts/);

		const azureText = await host.tryWorkspaceAction?.("deploy to azure");
		expect(azureText).toMatch(/deploy\.azure|azure/i);
		expect(azureText).toMatch(/src\/yard\.ts/);
		expect(azureText).not.toMatch(/hobo-code atoms/i);

		const runText = await host.tryWorkspaceAction?.("run it");
		expect(runText).toContain("http://127.0.0.1:48211/");
		expect(runText).toContain("https://web.hello-world.local.hobo.localhost");
		expect(created.at(-1)).toContain("hello-world");

		const debugText = await host.tryWorkspaceAction?.("debug it");
		expect(debugText).toContain(
			"http://127.0.0.1:48212/__hobo/evidence/controls/live",
		);
		expect(debugText).toContain(
			"http://127.0.0.1:48212/__hobo/evidence?report=live",
		);
		await host.dispose?.();
	});

	it("handles create/run in the interactive Bo session even when an engine is wired", async () => {
		const root = temp("hc-bo-tui-");
		mkdirSync(join(root, "hello-world", "src"), { recursive: true });
		writeFileSync(
			join(root, "hello-world", "src", "bindle.ts"),
			"export default {};\n",
		);
		let streamed = false;
		let output = "";
		const host = createDefaultShellHost({
			cwd: root,
			hoboHome: join(root, ".hobo"),
			startDevSession: async () => ({
				sessionId: "dev-tui",
				appUrl: "http://127.0.0.1:50100/",
				debugUrl: "http://127.0.0.1:50100/",
				controlsUrl: "http://127.0.0.1:50101/controls",
				reportUrl: "http://127.0.0.1:50101/report",
				evidencePath: join(root, ".hobo", "durable", "code", "evidence"),
				close: async () => {},
			}),
			fetch: async () => new Response("ok"),
		});
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: new Writable({
				write: (chunk, _encoding, done) => {
					output += chunk.toString();
					done();
				},
			}),
			host: {
				...host,
				streamTurn: async () => {
					streamed = true;
					return {
						ok: true,
						text: "model should not run",
						toolCalls: 0,
						aborted: false,
					};
				},
			},
			reducedMotion: true,
			scriptedKeys: "run it\r",
		});
		expect(streamed).toBe(false);
		expect(plain(output)).toContain("http://127.0.0.1:50100/");
		await host.dispose?.();
	});
});
