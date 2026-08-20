/**
 * The suite must not write into the developer's real HoBo home.
 *
 * Much of this workspace resolves its state directory as
 * `process.env.HOBO_HOME ?? join(HOME, ".hobo")`, so a test that calls such an
 * API without an explicit `hoboHome` writes where a real session would. That
 * happened: a clean run of `packages/code` left 33 files under `~/.hobo/durable`
 * — chats, evidence, and an auth session written by a test whose only assertion
 * was that `auth --help` prints a help page.
 *
 * `test/setup/isolate-hobo-home.ts` fixes it by pointing every test file's
 * `HOBO_HOME` at a throwaway directory. This file is the guard on that fix: the
 * point of the setup is that the next test somebody writes cannot reintroduce
 * the fault, and a guarantee nothing checks is a guarantee that quietly stops
 * holding.
 *
 * It asserts the *mechanism* rather than the absence of files in the real home,
 * because the real home may legitimately contain a developer's own data — this
 * suite is not entitled to look at it, let alone assert about its contents.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HOBO_HOME isolation", () => {
	it("is set for every test file", () => {
		// Unset is the dangerous state: it is what makes the default resolve to
		// the real home.
		expect(process.env.HOBO_HOME).toBeTruthy();
	});

	it("does not point at the developer's real home", () => {
		// The specific failure this guards: `~/.hobo`.
		expect(resolve(String(process.env.HOBO_HOME))).not.toBe(
			resolve(join(homedir(), ".hobo")),
		);
	});

	it("does not point anywhere inside the developer's home directory", () => {
		// A sibling like `~/.hobo-test` would still put test state in a place a
		// developer backs up and syncs.
		expect(
			resolve(String(process.env.HOBO_HOME)).startsWith(resolve(homedir())),
		).toBe(false);
	});

	it("points at a directory that exists, so a write does not fail", () => {
		// An isolated home that is not there just moves the failure rather than
		// removing it.
		expect(existsSync(String(process.env.HOBO_HOME))).toBe(true);
	});

	it("is not the repository itself", () => {
		// State written into the working tree shows up as uncommitted changes and
		// gets committed by accident.
		expect(resolve(String(process.env.HOBO_HOME))).not.toBe(
			resolve(process.cwd()),
		);
	});
});
