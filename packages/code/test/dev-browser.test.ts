import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHoboCodeCli } from "../src/cli.js";
import {
	type DevBrowserSession,
	startDevBrowserSession,
} from "../src/dev-browser.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

function fixture(): {
	projectDir: string;
	hoboHome: string;
	hoboBin: string;
} {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-bindle-dev-"));
	roots.push(root);
	const projectDir = join(root, "app");
	const hoboHome = join(root, "home");
	mkdirSync(join(projectDir, "src"), { recursive: true });
	writeFileSync(join(projectDir, "src", "bindle.ts"), "export default {};\n");
	const hoboBin = join(root, "hobo");
	writeFileSync(
		hoboBin,
		`#!/usr/bin/env node
import { createServer } from "node:http";
const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 4173;
const controls = process.env.HOBO_CODE_EVIDENCE_CONTROLS_URL ?? "missing";
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(\`<h1 data-testid="app-title">Bindle app</h1><p>\${controls}</p>\`);
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
	chmodSync(hoboBin, 0o755);
	return { projectDir, hoboHome, hoboBin };
}

function fakeSession(): DevBrowserSession {
	return {
		sessionId: "dev-test",
		appUrl: "http://127.0.0.1:4173/",
		debugUrl: "http://127.0.0.1:4173/",
		controlsUrl: "http://127.0.0.1:4174/controls/test",
		reportUrl: "http://127.0.0.1:4174/report",
		evidencePath: "/tmp/evidence",
		close: async () => {},
	};
}

describe("hobo-code Bindle development bridge", () => {
	it("runs the project through hobo dev without requiring public/index.html", async () => {
		const { projectDir, hoboHome, hoboBin } = fixture();
		const session = await startDevBrowserSession({
			projectDir,
			hoboHome,
			hoboBin,
			appPort: 0,
			debugPort: 0,
			sessionId: "dev-test",
			stationId: "station:local",
			environment: "local-dev",
			tenant: "local",
		});
		expect(session.stationId).toBe("station:local");
		expect(session.environment).toBe("local-dev");
		try {
			const app = await fetch(session.appUrl);
			expect(app.status).toBe(200);
			const html = await app.text();
			expect(html).toContain("Bindle app");
			expect(html).toContain("/__hobo/evidence/controls/");
			expect(session.debugUrl).toBe(session.appUrl);

			const controls = await fetch(session.controlsUrl);
			expect(controls.status).toBe(200);
			expect(await controls.text()).toContain("Evidence desk");
		} finally {
			await session.close();
		}
	}, 15_000);

	it("exposes /dev as a bounded Bindle/Yard probe", async () => {
		const { projectDir, hoboHome } = fixture();
		let started = false;
		let closed = false;
		const session = fakeSession();
		const fetchActual = globalThis.fetch;
		const result = await runHoboCodeCli(
			["dev", "--cwd", projectDir, "--port", "0", "--once"],
			{
				hoboHome,
				env: { ...process.env, HOBO_HOME: hoboHome },
				startDevSession: async () => {
					started = true;
					return { ...session, close: async () => (closed = true) };
				},
				fetch: async (input, init) => {
					if (String(input).startsWith("http://127.0.0.1:")) {
						return new Response("ok", { status: 200 });
					}
					return fetchActual(input, init);
				},
			},
		);

		expect(started).toBe(true);
		expect(closed).toBe(true);
		expect(result).toMatchObject({
			ok: true,
			code: "HOBO_CODE_DEV",
			data: {
				deployment: {
					mode: "local-bindle",
					stationId: "station:local",
					environment: "local-dev",
					served: { appStatus: 200, controlsStatus: 200 },
					stopped: true,
				},
			},
		});
	});
});
