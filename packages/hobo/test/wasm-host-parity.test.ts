import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createComposedHoboCli } from "../src/cli.js";
import {
	HOBO_ENV_HEADER_PREFIX,
	INTERNAL_MESH_HOST,
	initBareMetalYard,
	PINNED_WASMTIME_VERSION,
	probeWasmHostInstall,
	resolvePrivateWasmGuest,
	serveBindleOnLocalYard,
	serveProjectOnIsolatedWasm,
	serveProjectOnLocalYard,
} from "../src/index.js";

const helloBindleDir = fileURLToPath(
	new URL("../../../examples/hello-bindle", import.meta.url),
);

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) {
		await cleanups.pop()?.();
	}
});

describe("Yard / Camp / component host + hobo-managed sandboxes", () => {
	it("probes component-host tiers on the local Yard", () => {
		const probe = probeWasmHostInstall();
		expect(probe.engineKind).toBe("wasmtime");
		expect(probe.componentHosts.local).toContain("Camp capability");
		expect(probe.componentHosts["isolated-wasm"]).toContain(
			"wasmtime OS-process",
		);
	});

	it("hobo yard ensure installs isolated-wasm toolchain under HOBO_HOME", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-ensure-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		const cli = createComposedHoboCli();
		const result = await cli.run(
			["yard", "ensure", "--home", hoboHome, "--json"],
			{ cwd: hoboHome },
		);
		const envelope = JSON.parse(result.stdout) as {
			ok: boolean;
			code: string;
			data: {
				toolchain: {
					wasmtime: { version: string; binPath: string };
					jco: { version: string };
					ready: boolean;
				};
			};
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.code).toBe("HOBO_YARD_ENSURE");
		expect(envelope.data.toolchain.ready).toBe(true);
		expect(envelope.data.toolchain.wasmtime.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(existsSync(envelope.data.toolchain.wasmtime.binPath)).toBe(true);
	}, 120_000);

	it("hobo yard init --host isolated-wasm records config and ensures toolchain", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-iso-home-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		const cli = createComposedHoboCli();
		const init = await cli.run(
			[
				"yard",
				"init",
				"--home",
				hoboHome,
				"--host",
				"isolated-wasm",
				"--json",
			],
			{ cwd: hoboHome },
		);
		const envelope = JSON.parse(init.stdout) as {
			ok: boolean;
			message: string;
			data: {
				config: { componentHost: string; host: string };
				toolchain?: { wasmtime: { version: string } };
			};
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.data.config.componentHost).toBe("isolated-wasm");
		expect(envelope.data.config.host).toBe("isolated-wasm");
		expect(envelope.message).toContain("componentHost=isolated-wasm");
		expect(envelope.data.toolchain?.wasmtime.version).toMatch(/^\d+\.\d+\.\d+$/);
	}, 120_000);

	it("local component host: Yard places Camp; only web is public", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-local-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		initBareMetalYard({ hoboHome, componentHost: "local" });
		const port = 23000 + Math.floor(Math.random() * 500);
		const serve = await serveBindleOnLocalYard({
			projectDir: helloBindleDir,
			hoboHome,
			port,
		});
		cleanups.push(() => serve.close());

		expect(serve.componentHost).toBe("local");
		expect(serve.yard.kind).toBe("yard");
		expect(serve.campId).toContain("dev");
		expect(serve.exposedEndpoints).toHaveLength(1);
		expect(serve.exposedEndpoints[0]?.resourceName).toBe("web");
		const api = serve.endpoints.find((e) => e.resourceName === "api");
		expect(api?.port).toBeNull();
		expect(api?.url).toContain(INTERNAL_MESH_HOST);

		const html = await (await fetch(`${serve.primaryUrl}/?name=Local`)).text();
		expect(html).toContain("from-bindle-api, Local");
	});

	it(
		"isolated-wasm via hobo path: mesh injects env into wasmtime sandbox",
		async () => {
			const hoboHome = await mkdtemp(join(tmpdir(), "hobo-iso-"));
			cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));

			// Toolchain must come from hobo yard ensure — not ad-hoc agent setup.
			const cli = createComposedHoboCli();
			const ensure = await cli.run(
				["yard", "init", "--home", hoboHome, "--host", "isolated-wasm", "--json"],
				{ cwd: hoboHome },
			);
			expect(JSON.parse(ensure.stdout).ok).toBe(true);

			const port = 24000 + Math.floor(Math.random() * 500);
			const serve = await serveProjectOnIsolatedWasm({
				projectDir: helloBindleDir,
				hoboHome,
				port,
			});
			cleanups.push(() => serve.close());

			expect(serve.componentHost).toBe("isolated-wasm");
			expect(serve.isolation.isolateBoundary).toBe("wasmtime_process");
			expect(serve.isolation.privateSandboxes).toBe(1);
			expect(serve.isolation.wasmtimeVersion).toMatch(/^\d+\.\d+\.\d+$/);
			expect(serve.isolation.wasmPaths.length).toBe(1);
			expect(existsSync(serve.isolation.wasmPaths[0]!)).toBe(true);
			expect(serve.exposedEndpoints).toHaveLength(1);
			// Mesh-injected bindle env (not baked into the .wasm).
			expect(serve.bindleEnv.GREETING_PREFIX).toBe("from-bindle-api");
			expect(HOBO_ENV_HEADER_PREFIX).toBe("x-hobo-env-");

			const html = await (await fetch(`${serve.primaryUrl}/?name=Iso`)).text();
			expect(html).toContain("from-bindle-api, Iso");
			expect(html).toContain("wasm-sandbox");
		},
		120_000,
	);

	it("legacy host aliases normalize to local component host", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-legacy-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		initBareMetalYard({ hoboHome, componentHost: "local" });
		const port = 25000 + Math.floor(Math.random() * 500);
		const serve = await serveProjectOnLocalYard({
			projectDir: helloBindleDir,
			hoboHome,
			port,
			componentHost: "runtime-local",
		});
		cleanups.push(() => serve.close());
		expect(serve.componentHost).toBe("local");
	});

	it("pins wasmtime floor for sandboxes", () => {
		expect(PINNED_WASMTIME_VERSION).toBe("46.0.1");
	});

	it("resolves private wasm guests from app adapters (not core templates)", () => {
		const resolved = resolvePrivateWasmGuest({
			projectDir: helloBindleDir,
			resourceName: "api",
		});
		expect(resolved.guestSourcePath).toContain(
			"src/adapters/wasm/api-guest.mjs",
		);
		expect(resolved.wasmPath).toBeNull();
		// Core must not invent app routes — missing guest fails closed.
		const missing = resolvePrivateWasmGuest({
			projectDir: helloBindleDir,
			resourceName: "nope",
		});
		expect(missing.guestSourcePath).toBeNull();
		expect(missing.wasmPath).toBeNull();
	});
});
