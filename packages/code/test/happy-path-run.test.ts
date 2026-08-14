import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadBindleDefinition } from "../../cli/src/cloud/loader.js";
import { extractListenUrl, resolveHoboSpawn } from "../src/dev-browser.js";
import { debugViewUrl } from "../src/evidence-overlay.js";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";
import { createDefaultShellHost } from "../src/shell-host.js";
import { matchWorkspaceAction } from "../src/workspace-actions.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("happy path: make a hello world app then run it", () => {
	it("matches the phrases the user typed", () => {
		expect(matchWorkspaceAction("make a hello world app")).toMatchObject({
			kind: "create",
			exampleId: "hello-world",
		});
		expect(matchWorkspaceAction("run it")).toEqual({ kind: "run" });
	});

	it("does not treat http://127.0.0.1:0 as a listen URL", () => {
		expect(
			extractListenUrl(
				"hobo dev: listening on http://127.0.0.1:0 (Ctrl-C to stop)\nhobo dev: Yard exposed web:web at http://127.0.0.1:48211",
			),
		).toBe("http://127.0.0.1:48211");
	});

	it("spawns hobo via node --import tsx so src/bindle.ts can load without a TTY", () => {
		const spawned = resolveHoboSpawn({
			env: { PATH: "/no/such/bin" },
			argv: ["dev", "--cwd", "/tmp/app", "--port", "0"],
		});
		expect(spawned.command).toBe(process.execPath);
		expect(spawned.args).toContain("--import");
		expect(spawned.args.some((arg) => arg.includes("tsx"))).toBe(true);
		expect(spawned.args).toContain("dev");
	});

	it("creates a Bindle that the hobo dev loader can import, then run it returns a listen URL", async () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-happy-path-"));
		roots.push(root);
		const host = createDefaultShellHost({
			cwd: root,
			hoboHome: join(root, ".hobo"),
			env: {
				PATH: "/no/such/bin",
				HOBO_HOME: join(root, ".hobo"),
			},
		});
		try {
			const created = await host.tryWorkspaceAction?.("make a hello world app");
			expect(created).toBeTruthy();
			expect(created).not.toMatch(
				/HOBO_CODE_DEV_FAILED|not_implemented|no loadable bindle/i,
			);
			const bindlePath = join(root, "hello-world", "src", "bindle.ts");
			expect(existsSync(bindlePath)).toBe(true);
			const loaded = await loadBindleDefinition(join(root, "hello-world"));
			expect(loaded, readFileSync(bindlePath, "utf8")).not.toBeNull();
			expect(loaded?.name).toBeTruthy();

			const run = await host.tryWorkspaceAction?.("run it");
			expect(run).toBeTruthy();
			expect(run).not.toMatch(
				/HOBO_CODE_DEV_FAILED|not_implemented|dev is not yet implemented|no loadable bindle|non-interactive terminal detected/i,
			);
			expect(run).toMatch(/https?:\/\//);
			expect(run).not.toMatch(/127\.0\.0\.1/);
			const namedDebug = /debug\s+(https?:\/\/\S+)/u.exec(run ?? "")?.[1];
			expect(namedDebug).toMatch(
				/^http:\/\/web\.hello-world\.local\.hobo\.localhost:\d+\/\?__hobo_debug=1$/u,
			);
			if (namedDebug === undefined) throw new Error("missing named debug URL");
			const debugUrl = loopbackFetchUrl(debugViewUrl(namedDebug));
			const debugPage = await fetch(debugUrl);
			expect(debugPage.status).toBe(200);
			expect(debugPage.headers.get("content-type")).toMatch(/text\/html/);
			const debugHtml = await debugPage.text();
			expect(debugHtml).toContain('class="bo"');
			expect(debugHtml).toContain("/__hobo/evidence/bo-idle.png");
			expect(debugHtml).toContain("@keyframes hobo-bo-idle");
			expect(debugHtml).toContain("animation:hobo-bo-idle");
			const sprite = await fetch(
				new URL("/__hobo/evidence/bo-idle.png", debugUrl).href,
			);
			expect(sprite.status).toBe(200);
			expect(sprite.headers.get("content-type")).toBe("image/png");
			expect(run).toMatch(
				/http:\/\/web\.hello-world\.local\.hobo\.localhost:\d+/,
			);
			expect(run).not.toMatch(
				/https:\/\/web\.hello-world\.local\.hobo\.localhost\/?(\s|$)/,
			);
		} finally {
			await host.dispose?.();
		}
	}, 45_000);
});
