import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";
import {
	createComposedHoboCli,
	createDefaultYardRuntime,
	createRunbookCommand,
} from "../src/index.js";
import type { JsonValue } from "../src/json.js";

// `hobo runbook <file>` executes an ordered sequence of HoBo diagnostic steps
// against the live deployment (the shared runtime), then reports per-step
// outcomes. Read-only steps make it replayable.

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
	runbook: JsonValue,
	callback: (cwd: string) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-runbook-"));
	await writeFile(
		path.join(dir, "hobo.bindle.json"),
		`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
	);
	await writeFile(
		path.join(dir, "runbook.json"),
		`${JSON.stringify(runbook, null, 2)}\n`,
	);
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

describe("createRunbookCommand", () => {
	it("runs an ordered diagnostic runbook against the live deployment", async () => {
		const runbook = {
			name: "post-deploy-check",
			steps: [{ verb: "inspect" }, { verb: "verify" }, { verb: "doctor" }],
		};
		await withProject(runbook, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			await cli.run(["up", "--json"], { cwd });
			const result = envelope(
				(await cli.run(["runbook", "runbook.json", "--json"], { cwd })).stdout,
			);

			expect(result.code).not.toBe("HOBO_CLI_STUB");
			expect(result.ok).toBe(true);
			expect(result.status).toBe("completed");
			expect(result.data.name).toBe("post-deploy-check");
			expect(result.data.steps.map((s: { verb: string }) => s.verb)).toEqual([
				"inspect",
				"verify",
				"doctor",
			]);
			// inspect reflects the real deployment run just before.
			const inspect = result.data.steps.find(
				(s: { verb: string }) => s.verb === "inspect",
			);
			expect(inspect.status).toBe("deployed");
		});
	});

	it("is replayable: running the same read-only runbook twice is stable", async () => {
		const runbook = {
			name: "rb",
			steps: [{ verb: "doctor" }, { verb: "verify" }],
		};
		await withProject(runbook, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			const a = envelope(
				(await cli.run(["runbook", "runbook.json", "--json"], { cwd })).stdout,
			);
			const b = envelope(
				(await cli.run(["runbook", "runbook.json", "--json"], { cwd })).stdout,
			);
			expect(a.status).toBe("completed");
			expect(b.status).toBe("completed");
			expect(a.data.steps).toEqual(b.data.steps);
		});
	});

	it("reports a failed runbook when a step fails", async () => {
		// `claim` with no account fails — the runbook surfaces it.
		const runbook = {
			name: "bad",
			steps: [{ verb: "doctor" }, { verb: "claim" }],
		};
		await withProject(runbook, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = envelope(
				(await cli.run(["runbook", "runbook.json", "--json"], { cwd })).stdout,
			);
			expect(result.ok).toBe(false);
			expect(result.status).toBe("failed");
			expect(
				result.remediation?.some((r: string) => r.startsWith("claim")),
			).toBe(true);
		});
	});

	it("rejects a nested `runbook` step (no recursion)", async () => {
		const runbook = {
			name: "nested",
			steps: [{ verb: "runbook", args: ["x"] }],
		};
		await withProject(runbook, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = envelope(
				(await cli.run(["runbook", "runbook.json", "--json"], { cwd })).stdout,
			);
			expect(result.ok).toBe(false);
			expect(result.data.steps[0].status).toBe("nesting_rejected");
		});
	});

	it("errors cleanly on a missing file and no file argument", async () => {
		await withProject({ name: "x", steps: [] }, async (cwd) => {
			const runtime = createDefaultYardRuntime();
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const missing = envelope(
				(await cli.run(["runbook", "nope.json", "--json"], { cwd })).stdout,
			);
			expect(missing.code).toBe("HOBO_RUNBOOK_INVALID");

			const noFile = envelope(
				(await cli.run(["runbook", "--json"], { cwd })).stdout,
			);
			expect(noFile.code).toBe("HOBO_RUNBOOK_NO_FILE");
		});
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createRunbookCommand().run({
			// SAFETY: assertion required at this I/O or test boundary.
			context: { cwd: "/tmp", projectDir: "/tmp" } as CliContext,
			// SAFETY: assertion required at this I/O or test boundary.
			flags: { cwd: "/tmp" } as never,
			args: ["runbook.json"],
			verb: "runbook",
			emitProgress: () => {},
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
