/**
 * The cue lookup of the CUE suite (ADR-0172, test/helpers/cue-binary.ts):
 * which binary record-cue.test.ts vets with, and which it refuses. Fake cue
 * binaries (POSIX shell scripts) stand in, so this needs no cue.
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

import { afterAll, describe, expect, it } from "vitest";
import { CUE_VERSION, cueBinary } from "./helpers/cue-binary.js";

const POSIX = process.platform !== "win32";

const scratch = mkdtempSync(join(tmpdir(), "hobo-cue-binary-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** A cue at `dir`/cue whose `cue version` starts with `firstLine`; like a real one, it names the language version last. */
function fakeCue(dir: string, firstLine: string): string {
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "cue");
	writeFileSync(
		path,
		`#!/bin/sh\nprintf '%s\\n\\ngo version go1.24.5\\ncue.lang.version ${CUE_VERSION}\\n' '${firstLine}'\n`,
	);
	chmodSync(path, 0o755);
	return path;
}

/** A repo root with no .tools cache. */
const bareRoot = join(scratch, "bare");

describe.runIf(POSIX)("cueBinary", () => {
	it("takes a cue whose first line is `cue version v0.14.0`", () => {
		const cue = fakeCue(join(scratch, "v"), `cue version ${CUE_VERSION}`);
		expect(cueBinary({ HOBO_CUE_BIN: cue }, bareRoot)).toBe(cue);
	});

	it("takes `cue version 0.14.0`, without the v, as schema-tools does", () => {
		const cue = fakeCue(join(scratch, "no-v"), "cue version 0.14.0");
		expect(cueBinary({ HOBO_CUE_BIN: cue }, bareRoot)).toBe(cue);
	});

	it("refuses another patch version, naming both", () => {
		const cue = fakeCue(join(scratch, "patch"), "cue version v0.14.3");
		expect(() => cueBinary({ HOBO_CUE_BIN: cue }, bareRoot)).toThrow(
			/is cue v0\.14\.3, not cue v0\.14\.0/u,
		);
	});

	it("treats an empty HOBO_CUE_BIN as unset, and falls back to the cache", () => {
		const root = join(scratch, "repo");
		const cached = fakeCue(
			join(root, ".tools", "cue", CUE_VERSION),
			`cue version ${CUE_VERSION}`,
		);
		expect(cueBinary({ HOBO_CUE_BIN: "" }, root)).toBe(cached);
	});

	it("refuses an HOBO_CUE_BIN that does not exist", () => {
		expect(() =>
			cueBinary({ HOBO_CUE_BIN: join(scratch, "no-such-cue") }, bareRoot),
		).toThrow(/which does not exist/u);
	});
});
