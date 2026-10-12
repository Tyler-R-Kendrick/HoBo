#!/usr/bin/env node
/**
 * Obtain, check and move the pins in tools/pins/siblings.json.
 *
 *   node --experimental-strip-types scripts/bootstrap-siblings.mts [options]
 *
 *   (no verb)                     initialise every git pin (the submodule at its gitlink)
 *   --status [--offline|--online] report every pin; exit 1 when one has drifted
 *   --fetch [name...]             initialise git pins
 *   --bump <name> <ref>           move one pin and stage the change
 *
 *   --reference <dir>             borrow objects from a local clone (no download for what it has)
 *   --root <dir>                  the repository to act on (default: the one holding this script)
 *
 * Runs before `pnpm install`: erasable TypeScript, node builtins only, and
 * `git` on PATH. Exit 0 ok, 1 a check or an operation failed, 2 wrong usage.
 *
 * HOBO_PINS_ALLOW_LOCAL=1 additionally accepts loopback http URLs and local
 * repository paths in the manifest. The tests set it; nothing else should.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { git } from "./lib/pins-git.ts";
import {
	PINS_FILE,
	type Request,
	runBump,
	runFetch,
	runInit,
	runStatus,
} from "./lib/pins-verbs.ts";
import { type Pins, PinsError, parsePins } from "./lib/pins.ts";

const USAGE = `usage: bootstrap-siblings.mts [--root DIR] [--reference DIR]
         [--status [--offline|--online] | --fetch [name...] | --bump NAME REF]`;

const OPTIONS = {
	root: { type: "string" },
	reference: { type: "string" },
	status: { type: "boolean" },
	offline: { type: "boolean" },
	online: { type: "boolean" },
	fetch: { type: "boolean" },
	bump: { type: "boolean" },
} as const;

function usage(message: string): never {
	throw new PinsError("USAGE", `${message}\n${USAGE}`);
}

function readArgs(args: readonly string[]) {
	try {
		return parseArgs({
			args: [...args],
			allowPositionals: true,
			options: OPTIONS,
		});
	} catch (error) {
		return usage(error instanceof Error ? error.message : String(error));
	}
}

function parseRequest(args: readonly string[]): Request {
	const { values, positionals } = readArgs(args);
	const verbs = (["status", "fetch", "bump"] as const).filter(
		(verb) => values[verb] === true,
	);
	if (verbs.length > 1)
		usage(
			`${verbs.map((verb) => `--${verb}`).join(" and ")} cannot be combined`,
		);
	const verb = verbs[0] ?? "init";
	if (values.offline === true && values.online === true)
		usage("--offline and --online cannot be combined");
	if ((values.offline === true || values.online === true) && verb !== "status")
		usage("--offline and --online belong to --status");
	if (verb === "bump" && positionals.length !== 2)
		usage("--bump takes a pin name and a ref");
	if (verb !== "bump" && verb !== "fetch" && positionals.length > 0)
		usage(`unexpected argument ${positionals[0]}`);
	const reference =
		values.reference === undefined ? undefined : resolve(values.reference);
	if (
		reference !== undefined &&
		(!existsSync(reference) ||
			git(reference, ["rev-parse", "--git-dir"]).status !== 0)
	) {
		usage(`--reference ${reference} is not a git repository`);
	}
	const here = fileURLToPath(new URL("..", import.meta.url));
	return {
		verb,
		root: resolve(values.root ?? here),
		reference,
		online: values.online === true,
		names: positionals,
		allowLocal: process.env.HOBO_PINS_ALLOW_LOCAL === "1",
	};
}

function loadPins(request: Request): Pins {
	const file = join(request.root, PINS_FILE);
	if (!existsSync(file)) {
		throw new PinsError(
			"PINS_MALFORMED",
			`${PINS_FILE} not found under ${request.root}`,
		);
	}
	return parsePins(readFileSync(file, "utf8"), {
		allowLocal: request.allowLocal,
	});
}

function main(args: readonly string[]): number {
	const request = parseRequest(args);
	const pins = loadPins(request);
	switch (request.verb) {
		case "status":
			return runStatus(request, pins);
		case "bump":
			return runBump(request, pins);
		case "fetch":
			return runFetch(request, pins);
		default:
			return runInit(request, pins);
	}
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch (error) {
	if (error instanceof PinsError) {
		console.error(`ERR ${error.message}`);
		process.exitCode = error.code === "USAGE" ? 2 : 1;
	} else {
		throw error;
	}
}
