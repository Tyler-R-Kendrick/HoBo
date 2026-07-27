import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
	composeBareMetalTopology,
	initBareMetalYard,
	loadBareMetalYardConfig,
	openBareMetalYard,
	serveProjectOnBareMetalYard,
} from "../src/index.js";
import { createComposedHoboCli } from "../src/cli.js";
import { loadBindleDefinition } from "@hobo/cli";

const helloBindleDir = fileURLToPath(
	new URL("../../../examples/hello-bindle", import.meta.url),
);

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) {
		await cleanups.pop()?.();
	}
});

describe("bare-metal yard e2e", () => {
	it("hobo yard init writes the default bare-metal config", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-home-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));

		const cli = createComposedHoboCli();
		const init = await cli.run(
			["yard", "init", "--home", hoboHome, "--port", "4100", "--json"],
			{ cwd: hoboHome },
		);
		const envelope = JSON.parse(init.stdout) as {
			ok: boolean;
			code: string;
			data: { config: { name: string; defaultPort: number; kind: string } };
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.code).toBe("HOBO_YARD_INIT");
		expect(envelope.data.config.kind).toBe("bare-metal");
		expect(envelope.data.config.name).toBe("local");
		expect(envelope.data.config.defaultPort).toBe(4100);

		const loaded = loadBareMetalYardConfig(hoboHome);
		expect(loaded?.providerId).toBe("local");
		expect(loaded?.defaultPort).toBe(4100);
	});

	it("composes a real Camp/Yard from the hello-bindle definition", async () => {
		// Ensure tsx-style import path works in vitest for the example.
		const definition = await loadBindleDefinition(helloBindleDir);
		expect(definition).not.toBeNull();
		expect(definition?.name).toBe("hello-bindle");

		const dataDir = await mkdtemp(join(tmpdir(), "hobo-yard-data-"));
		cleanups.push(() => rm(dataDir, { recursive: true, force: true }));

		const topology = composeBareMetalTopology(definition!, { dataDir });
		expect(topology.kind).toBe("yard");
		expect(topology.providerId).toBe("local");
		expect(topology.camps).toHaveLength(1);
		expect(topology.camps[0]?.bindle.resources.map((r) => r.stableId)).toEqual(
			["api:api", "web:web"],
		);
	});

	it("serves hello-bindle through the bare-metal yard with services__ injection", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-home-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		initBareMetalYard({ hoboHome, defaultPort: 0 }); // port ignored; we pass explicit port

		// Pick free ports by binding base 0 via serve — use a high base from env.
		// Use random high port to avoid collisions.
		const basePort = 18000 + Math.floor(Math.random() * 1000);

		const serve = await serveProjectOnBareMetalYard({
			projectDir: helloBindleDir,
			hoboHome,
			port: basePort,
		});
		cleanups.push(() => serve.close());

		expect(serve.bindleName).toBe("hello-bindle");
		expect(serve.yard.providerId).toBe("local");
		expect(serve.serviceDiscovery.services__api__http__0).toMatch(
			/^http:\/\/127\.0\.0\.1:\d+$/,
		);
		expect(serve.serviceDiscovery.services__web__http__0).toMatch(
			/^http:\/\/127\.0\.0\.1:\d+$/,
		);

		// Host must inject bindle-declared env (intermediary proof).
		expect(serve.bindleEnv).toEqual({
			GREETING_PREFIX: "from-bindle-api",
			APP_TITLE: "from-bindle-web",
		});

		// Web is primary (ordered first) and must call the API through the
		// bindle-resolved services__api__http__0 endpoint, rendering bindle env.
		const web = await fetch(`${serve.primaryUrl}/?name=Yard`);
		expect(web.status).toBe(200);
		const html = await web.text();
		expect(html).toContain('data-testid="app-title">from-bindle-web</h1>');
		expect(html).toContain('data-testid="greeting">from-bindle-api, Yard</p>');
		expect(html).toContain('data-testid="greeting-prefix">from-bindle-api</p>');
		expect(html).toContain("services__api__http__0");

		const apiUrl = serve.serviceDiscovery.services__api__http__0!;
		const api = await fetch(`${apiUrl}/hello?name=Yard`);
		expect(await api.json()).toEqual({
			message: "from-bindle-api, Yard",
			greetingPrefix: "from-bindle-api",
			via: "bindle-env",
		});
	});

	it("hobo dev --once runs the bare-metal serve path for hello-bindle", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-home-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		initBareMetalYard({ hoboHome });

		const basePort = 19000 + Math.floor(Math.random() * 1000);
		const cli = createComposedHoboCli();
		// serveProject uses openBareMetalYard which reads HOBO_HOME from env
		// only via defaultHoboHome(); our serveProject in cli doesn't pass hoboHome.
		// Override by setting process.env.HOBO_HOME for the duration.
		const previous = process.env.HOBO_HOME;
		process.env.HOBO_HOME = hoboHome;
		try {
			const result = await cli.run(
				[
					"dev",
					"--once",
					"--port",
					String(basePort),
					"--cwd",
					helloBindleDir,
					"--json",
				],
				{ cwd: helloBindleDir },
			);
			const envelope = JSON.parse(result.stdout) as {
				ok: boolean;
				code: string;
				data: {
					mode: string;
					bindleName: string;
					serviceDiscovery: Record<string, string>;
					served: { status: number; body: string };
				};
			};
			expect(envelope.code).not.toBe("HOBO_CLI_STUB");
			expect(envelope.data.mode).toBe("bare-metal-yard");
			expect(envelope.data.bindleName).toBe("hello-bindle");
			expect(envelope.data.serviceDiscovery.services__api__http__0).toBeTruthy();
			expect(envelope.data.served.status).toBe(200);
			expect(envelope.data.served.body).toContain("from-bindle-web");
			expect(envelope.data.served.body).toContain("from-bindle-api, world");
			expect(envelope.ok).toBe(true);
		} finally {
			if (previous === undefined) delete process.env.HOBO_HOME;
			else process.env.HOBO_HOME = previous;
		}
	});

	it("openBareMetalYard auto-inits when missing", () => {
		// sync path — use unique home
		const hoboHome = join(tmpdir(), `hobo-auto-${Date.now()}`);
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		const yard = openBareMetalYard({ hoboHome });
		cleanups.push(() => yard.close());
		expect(yard.config.kind).toBe("bare-metal");
		expect(loadBareMetalYardConfig(hoboHome)?.name).toBe("local");
	});
});
