import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalSessionControl } from "../src/local-session-control.js";
import type { MuxRunner } from "../src/mux.js";
import { startSessionControlServer } from "../src/session-control-server.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

function git(cwd: string, args: readonly string[]): void {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

function repository(): string {
	const root = temp("hobo-session-server-repo-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "user.name", "Test"]);
	writeFileSync(join(root, "README.md"), "base\n");
	git(root, ["add", "-A"]);
	git(root, ["commit", "-qm", "base"]);
	return root;
}

function fakeTmux(): MuxRunner {
	let pane = 0;
	let exists = false;
	return {
		async run(args) {
			if (args[0] === "capture-pane") {
				return { code: 0, stdout: "resident output\n" };
			}
			if (args[0] === "has-session") {
				return { code: exists ? 0 : 1, stdout: "" };
			}
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				exists = true;
				pane += 1;
				return { code: 0, stdout: `%${pane}\n` };
			}
			if (args[0] === "kill-session") exists = false;
			return { code: 0, stdout: "" };
		},
	};
}

function envelope(
	sessionId: string,
	revision: string,
	command: string,
	value: Record<string, unknown>,
): Record<string, unknown> {
	return {
		schemaVersion: "hobo.code.session-command/v1",
		commandId: `${command}-${revision}`,
		actorId: "browser-test",
		sessionId,
		expectedRevision: revision,
		[command]: value,
	};
}

describe("resident session loopback server", () => {
	it("serves authenticated browser controls and the shared command boundary", async () => {
		const hoboHome = temp("hobo-session-server-home-");
		const projectRoot = repository();
		const tmux = fakeTmux();
		const control = createLocalSessionControl({ hoboHome, tmux });
		const server = await startSessionControlServer({
			hoboHome,
			projectRoot,
			token: "test-token",
			control,
		});
		try {
			const unauthorized = await fetch(
				`http://127.0.0.1:${server.port}/code/sessions`,
			);
			expect(unauthorized.status).toBe(401);

			const page = await fetch(server.url);
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(html).toContain("HoBo Code resident sessions");
			expect(html).toContain("Full command boundary");
			const script = /<script>([\s\S]+)<\/script>/u.exec(html)?.[1];
			expect(script).toBeDefined();
			expect(() => new Function(script ?? "")).not.toThrow();

			const headers = {
				authorization: "Bearer test-token",
				"content-type": "application/json",
			};
			const createdResponse = await fetch(
				`http://127.0.0.1:${server.port}/code/commands`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						command: envelope("session-1", "0", "createSession", {
							name: "review",
							projectRoot,
							branch: "code/review",
							clientId: "browser-test",
						}),
					}),
				},
			);
			expect(createdResponse.status).toBe(200);
			const created = (await createdResponse.json()) as {
				revision: string;
				panes: readonly { id: string }[];
			};
			expect(created.panes).toHaveLength(1);

			const detached = await fetch(
				`http://127.0.0.1:${server.port}/code/commands`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						command: envelope("session-1", created.revision, "detachSession", {
							clientId: "browser-test",
						}),
					}),
				},
			);
			expect(detached.status).toBe(200);

			const listed = await fetch(
				`http://127.0.0.1:${server.port}/code/sessions`,
				{ headers },
			);
			const sessions = (await listed.json()) as readonly unknown[];
			expect(sessions).toHaveLength(1);
			const output = await fetch(
				`http://127.0.0.1:${server.port}/code/sessions/session-1/panes/${created.panes[0]?.id}/output`,
				{ headers },
			);
			expect(await output.json()).toEqual({ output: "resident output\n" });
		} finally {
			await server.close();
		}
		const restarted = createLocalSessionControl({ hoboHome, tmux });
		await expect(restarted.list()).resolves.toHaveLength(1);
		restarted.close();
	});
});
