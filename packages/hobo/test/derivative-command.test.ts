import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createComposedHoboCli,
	createDefaultYardRuntime,
	createDerivativeCommand,
} from "../src/index.js";

// `hobo derivative <read|upgrade>` manages a derived HoBo fork via its
// derivative.json descriptor (ADR-0057): read reports it; upgrade records the
// upgrade ceremony (started -> upcasters -> succeeded) on the durable log.

const DESCRIPTOR = {
	name: "acme-hobo",
	version: "1.0.0",
	upgradeTo: "1.1.0",
	upcasters: ["v1_0_to_v1_1"],
};

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

async function withProject(
	descriptor: unknown | null,
	callback: (cwd: string) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-derivative-"));
	if (descriptor !== null) {
		await writeFile(
			path.join(dir, "derivative.json"),
			`${JSON.stringify(descriptor, null, 2)}\n`,
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

describe("createDerivativeCommand", () => {
	it("reads the derivative descriptor", async () => {
		await withProject(DESCRIPTOR, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const read = envelope(
				(await cli.run(["derivative", "read", "--json"], { cwd })).stdout,
			);
			expect(read.code).not.toBe("HOBO_CLI_STUB");
			expect(read.ok).toBe(true);
			expect(read.data.descriptor.name).toBe("acme-hobo");
			expect(read.data.descriptor.upcasters).toEqual(["v1_0_to_v1_1"]);
		});
	});

	it("defaults to `read` when no subcommand is given", async () => {
		await withProject(DESCRIPTOR, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const out = envelope(
				(await cli.run(["derivative", "--json"], { cwd })).stdout,
			);
			expect(out.ok).toBe(true);
			expect(out.data.subcommand).toBe("read");
		});
	});

	it("runs the upgrade ceremony to the descriptor's target", async () => {
		await withProject(DESCRIPTOR, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const up = envelope(
				(await cli.run(["derivative", "upgrade", "--json"], { cwd })).stdout,
			);
			expect(up.ok).toBe(true);
			expect(up.status).toBe("upgraded");
			expect(up.data.fromVersion).toBe("1.0.0");
			expect(up.data.toVersion).toBe("1.1.0");
			expect(up.data.upcastersRun).toEqual(["v1_0_to_v1_1"]);
		});
	});

	it("fails the upgrade when there is no target", async () => {
		await withProject(
			{ name: "no-target", version: "2.0.0", upcasters: [] },
			async (cwd) => {
				const runtime = createDefaultYardRuntime();
				openStores.push(runtime.store as RuntimeLocalEventStore);
				const cli = createComposedHoboCli({ yardRuntime: runtime });

				const up = envelope(
					(await cli.run(["derivative", "upgrade", "--json"], { cwd })).stdout,
				);
				expect(up.ok).toBe(false);
				expect(up.code).toBe("HOBO_DERIVATIVE_UPGRADE_FAILED");
			},
		);
	});

	it("errors when there is no descriptor", async () => {
		await withProject(null, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const out = envelope(
				(await cli.run(["derivative", "read", "--json"], { cwd })).stdout,
			);
			expect(out.ok).toBe(false);
			expect(out.code).toBe("HOBO_DERIVATIVE_NO_DESCRIPTOR");
		});
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createDerivativeCommand().run({
			context: { cwd: "/tmp", projectDir: "/tmp" } as unknown as CliContext,
			flags: { cwd: "/tmp" } as never,
			args: ["read"],
			verb: "derivative",
			emitProgress: () => {},
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
