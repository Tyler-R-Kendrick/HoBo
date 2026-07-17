import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createComposedHoboCli,
	createDefaultYardRuntime,
	createImportCommand,
} from "../src/index.js";

// `hobo import` adopts an existing estate: it records a `deployment.Imported`
// fact for the project's declared resources (no provisioning), and the
// DeploymentView reflects them as a deployed, imported deployment that
// `inspect`/`drift` then operate on.

const HELLO_BINDLE = {
	schema: "hobo.manifest/v1",
	componentHost: { kind: "wasmtime", version: "1.0.0" },
	resources: {
		service: {
			type: "component.v1",
			image: "oci://registry.example.com/hello-bindle@sha256:abc123",
			runtime: "wasm",
			exports: ["wasi:http/incoming-handler"],
			bind: ["sessions"],
		},
		sessions: { type: "data.v1", port: "kv" },
	},
};

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

async function withProject(
	callback: (cwd: string) => Promise<void>,
	writeManifest = true,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-import-"));
	if (writeManifest) {
		await writeFile(
			path.join(dir, "hobo.bindle.json"),
			`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
		);
	}
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader.
function envelope(stdout: string): any {
	return JSON.parse(stdout);
}

describe("createImportCommand", () => {
	it("adopts the declared estate without provisioning, and inspect sees it", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const imported = envelope(
				(await cli.run(["import", "--json"], { cwd })).stdout,
			);
			expect(imported.code).not.toBe("HOBO_CLI_STUB");
			expect(imported.ok).toBe(true);
			expect(imported.status).toBe("imported");
			expect(imported.data.imported).toBe(true);
			expect(imported.data.deploymentStatus).toBe("deployed");
			expect(imported.data.bindleHash).toMatch(/^sha256:/);
			expect(Object.keys(imported.data.resources).sort()).toEqual([
				"service",
				"sessions",
			]);

			// inspect now operates on the adopted deployment.
			const inspect = envelope(
				(await cli.run(["inspect", "--json"], { cwd })).stdout,
			);
			expect(inspect.status).toBe("deployed");
			expect(Object.keys(inspect.data.resources).sort()).toEqual([
				"service",
				"sessions",
			]);
		});
	});

	it("is idempotent: a second import of a managed deployment is a no-op", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			await cli.run(["import", "--json"], { cwd });
			const again = envelope(
				(await cli.run(["import", "--json"], { cwd })).stdout,
			);
			expect(again.ok).toBe(true);
			expect(again.status).toBe("already_managed");
		});
	});

	it("errors when there is no Bindle to adopt", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = envelope(
				(await cli.run(["import", "--json"], { cwd })).stdout,
			);
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_NO_BINDLE");
		}, false);
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createImportCommand().run({
			context: { cwd: "/tmp", projectDir: "/tmp" } as unknown as CliContext,
			flags: { cwd: "/tmp" } as never,
			args: [],
			verb: "import",
			emitProgress: () => {},
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
