import {
	mkdirSync,
	mkdtempSync,
	existsSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runHoboCodeCli } from "../src/cli.js";
import { startDevBrowserSession } from "../src/dev-browser.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

function fixture(): { projectDir: string; hoboHome: string } {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-dev-browser-"));
	roots.push(root);
	const projectDir = join(root, "app");
	const publicDir = join(projectDir, "public");
	const hoboHome = join(root, "home");
	mkdirSync(publicDir, { recursive: true });
	writeFileSync(
		join(publicDir, "index.html"),
		'<!doctype html><html><body><h1 data-testid="app-title">Draft app</h1></body></html>',
	);
	return { projectDir, hoboHome };
}

describe("hobo-code browser development deployment", () => {
	it("serves the app and overlay, then persists browser debug commands", async () => {
		const { projectDir, hoboHome } = fixture();
		const privatePath = join(projectDir, "private.txt");
		writeFileSync(privatePath, "must stay private");
		symlinkSync(privatePath, join(projectDir, "public", "leak.txt"));
		const session = await startDevBrowserSession({
			projectDir,
			hoboHome,
			appPort: 0,
			debugPort: 0,
			sessionId: "dev-test",
		});
		try {
			const app = await fetch(session.appUrl);
			expect(app.status).toBe(200);
			expect(await app.text()).toContain("Draft app");
			expect((await fetch(`${session.appUrl}leak.txt`)).status).toBe(404);

			const debug = await fetch(session.debugUrl);
			expect(debug.status).toBe(200);
			expect(await debug.text()).toContain("/__hobo/evidence/bridge.js");
			expect(
				await (
					await fetch(`${session.appUrl}__hobo/evidence/bridge.js`)
				).text(),
			).toContain("data-hobo-evidence-overlay");

			const controls = await fetch(session.controlsUrl);
			expect(controls.status).toBe(200);
			expect(await controls.text()).toContain("Evidence desk");

			const actionUrl = new URL(session.controlsUrl);
			actionUrl.pathname = actionUrl.pathname.replace(
				"/controls/",
				"/api/actions/",
			);
			actionUrl.search = "";
			const response = await fetch(actionUrl, {
				method: "POST",
				headers: {
					"content-type": "text/plain",
					origin: new URL(session.debugUrl).origin,
				},
				body: JSON.stringify({
					type: "annotate",
					selector: "[data-testid=app-title]",
					note: "Heading needs clearer state.",
				}),
			});
			expect(response.status).toBe(202);
			expect(await (await fetch(session.reportUrl)).text()).toContain(
				"Heading needs clearer state.",
			);
		} finally {
			await session.close();
		}
	});

	it("exposes dev as a real CLI verb with a bounded probe mode", async () => {
		const { projectDir, hoboHome } = fixture();
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
			{ hoboHome, env: { ...process.env, HOBO_HOME: hoboHome } },
		);

		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_DEV");
		expect(result.message).toMatch(/browser|debug/i);
		expect(result.data).toMatchObject({
			deployment: {
				mode: "local-browser",
				served: { appStatus: 200, debugStatus: 200, controlsStatus: 200 },
				stopped: true,
			},
		});
	});

	it("fails a bad debug probe and closes the started servers", async () => {
		const { projectDir, hoboHome } = fixture();
		const fetchActual = globalThis.fetch;
		let appUrl = "";
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input, init) => {
				const url = String(input);
				if (url.includes("__hobo_debug"))
					return new Response("broken", { status: 500 });
				if (url.startsWith("http://127.0.0.1:") && url.endsWith("/"))
					appUrl = url;
				return fetchActual(input, init);
			});
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
			{ hoboHome, env: { ...process.env, HOBO_HOME: hoboHome } },
		);
		fetchMock.mockRestore();

		expect(result).toMatchObject({ ok: false, code: "HOBO_CODE_DEV_FAILED" });
		expect(result.message).toContain("200/500/200");
		expect(
			existsSync(join(hoboHome, "runtime", "code", "evidence-controls-url")),
		).toBe(false);
		await expect(fetchActual(appUrl)).rejects.toThrow();
	});
});
