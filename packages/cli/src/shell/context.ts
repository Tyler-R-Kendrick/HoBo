import { access, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { HoboHomeUnavailable, resolveHoboHome } from "@hobo/core/hobo-home";

import type { CliContext } from "../types/envelope.js";
import { NoBindleError } from "./errors.js";
import type { CliFlags } from "./parse.js";

const markers = [
	"hobo.bindle.json",
	"bindle.ts",
	"bindle.js",
	// The flagship authoring flow keeps the bindle in src/ (see cloud/loader.ts
	// BINDLE_SOURCE_CANDIDATES); a built artifact marks a project too.
	"src/bindle.ts",
	"src/bindle.mts",
	"src/bindle.js",
	"src/bindle.mjs",
	"dist/bindle.js",
	// try-site catalog apps (examples/try-site/apps/<id>/app.ts) are Bindle
	// projects too — the loader falls back cleanly if app.ts is not a bindle.
	"app.ts",
	"app.mts",
	"app.js",
	"app.mjs",
	// Project state (`.hobo/session.json`, `generated/`, `build/`, `sources/`),
	// but only when it is a project's: see `isProjectState`.
	".hobo",
] as const;

/**
 * Directories project discovery never walks up into, in the style of
 * `GIT_CEILING_DIRECTORIES`: absolute paths separated by `path.delimiter`.
 * The start directory is always examined; the walk stops before it would
 * move into a listed directory, so that directory and everything above it are
 * never examined. Empty and relative entries are ignored.
 */
export const CEILING_DIRECTORIES_ENV = "HOBO_CEILING_DIRECTORIES";

/**
 * The top-level entries of a user-level HoBo home (`resolveHoboHome`): state
 * under `durable/` and `runtime/`, station journals, keys, downloaded tools,
 * sandboxes, worktrees, worlds, yards, OCI layouts and the profile. A project's
 * `.hobo/` holds none of them, so a `.hobo` holding only these is a HoBo home
 * that happens to sit there (a stray `/tmp/.hobo`, or `~/.hobo` while
 * `HOBO_HOME` points elsewhere), not a project.
 */
const USER_LEVEL_STATE: ReadonlySet<string> = new Set([
	"durable",
	"runtime",
	"stations",
	"keys",
	"tools",
	"sandboxes",
	"worktrees",
	"worlds",
	"yards",
	"oci",
	"profile.json",
]);

export interface ContextFactoryRequest {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly flags: CliFlags;
	readonly verb: string;
	readonly args: readonly string[];
	readonly requiresProject: boolean;
}

export type ContextFactory = (
	request: ContextFactoryRequest,
) => Promise<CliContext>;

export async function defaultContextFactory(
	request: ContextFactoryRequest,
): Promise<CliContext> {
	const projectDir = await findProjectDir(
		request.cwd,
		request.env,
		["codegen", "stub", "build"].includes(request.verb),
	);
	if (request.requiresProject && !projectDir) {
		throw new NoBindleError(request.cwd, {
			monorepo: await looksLikeHoboMonorepo(request.cwd),
		});
	}

	return {
		cwd: request.cwd,
		projectDir,
		identity: null,
		clients: {
			readApi: "stub",
			runtime: "stub",
		},
	};
}

async function findProjectDir(
	startDir: string,
	env: NodeJS.ProcessEnv,
	typescriptAuthoring = false,
): Promise<string | null> {
	const ceilings = await ceilingDirectories(env);
	const userHomes = await userHoboHomes(env);
	let current = path.resolve(startDir);
	while (true) {
		for (const marker of markers) {
			const candidate = path.join(current, marker);
			if (!(await exists(candidate))) continue;
			if (marker === ".hobo" && !(await isProjectState(candidate, userHomes)))
				continue;
			return current;
		}
		if (
			typescriptAuthoring &&
			(await exists(path.join(current, "tsconfig.json")))
		)
			return current;

		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		if (ceilings.has(parent) || ceilings.has(await canonical(parent))) {
			return null;
		}
		current = parent;
	}
}

/** `HOBO_CEILING_DIRECTORIES`, each entry as given and as its real path. */
async function ceilingDirectories(
	env: NodeJS.ProcessEnv,
): Promise<ReadonlySet<string>> {
	const ceilings = new Set<string>();
	for (const entry of (env[CEILING_DIRECTORIES_ENV] ?? "").split(
		path.delimiter,
	)) {
		if (entry.length === 0 || !path.isAbsolute(entry)) continue;
		ceilings.add(path.resolve(entry));
		ceilings.add(await canonical(entry));
	}
	return ceilings;
}

/**
 * The user's own HoBo home: the one this environment resolves to, and the
 * default `$HOME/.hobo` even while `HOBO_HOME` points elsewhere. Neither is a
 * project, however much it holds.
 */
async function userHoboHomes(
	env: NodeJS.ProcessEnv,
): Promise<ReadonlySet<string>> {
	const homes = new Set<string>();
	for (const home of [
		() => resolveHoboHome(env),
		() => resolveHoboHome({ HOME: env.HOME }),
	]) {
		try {
			homes.add(await canonical(home()));
		} catch (error) {
			// No HOME and no account home (a uid with no passwd entry): there is
			// no user home to exclude, so discovery runs as it did before it
			// excluded one, rather than failing a verb that never needed a home.
			if (!(error instanceof HoboHomeUnavailable)) throw error;
		}
	}
	return homes;
}

/**
 * Whether the `.hobo` at `dir` is a project's state rather than a user-level
 * HoBo home. Not when it is the user's own home; not when everything in it is
 * user-level state. An empty `.hobo`, or one that is not a directory, still
 * marks a project, as it always has.
 */
async function isProjectState(
	dir: string,
	userHomes: ReadonlySet<string>,
): Promise<boolean> {
	if (userHomes.has(await canonical(dir))) return false;
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return true;
	}
	return !(
		entries.length > 0 && entries.every((entry) => USER_LEVEL_STATE.has(entry))
	);
}

async function canonical(dir: string): Promise<string> {
	try {
		return await realpath(dir);
	} catch {
		return path.resolve(dir);
	}
}

async function looksLikeHoboMonorepo(startDir: string): Promise<boolean> {
	const root = path.resolve(startDir);
	return (
		(await exists(path.join(root, "pnpm-workspace.yaml"))) &&
		(await exists(path.join(root, "examples", "hello-bindle")))
	);
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}
