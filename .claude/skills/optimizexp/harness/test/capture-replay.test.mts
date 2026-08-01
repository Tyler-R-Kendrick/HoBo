import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureCli } from "../drivers/cli.mts";

const outDir = mkdtempSync(path.join(tmpdir(), "optimizexp-capture-"));
const result = captureCli(outDir, { command: "printf 'replayable evidence\\n'", cwd: process.cwd() });
assert.equal(result.kind, "recording");
assert.match(result.primaryFile, /primary\.cast$/);
const lines = readFileSync(result.primaryFile, "utf8").trim().split(/\r?\n/);
const header = JSON.parse(lines[0]!);
const frame = JSON.parse(lines[1]!);
assert.equal(header.version, 2);
assert.equal(frame[1], "o");
assert.match(frame[2], /replayable evidence/);
