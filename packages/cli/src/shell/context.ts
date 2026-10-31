import { access, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
	HOBO_HOME_ENTRIES,
	HoboHomeUnavailable,
	resolveHoboHome,
} from "@hobo/core/hobo-home";

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
 * move into a listed directory, so a ceiling above the start, and everything
 * above it, are never examined. As in git, a ceiling equal to the start
 * directory does not stop the walk above it. Empty and relative entries are
 * ignored.
 */
export const CEILING_DIRECTORIES_ENV = "HOBO_CEILING_DIRECTORIES";

export interface ContextFactoryRequest {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly flags: CliFlags;
	readonly verb: string;
	readonly args: readonly string[];
	readonly requiresProject: boolean;
	/**
	 * Whose `.hobo` discovery trusts: only one this uid owns counts as a project
	 * marker, as git's `safe.directory` trusts only a repository its user owns.
	 * Defaults to `process.getuid()`; unchecked where there is none (Windows).
	 */
	readonly uid?: number;
	/** Where discovery says it ignored a `.hobo` (one line each); stderr by default. */
	readonly warn?: (message: string) => void;
}

export type ContextFactory = (
	request: ContextFactoryRequest,
) => Promise<CliContext>;

export async function defaultContextFactory(
	request: ContextFactoryRequest,
): Promise<CliContext> {
	const projectDir = await findProjectDir(request.cwd, {
		env: request.env,
		typescriptAuthoring: ["codegen", "stub", "build"].includes(request.verb),
		uid: request.uid ?? process.getuid?.(),
		warn:
			request.warn ??
			((message: string) => process.stderr.write(`${message}\n`)),
	});
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

interface DiscoveryOptions {
	readonly env: NodeJS.ProcessEnv;
	readonly typescriptAuthoring: boolean;
	readonly uid: number | undefined;
	readonly warn: (message: string) => void;
}

async function findProjectDir(
	startDir: string,
	options: DiscoveryOptions,
): Promise<string | null> {
	const { env, typescriptAuthoring } = options;
	const ceilings = await ceilingDirectories(env);
	const userHomes = await userHoboHomes(env);
	let current = path.resolve(startDir);
	while (true) {
		for (const marker of markers) {
			const candidate = path.join(current, marker);
			if (!(await exists(candidate))) continue;
			if (
				marker === ".hobo" &&
				!(await isProjectState(candidate, userHomes, options))
			)
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
 * HoBo home. Not when it is the user's own home; not when another uid owns it
 * or it cannot be read (anyone can make `/tmp/.hobo` and plant a
 * `session.json` in it, so, as git's `safe.directory` does, only this uid's own
 * is trusted; the skip is reported in one line); not when everything in it
 * (dotfiles aside) is user-level state (`HOBO_HOME_ENTRIES`). An empty `.hobo`,
 * or a file named `.hobo` this uid owns, still marks a project.
 */
async function isProjectState(
	dir: string,
	userHomes: ReadonlySet<string>,
	options: DiscoveryOptions,
): Promise<boolean> {
	if (userHomes.has(await canonical(dir))) return false;
	let owner: number;
	try {
		owner = (await stat(dir)).uid;
	} catch {
		return false; // gone since the walk saw it
	}
	if (options.uid !== undefined && owner !== options.uid) {
		options.warn(
			`hobo: ignoring ${dir} as a project marker: owned by uid ${owner}, not ${options.uid}`,
		);
		return false;
	}
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch (error) {
		const code =
			error instanceof Error && "code" in error ? String(error.code) : "";
		if (code === "ENOTDIR") return true;
		options.warn(
			`hobo: ignoring ${dir} as a project marker: cannot read it (${code || String(error)}); owned by uid ${owner}`,
		);
		return false;
	}
	// Dotfiles (`.DS_Store`, an editor's swap file) say nothing about whose it is.
	const named = entries.filter((entry) => !entry.startsWith("."));
	return !(
		named.length > 0 && named.every((entry) => HOBO_HOME_ENTRIES.has(entry))
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
