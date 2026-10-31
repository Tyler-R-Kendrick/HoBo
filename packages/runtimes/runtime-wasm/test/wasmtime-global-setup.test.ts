/**
 * The wasmtime global setup must never install into, or take wasmtime from,
 * the developer's real HoBo home. It runs in vitest's main process, ahead of
 * any per-file HOME/HOBO_HOME isolation, so the default home there is the real
 * `~/.hobo`; it uses a repository-local cache instead.
 */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import setup, { testToolsHome } from "./wasmtime-global-setup.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-wasmtime-setup-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});
afterEach(() => {
	vi.unstubAllEnvs();
});

/** A stand-in wasmtime under `<home>/tools/wasmtime` that only answers `--version`. */
function fakeWasmtime(home: string): string {
	mkdirSync(join(home, "tools"), { recursive: true });
	const bin = join(home, "tools", "wasmtime");
	writeFileSync(bin, "#!/bin/sh\necho 'wasmtime 99.0.0 (fake 2026-01-01)'\n");
	chmodSync(bin, 0o755);
	return bin;
}

describe("the wasmtime global setup", () => {
	it("caches under the repository by default", () => {
		const repo = resolve(
			fileURLToPath(new URL("../../../..", import.meta.url)),
		);
		const home = testToolsHome({});
		expect(relative(repo, home)).toBe(join(".cache", "hobo-test-tools"));
	});

	it("takes wasmtime from the test tools cache, never from HOME's .hobo", async () => {
		const user = join(scratch, "user");
		const realHomeTrap = fakeWasmtime(join(user, ".hobo"));
		const tools = join(scratch, "tools");
		const cached = fakeWasmtime(tools);
		vi.stubEnv("HOME", user);
		vi.stubEnv("HOBO_HOME", "");
		vi.stubEnv("HOBO_WASMTIME_BIN", undefined);
		vi.stubEnv("HOBO_TEST_TOOLS_HOME", tools);
		await setup();
		expect(process.env.HOBO_WASMTIME_BIN).toBe(cached);
		expect(process.env.HOBO_WASMTIME_BIN).not.toBe(realHomeTrap);
		expect(existsSync(join(user, ".hobo", "tools", "wasmtime"))).toBe(true);
	});
});
