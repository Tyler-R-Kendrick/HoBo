import { access } from "node:fs/promises";
import path from "node:path";

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
	".hobo",
] as const;

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
	const projectDir = await findProjectDir(request.cwd);
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

async function findProjectDir(startDir: string): Promise<string | null> {
	let current = path.resolve(startDir);
	while (true) {
		for (const marker of markers) {
			if (await exists(path.join(current, marker))) {
				return current;
			}
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
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
