/**
 * The Cactus Needle tool-planner bridge — paths, install probe, line parsing,
 * and the planner's refusal to become a dependency.
 *
 * Needle is an optional local model that plans tool calls. It runs as a Python
 * subprocess speaking newline-delimited JSON, which makes every failure mode
 * here a failure of an *optional* feature — and the design follows from that:
 *
 * **Nothing in this module ever throws at the caller.** A malformed bridge
 * line returns `null`, a missing install returns a reason instead of a
 * planner, and a bridge that never becomes ready is killed and reported. Tool
 * calling turns off; the shell keeps running. An exception escaping here would
 * take down a session over a feature the user may not know they enabled.
 *
 * **The install probe is deliberately cheap.** Checking two paths costs
 * nothing; spawning a Python process that may not exist costs a process
 * launch and a timeout on every session start.
 *
 * **A line that does not parse is skipped, not treated as an empty result.**
 * The bridge writes diagnostics on the same stream, and reading one as "the
 * model planned no calls" would silently disable tool calling for that turn
 * rather than for the session.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	createNeedlePlanner,
	needleInstalled,
	needlePaths,
	parseBridgeLine,
} from "../src/needle-tools.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-needle-"));
	dirs.push(dir);
	return dir;
}

describe("needlePaths", () => {
	it("defaults the checkout under the home directory", () => {
		const paths = needlePaths({ HOME: "/home/ada" }, "/pkg");
		expect(paths.dir).toBe("/home/ada/.cactus/needle");
		expect(paths.python).toBe("/home/ada/.cactus/needle/.venv/bin/python");
	});

	it("falls back to /root when the environment has no HOME", () => {
		// Containers routinely run with no HOME set. Joining `undefined` would
		// produce a path containing the literal string.
		expect(needlePaths({}, "/pkg").dir).toBe("/root/.cactus/needle");
	});

	it("takes an explicit checkout directory, and derives python from it", () => {
		// A user who cloned Needle elsewhere should not also have to point at
		// the interpreter inside it.
		const paths = needlePaths(
			{ HOBO_CODE_NEEDLE_DIR: "/opt/needle", HOME: "/home/ada" },
			"/pkg",
		);
		expect(paths.dir).toBe("/opt/needle");
		expect(paths.python).toBe("/opt/needle/.venv/bin/python");
	});

	it("takes an explicit interpreter independently of the checkout", () => {
		// A system Python with the deps installed is a supported setup; tying
		// the interpreter to the checkout would rule it out.
		const paths = needlePaths(
			{
				HOBO_CODE_NEEDLE_DIR: "/opt/needle",
				HOBO_CODE_NEEDLE_PYTHON: "/usr/bin/python3",
			},
			"/pkg",
		);
		expect(paths.python).toBe("/usr/bin/python3");
		expect(paths.dir).toBe("/opt/needle");
	});

	it("locates the bridge script inside this package, not the checkout", () => {
		// The bridge ships with HoBo and must match this build. Reading one from
		// the user's Needle checkout would pair a new protocol with an old script.
		expect(needlePaths({}, "/pkg").bridge).toBe(
			"/pkg/bridges/needle_bridge.py",
		);
	});
});

describe("needleInstalled", () => {
	it("requires both the interpreter and the bridge to exist", () => {
		// Either one missing means the spawn would fail. Checking both is what
		// makes the probe worth doing instead of just trying.
		const dir = tmp();
		const python = join(dir, "python");
		const bridge = join(dir, "bridge.py");
		const paths = { dir, python, bridge };
		expect(needleInstalled(paths)).toBe(false);

		writeFileSync(python, "");
		expect(needleInstalled(paths)).toBe(false);

		writeFileSync(bridge, "");
		expect(needleInstalled(paths)).toBe(true);
	});
});

describe("parseBridgeLine", () => {
	it("ignores a blank line", () => {
		// The bridge flushes newlines on its own schedule. Treating a blank line
		// as a result would resolve a waiter with no calls.
		for (const line of ["", "   ", "\t\n"]) {
			expect(parseBridgeLine(line)).toBeNull();
		}
	});

	it("ignores a line that is not JSON", () => {
		// Python warnings and tracebacks share this stream. Reading one as an
		// empty plan would silently disable tool calling for that turn.
		for (const line of [
			"Traceback (most recent call last):",
			"{",
			"not json",
		]) {
			expect(parseBridgeLine(line)).toBeNull();
		}
	});

	it("recognises the ready signal", () => {
		// Readiness gates the whole planner. Confusing it with a plan would let
		// the first query race weight loading.
		expect(parseBridgeLine('{"ready":true}')).toEqual({ ready: true });
	});

	it("reads an explicit failure, defaulting the message", () => {
		// `ok:false` with no message still has to say something — an empty
		// reason in a log is indistinguishable from no failure at all.
		expect(parseBridgeLine('{"ok":false,"error":"oom"}')).toEqual({
			error: "oom",
		});
		expect(parseBridgeLine('{"ok":false}')).toEqual({ error: "unknown error" });
	});

	it("prefers the ready flag over a failure on the same line", () => {
		// Ready is checked first, so a line carrying both is treated as ready.
		// Pinned because the order is load-bearing: the ready waiter is resolved
		// once, and a line that claimed both would otherwise hang the startup.
		expect(parseBridgeLine('{"ready":true,"ok":false}')).toEqual({
			ready: true,
		});
	});

	it("extracts planned calls, defaulting missing arguments", () => {
		// A tool invoked with no arguments is normal. `undefined` there would
		// reach the tool as a missing parameter object rather than an empty one.
		expect(
			parseBridgeLine(
				'{"calls":[{"name":"read","arguments":{"path":"a"}},{"name":"ls"}]}',
			),
		).toEqual({
			calls: [
				{ name: "read", arguments: { path: "a" } },
				{ name: "ls", arguments: {} },
			],
		});
	});

	it("drops call entries with no usable name", () => {
		// A nameless call cannot be dispatched. Passing it through would fail
		// deeper in, with an error about the dispatcher rather than the model.
		expect(
			parseBridgeLine(
				'{"calls":[{"name":"read"},{"arguments":{}},null,7,{"name":9}]}',
			),
		).toEqual({ calls: [{ name: "read", arguments: {} }] });
	});

	it("treats a non-array calls field as no calls", () => {
		// The model is a local model; malformed output is expected occasionally.
		// An empty plan is the safe reading — the turn proceeds without tools.
		for (const body of ['{"calls":"read"}', '{"calls":null}', "{}"]) {
			expect(parseBridgeLine(body)).toEqual({ calls: [] });
		}
	});

	it("tolerates whitespace around the JSON", () => {
		expect(parseBridgeLine('  {"ready":true}  ')).toEqual({ ready: true });
	});
});

describe("createNeedlePlanner", () => {
	it("declines with a reason naming the checkout when Needle is not installed", async () => {
		// The reason is shown to the user once at startup. Without the path they
		// cannot tell whether HoBo looked where they installed it.
		const dir = tmp();
		const result = await createNeedlePlanner({
			paths: { dir, python: join(dir, "python"), bridge: join(dir, "b.py") },
		});
		expect(result.planner).toBeNull();
		expect(result.reason).toContain(dir);
		expect(result.reason).toContain("tool calling is off");
	});

	it("kills a bridge that never signals ready, and says so", async () => {
		// A bridge that starts but never loads weights would otherwise hold a
		// process for the life of the session and block every plan on a timeout.
		const dir = tmp();
		const python = join(dir, "python");
		const bridge = join(dir, "bridge.py");
		// A stand-in that starts, produces nothing, and waits.
		writeFileSync(
			python,
			"#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n",
			{ mode: 0o755 },
		);
		writeFileSync(bridge, "");
		const result = await createNeedlePlanner({
			paths: { dir, python, bridge },
			readyTimeoutMs: 50,
		});
		expect(result.planner).toBeNull();
		expect(result.reason).toContain("did not become ready");
	});

	it("declines rather than throwing when the interpreter cannot start", async () => {
		// An unusable interpreter is a configuration problem, not a crash. The
		// shell has to keep running with tool calling off.
		const dir = tmp();
		const python = join(dir, "python");
		const bridge = join(dir, "bridge.py");
		writeFileSync(python, "not an executable\n", { mode: 0o644 });
		writeFileSync(bridge, "");
		const result = await createNeedlePlanner({
			paths: { dir, python, bridge },
			readyTimeoutMs: 50,
		});
		expect(result.planner).toBeNull();
		expect(result.reason).toBeTruthy();
	});
});
