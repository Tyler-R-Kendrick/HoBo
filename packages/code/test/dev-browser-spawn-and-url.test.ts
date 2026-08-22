/**
 * Two decisions made before a dev session can start: how to run `hobo`, and
 * which URL in its output is the real one.
 *
 * **A `:0` listen URL is never a real endpoint.** `extractListenUrl` says so
 * in its own comment, and it is the sharper of the two rules. Port zero is
 * what a server prints while it is still asking the OS for a port; opening a
 * browser at it, or handing it to a user, produces a connection refused that
 * looks like the app crashed. The scan therefore keeps looking rather than
 * taking the first match.
 *
 * Three output shapes are recognised — `hobo dev`'s own line, a Yard exposure
 * line, and a bare `at http://127.0.0.1:PORT` — because the same session
 * prints different ones depending on whether it is running a Bindle, a Yard,
 * or a composed binary. Dropping any of them would hang the session waiting
 * for a URL that already went past.
 *
 * **A `.js` file is not an executable.** `resolveHoboSpawn` decides whether
 * to exec a path directly or hand it to `node`, and it has to be right on
 * both sides: exec'ing a `.js` fails with `EACCES` or "cannot execute binary
 * file", while running a real compiled binary under `node` fails on the first
 * byte. The extension answers it for JavaScript; for an extensionless path the
 * shebang does, which is why the check reads the first line rather than
 * trusting the mode bits.
 *
 * A bare name with no separator is left alone entirely — that is a PATH
 * lookup, and reading it as a file would resolve it against the wrong
 * directory.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { extractListenUrl, resolveHoboSpawn } from "../src/dev-browser.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-spawn-"));
	dirs.push(dir);
	return dir;
}

/** Write an executable file with the given first line and return its path. */
function binary(name: string, body: string): string {
	const path = join(temp(), name);
	writeFileSync(path, body);
	chmodSync(path, 0o755);
	return path;
}

const spawnFor = (hoboBin: string, argv: readonly string[] = []) =>
	resolveHoboSpawn({ hoboBin, argv });

describe("finding the listen URL in dev output", () => {
	it("takes the url off hobo dev's own line", () => {
		expect(
			extractListenUrl("hobo dev: listening on http://127.0.0.1:4321"),
		).toBe("http://127.0.0.1:4321");
	});

	it("takes the url off a Yard exposure line", () => {
		// A Yard session prints this shape instead; missing it would hang the
		// wait loop on a session that is already up.
		expect(extractListenUrl("Yard exposed web at http://127.0.0.1:5001")).toBe(
			"http://127.0.0.1:5001",
		);
	});

	it("takes a bare loopback url as a last resort", () => {
		expect(extractListenUrl("server ready at http://127.0.0.1:6002")).toBe(
			"http://127.0.0.1:6002",
		);
	});

	it("accepts https as readily as http", () => {
		expect(
			extractListenUrl("hobo dev: listening on https://127.0.0.1:8443"),
		).toBe("https://127.0.0.1:8443");
	});

	it("refuses a port-zero url", () => {
		// Port zero is what a server prints while it is still asking the OS for
		// a port. Handing it out produces a connection refused that reads as a
		// crashed app.
		expect(
			extractListenUrl("hobo dev: listening on http://127.0.0.1:0"),
		).toBeUndefined();
	});

	it("refuses a port-zero url that carries a path", () => {
		// `:0/` is the same non-endpoint with a trailing slash; matching only
		// end-of-string would let it through.
		expect(
			extractListenUrl("hobo dev: listening on http://127.0.0.1:0/dev"),
		).toBeUndefined();
	});

	it("keeps scanning past a port-zero line to a real one", () => {
		// This is the actual sequence: the placeholder is printed first, the
		// real port a moment later. Taking the first match would never start.
		expect(
			extractListenUrl(
				[
					"hobo dev: listening on http://127.0.0.1:0",
					"hobo dev: listening on http://127.0.0.1:4321",
				].join("\n"),
			),
		).toBe("http://127.0.0.1:4321");
	});

	it("prefers the hobo dev line over a bare url later in the output", () => {
		// The dev line is the authoritative announcement; a bare loopback url
		// elsewhere in the log may be a database or a sidecar.
		expect(
			extractListenUrl(
				[
					"connected at http://127.0.0.1:9999",
					"hobo dev: listening on http://127.0.0.1:4321",
				].join("\n"),
			),
		).toBe("http://127.0.0.1:4321");
	});

	it("ignores a bare url on a non-loopback host", () => {
		// The fallback pattern is deliberately loopback-only: a public host in
		// the log is somebody else's service, not this dev session.
		expect(
			extractListenUrl("proxying to http://10.0.0.5:3000"),
		).toBeUndefined();
	});

	it("ignores a bare url whose port starts with zero", () => {
		expect(extractListenUrl("at http://127.0.0.1:0123")).toBeUndefined();
	});

	it("returns nothing for output with no url at all", () => {
		expect(
			extractListenUrl("building...\ncompiled 12 modules"),
		).toBeUndefined();
	});

	it("returns nothing for empty output", () => {
		expect(extractListenUrl("")).toBeUndefined();
	});

	it("stops the url at whitespace", () => {
		expect(
			extractListenUrl("hobo dev: listening on http://127.0.0.1:4321 (ready)"),
		).toBe("http://127.0.0.1:4321");
	});

	it("stops the url at a closing paren", () => {
		// The line is often parenthesised in composed output; including the
		// paren would produce a url nothing can open.
		expect(
			extractListenUrl("(hobo dev: listening on http://127.0.0.1:4321)"),
		).toBe("http://127.0.0.1:4321");
	});

	it("finds a url on any line, not just the first", () => {
		expect(
			extractListenUrl(
				[
					"building",
					"compiled",
					"hobo dev: listening on http://127.0.0.1:4321",
				].join("\n"),
			),
		).toBe("http://127.0.0.1:4321");
	});
});

describe("deciding how to run the hobo binary", () => {
	it("runs a .js entry under node", () => {
		// Exec'ing it directly fails with EACCES or "cannot execute binary
		// file" — an error that names the file rather than the reason.
		const spawn = spawnFor("/opt/hobo/cli.js");
		expect(spawn.command).toBe(process.execPath);
	});

	it("runs a .mjs entry under node", () => {
		expect(spawnFor("/opt/hobo/cli.mjs").command).toBe(process.execPath);
	});

	it("runs a .cjs entry under node", () => {
		expect(spawnFor("/opt/hobo/cli.cjs").command).toBe(process.execPath);
	});

	it("puts the script path in the arguments when running under node", () => {
		expect(spawnFor("/opt/hobo/cli.js").args).toContain("/opt/hobo/cli.js");
	});

	it("keeps the caller's argv after the script path", () => {
		const spawn = spawnFor("/opt/hobo/cli.js", ["dev", "--port", "0"]);
		expect(spawn.args.slice(-3)).toStrictEqual(["dev", "--port", "0"]);
	});

	it("reports the binary it resolved either way", () => {
		// The caller renders this in an error message; the node executable is
		// not what the user configured and naming it would misdirect them.
		expect(spawnFor("/opt/hobo/cli.js").bin).toBe("/opt/hobo/cli.js");
	});

	it("leaves a bare command name to a PATH lookup", () => {
		// No separator means PATH. Reading it as a file would resolve it
		// against the wrong directory and then fall back for the wrong reason.
		expect(spawnFor("hobo").command).toBe("hobo");
	});

	it("passes argv straight through for a PATH lookup", () => {
		expect(spawnFor("hobo", ["dev"]).args).toStrictEqual(["dev"]);
	});

	it("runs a path with no extension and no node shebang directly", () => {
		// A real compiled binary. Handing it to node fails on the first byte.
		const bin = binary("hobo", "ELF not really, but not a script\n");
		expect(spawnFor(bin).command).toBe(bin);
	});

	it("runs a path whose shebang names node under node", () => {
		// The mode bits say executable either way; only the shebang says which
		// interpreter it needs.
		const bin = binary("hobo", "#!/usr/bin/env node\nconsole.log(1);\n");
		expect(spawnFor(bin).command).toBe(process.execPath);
	});

	it("recognises a shebang that names node by absolute path", () => {
		const bin = binary("hobo", "#!/usr/bin/node\nconsole.log(1);\n");
		expect(spawnFor(bin).command).toBe(process.execPath);
	});

	it("does not read a shell shebang as node", () => {
		// `#!/bin/sh` is a wrapper script; node would choke on the first line.
		const bin = binary("hobo", '#!/bin/sh\nexec real-hobo "$@"\n');
		expect(spawnFor(bin).command).toBe(bin);
	});

	it("does not read a word merely containing node as the interpreter", () => {
		// The check is word-bounded on purpose: `nodemon` is not `node`.
		const bin = binary("hobo", "#!/usr/bin/env nodemon\n");
		expect(spawnFor(bin).command).toBe(bin);
	});

	it("runs a path that does not exist directly rather than guessing", () => {
		// Nothing to read a shebang from. Spawning it produces ENOENT naming
		// the configured path, which is the error the user can act on;
		// prefixing node would report a node failure instead.
		expect(spawnFor("/no/such/hobo").command).toBe("/no/such/hobo");
	});

	it("still runs a missing .js path under node", () => {
		// The extension is decisive and needs no file to read, so a typo'd
		// path still fails as "node cannot find module", which points at the
		// right thing.
		expect(spawnFor("/no/such/cli.js").command).toBe(process.execPath);
	});

	it("takes an empty argv without inventing arguments", () => {
		expect(spawnFor("hobo").args).toStrictEqual([]);
	});

	it("defaults argv to empty when none is given", () => {
		expect(resolveHoboSpawn({ hoboBin: "hobo" }).args).toStrictEqual([]);
	});

	it("resolves a binary from the environment when none is passed", () => {
		// The no-hoboBin path is the normal one; it must produce something
		// runnable rather than undefined.
		const spawn = resolveHoboSpawn({ env: {}, argv: ["dev"] });
		expect(spawn.bin.length).toBeGreaterThan(0);
		expect(spawn.args).toContain("dev");
	});
});
