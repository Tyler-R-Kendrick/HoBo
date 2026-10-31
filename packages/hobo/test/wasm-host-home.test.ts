/**
 * Where `hobo yard` looks for an installed wasmtime.
 *
 * `ensureWasmtimeBinary` installs it into `$HOBO_HOME/tools/wasmtime`, so the
 * probe must look there too. It used to look in `$HOME/.hobo/tools/wasmtime`
 * whatever HOBO_HOME said, so a user with HOBO_HOME set was told wasmtime was
 * missing right after `hobo yard ensure` had installed it.
 */
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { probeWasmHostInstall } from "../src/wasm-host.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-wasm-host-home-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});
afterEach(() => {
	vi.unstubAllEnvs();
});

/** A stand-in wasmtime that only answers `--version`. */
function fakeWasmtime(dir: string): string {
	mkdirSync(dir, { recursive: true });
	const bin = join(dir, "wasmtime");
	writeFileSync(bin, "#!/bin/sh\necho 'wasmtime 99.0.0 (fake 2026-01-01)'\n");
	chmodSync(bin, 0o755);
	return bin;
}

describe("probeWasmHostInstall", () => {
	it("finds the wasmtime installed under HOBO_HOME/tools", () => {
		const hoboHome = join(scratch, "elsewhere");
		const bin = fakeWasmtime(join(hoboHome, "tools"));
		const probe = probeWasmHostInstall({
			env: { HOBO_HOME: hoboHome, HOME: join(scratch, "user"), PATH: "" },
		});
		expect(probe.wasmtimeCliAvailable).toBe(true);
		expect(probe.notes[0]).toContain(`at ${bin}`);
	});

	it("names HOBO_HOME/tools as where it will download, when it finds none", () => {
		const hoboHome = join(scratch, "empty");
		// The last candidate is a bare `wasmtime` looked up on this process's PATH.
		vi.stubEnv("PATH", "");
		const probe = probeWasmHostInstall({
			env: { HOBO_HOME: hoboHome, HOME: join(scratch, "user"), PATH: "" },
		});
		expect(probe.wasmtimeCliAvailable).toBe(false);
		expect(probe.notes.join("\n")).toContain(`into ${join(hoboHome, "tools")}`);
	});
});
