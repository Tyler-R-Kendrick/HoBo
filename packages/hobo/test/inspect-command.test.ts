import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createComposedHoboCli,
	createDefaultYardRuntime,
	createInspectCommand,
} from "../src/index.js";

// `hobo inspect` folds the DeploymentView projection from the durable event log.
// The key test drives a real `hobo up` first, then inspects the SAME runtime and
// asserts the rebuilt-from-zero view reflects what up wrote — the log is
// authoritative. Also covers the no-history and no-runtime cases.

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
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-inspect-"));
	await writeFile(
		path.join(dir, "hobo.bindle.json"),
		`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
	);
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function envelope(stdout: string): {
	ok: boolean;
	status: string;
	code?: string;
	// biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader.
	data: Record<string, any>;
} {
	return JSON.parse(stdout);
}

describe("createInspectCommand", () => {
	it("renders the DeploymentView after a real `hobo up` on the same runtime", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const up = envelope((await cli.run(["up", "--json"], { cwd })).stdout);
			expect(up.status).toBe("deployed");

			const inspect = envelope(
				(await cli.run(["inspect", "--json"], { cwd })).stdout,
			);
			expect(inspect.code).not.toBe("HOBO_CLI_STUB");
			expect(inspect.ok).toBe(true);
			// The view rebuilt from zero agrees with what up wrote.
			expect(inspect.status).toBe("deployed");
			expect(inspect.data.found).toBe(true);
			expect(inspect.data.deploymentStatus).toBe("deployed");
			expect(Object.keys(inspect.data.resources).sort()).toEqual([
				"service",
				"sessions",
			]);
			for (const lifecycle of Object.values(inspect.data.resources)) {
				expect(lifecycle).toBe("provisioned");
			}
		});
	});

	it("reports no history for a project that has never deployed", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const inspect = envelope(
				(await cli.run(["inspect", "--json"], { cwd })).stdout,
			);
			expect(inspect.ok).toBe(true);
			expect(inspect.status).toBe("no_history");
			expect(inspect.data.found).toBe(false);
		});
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createInspectCommand().run({
			context: { cwd: "/tmp", projectDir: "/tmp" } as unknown as CliContext,
			flags: { cwd: "/tmp" } as never,
			args: [],
			verb: "inspect",
			emitProgress: () => {},
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
