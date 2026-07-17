import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createAddCommand,
	createComposedHoboCli,
	createDefaultYardRuntime,
} from "../src/index.js";

// `hobo add <provider>` installs a Capability-Manifest-bearing provider into the
// registry (a durable provider.Registered fact); `hobo registry` then folds it
// into the catalog alongside the base providers.

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

// biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader.
function envelope(stdout: string): any {
	return JSON.parse(stdout);
}

describe("createAddCommand", () => {
	it("installs the local provider and registry then lists it", async () => {
		const runtime = createDefaultYardRuntime();
		openStores.push(runtime.store as RuntimeLocalEventStore);
		const cli = createComposedHoboCli({ yardRuntime: runtime });

		// Not present before install.
		const before = envelope((await cli.run(["registry", "--json"])).stdout);
		expect(
			before.data.providers.some(
				(p: { providerId: string }) => p.providerId === "local",
			),
		).toBe(false);

		const add = envelope((await cli.run(["add", "local", "--json"])).stdout);
		expect(add.code).not.toBe("HOBO_CLI_STUB");
		expect(add.ok).toBe(true);
		expect(add.status).toBe("installed");
		expect(add.data.provider).toBe("local");
		expect(add.data.ports.sort()).toEqual(["kv", "objectStore"]);

		// registry now folds the installed provider (source: "installed").
		const after = envelope((await cli.run(["registry", "--json"])).stdout);
		const local = after.data.providers.find(
			(p: { providerId: string }) => p.providerId === "local",
		);
		expect(local).toBeDefined();
		expect(local.source).toBe("installed");
		expect(local.ports.map((p: { port: string }) => p.port).sort()).toEqual([
			"kv",
			"objectStore",
		]);
	});

	it("is idempotent when the provider is already installed", async () => {
		const runtime = createDefaultYardRuntime();
		openStores.push(runtime.store as RuntimeLocalEventStore);
		const cli = createComposedHoboCli({ yardRuntime: runtime });

		await cli.run(["add", "local", "--json"]);
		const again = envelope((await cli.run(["add", "local", "--json"])).stdout);
		expect(again.ok).toBe(true);
		expect(again.status).toBe("already_installed");
	});

	it("rejects an unknown provider and lists what is available", async () => {
		const runtime = createDefaultYardRuntime();
		openStores.push(runtime.store as RuntimeLocalEventStore);
		const cli = createComposedHoboCli({ yardRuntime: runtime });

		const bad = envelope((await cli.run(["add", "nope", "--json"])).stdout);
		expect(bad.ok).toBe(false);
		expect(bad.code).toBe("HOBO_ADD_UNKNOWN");
		expect(bad.data.available).toContain("local");
	});

	it("requires a provider argument", async () => {
		const runtime = createDefaultYardRuntime();
		openStores.push(runtime.store as RuntimeLocalEventStore);
		const cli = createComposedHoboCli({ yardRuntime: runtime });

		const noArg = envelope((await cli.run(["add", "--json"])).stdout);
		expect(noArg.ok).toBe(false);
		expect(noArg.code).toBe("HOBO_ADD_NO_PROVIDER");
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createAddCommand().run({
			context: { cwd: "/tmp", projectDir: "/tmp" } as unknown as CliContext,
			flags: { cwd: "/tmp" } as never,
			args: ["local"],
			verb: "add",
			emitProgress: () => {},
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
