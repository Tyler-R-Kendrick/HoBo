import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	KIT_ENV,
	KitError,
	resolveKit,
	TEST_BUILD_MARKER,
} from "./real/kit.js";

let dir = "";
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "hobo-kit-test-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function codeOf(env: NodeJS.ProcessEnv): string {
	try {
		resolveKit(env);
	} catch (error) {
		if (error instanceof KitError) return error.code;
		throw error;
	}
	return "no error";
}

function fillKit(pluginBytes: string): void {
	mkdirSync(join(dir, "bridge", "node_modules", "@env-spec", "parser"), {
		recursive: true,
	});
	writeFileSync(join(dir, "opensesame"), "x");
	writeFileSync(join(dir, "opensesame-surrogate-proxy"), pluginBytes);
	writeFileSync(join(dir, "bridge", "opensesame-env-parse.mjs"), "x");
}

describe("resolveKit: the real lane fails, never skips", () => {
	it("is KIT_REQUIRED, with the way to build one, when HOBO_OPENSESAME_KIT is unset or empty", () => {
		expect(codeOf({})).toBe("KIT_REQUIRED");
		expect(codeOf({ [KIT_ENV]: "" })).toBe("KIT_REQUIRED");
		try {
			resolveKit({});
		} catch (error) {
			expect(String(error)).toContain("cargo +1.88.0 build -p opensesame-cli");
			expect(String(error)).toContain("--features upstream-override");
		}
	});

	it("is KIT_INCOMPLETE, naming what is missing, for a directory without the pieces", () => {
		expect(codeOf({ [KIT_ENV]: dir })).toBe("KIT_INCOMPLETE");
		try {
			resolveKit({ [KIT_ENV]: dir });
		} catch (error) {
			expect(String(error)).toContain("opensesame-surrogate-proxy");
			expect(String(error)).toContain("bridge/node_modules/@env-spec/parser");
		}
	});

	it("is KIT_NOT_TEST_BUILD for a plugin that cannot be aimed at a loopback server", () => {
		fillKit("a shipped build");
		expect(codeOf({ [KIT_ENV]: dir })).toBe("KIT_NOT_TEST_BUILD");
	});

	it("accepts a complete kit with the test build of the plugin", () => {
		fillKit(`bytes ${TEST_BUILD_MARKER} bytes`);
		expect(resolveKit({ [KIT_ENV]: dir })).toEqual({
			dir,
			opensesame: join(dir, "opensesame"),
			plugin: join(dir, "opensesame-surrogate-proxy"),
			bridge: join(dir, "bridge", "opensesame-env-parse.mjs"),
		});
	});
});
