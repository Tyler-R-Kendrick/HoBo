import { access } from "node:fs/promises";
import path from "node:path";

import type { CliContext } from "../types/envelope.js";
import { NoBindleError } from "./errors.js";
import type { CliFlags } from "./parse.js";

const markers = [
	"hobo.bindle.json",
	"bindle.ts",
	"bindle.js",
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
		throw new NoBindleError(request.cwd);
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

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}
