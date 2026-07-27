import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { loadBindleDefinition } from "@hobo/cli";

import { createComposedHoboCli } from "../src/cli.js";
import {
	collectExplicitProviderPins,
	ensureEmbeddedBroker,
	resolveBindlePlacement,
	WASM_SANDBOX_PROVIDER_ID,
} from "../src/index.js";
import { initBareMetalYard } from "../src/bare-metal-yard.js";

const helloBindleDir = fileURLToPath(
	new URL("../../../examples/hello-bindle", import.meta.url),
);

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) {
		await cleanups.pop()?.();
	}
});

describe("embedded broker-runtime", () => {
	it("yard init installs a broker and prefers wasm-sandbox when available", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-broker-init-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		const cli = createComposedHoboCli();
		const init = await cli.run(["yard", "init", "--home", hoboHome, "--json"], {
			cwd: hoboHome,
		});
		const envelope = JSON.parse(init.stdout) as {
			ok: boolean;
			data: {
				broker: { brokerId: string; preferredComponentHost: string };
				config: { componentHost: string };
			};
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.data.broker.brokerId).toMatch(/^broker:local\//);
		expect(["wasm", "isolated-wasm", "local"]).toContain(
			envelope.data.broker.preferredComponentHost,
		);
		expect(envelope.data.config.componentHost).toBe(
			envelope.data.broker.preferredComponentHost,
		);
	}, 120_000);

	it("hello-bindle has no provider pins (defaults only)", async () => {
		const definition = await loadBindleDefinition(helloBindleDir);
		expect(definition).not.toBeNull();
		expect(collectExplicitProviderPins(definition!)).toEqual([]);
	});

	it("places hello-bindle via broker and auto-creates a camp", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-broker-place-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		initBareMetalYard({ hoboHome, componentHost: "local" });
		const definition = (await loadBindleDefinition(helloBindleDir))!;
		const placement = await resolveBindlePlacement({
			definition,
			hoboHome,
		});
		expect(placement.outcome).toBe("resolved");
		expect(placement.campId).toMatch(/^camp:dev-/);
		expect(placement.providerId.length).toBeGreaterThan(0);
	}, 120_000);

	it("hard-fails when bindle pins a missing provider via .with", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-broker-pin-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		await ensureEmbeddedBroker({ hoboHome, preferWasmSandbox: false });
		const definition = (await loadBindleDefinition(helloBindleDir))!;
		// Synthesize a pin the catalog will not have.
		const pinned = {
			...definition,
			resources: {
				...definition.resources,
				api: {
					...definition.resources.api!,
					annotations: [
						{
							provider: "no-such-cloud-provider",
							option: "region",
							config: { region: "us-east-1" },
						},
					],
				},
			},
		};
		const placement = await resolveBindlePlacement({
			definition: pinned,
			hoboHome,
		});
		expect(placement.outcome).toBe("rejected");
		expect(placement.message).toMatch(/no-such-cloud-provider/);
		expect(placement.remediation?.some((r) => r.includes(".with"))).toBe(true);
	});

	it("hobo up goes through the broker for hello-bindle", async () => {
		const hoboHome = await mkdtemp(join(tmpdir(), "hobo-broker-up-"));
		cleanups.push(() => rm(hoboHome, { recursive: true, force: true }));
		const cli = createComposedHoboCli();
		const up = await cli.run(["up", "--home", hoboHome, "--json"], {
			cwd: helloBindleDir,
		});
		const envelope = JSON.parse(up.stdout) as {
			ok: boolean;
			code: string;
			message: string;
			data: {
				brokerId: string;
				campId: string;
				providerId: string;
				componentHost: string;
				bindleName: string;
			};
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.code).toBe("HOBO_OK");
		expect(envelope.data.bindleName).toBe("hello-bindle");
		expect(envelope.data.campId).toMatch(/^camp:dev-/);
		expect(envelope.data.brokerId).toMatch(/^broker:local\//);
		// Prefer wasm sandbox when tooling was equippable.
		expect(
			[WASM_SANDBOX_PROVIDER_ID, "@hobo/provider-local-host"].includes(
				envelope.data.providerId,
			),
		).toBe(true);
	}, 180_000);
});
