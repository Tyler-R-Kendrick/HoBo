/**
 * Shared composed-hobo surface for `@hobo/code`.
 *
 * `@hobo/hobo` is the composition root and already depends on `@hobo/code`, so
 * this package must not add a static dependency back (cycle). Instead we load
 * the same `serveProjectOnLocalYard` / `createComposedHoboCli` modules the
 * `hobo` binary wires — from the sibling workspace package — and call them
 * in-process. That is the common lib path: one implementation, two CLIs.
 *
 * Explicit `HOBO_CODE_HOBO_BIN` / `HOBO_BIN` still forces a child-process spawn
 * (test stubs). There is no PATH fallback to a bare `hobo` name.
 *
 * The composition keeps its throwaway event store in a `hobo-yard-*` directory
 * it owns, removed when the process exits. The `hobo-code` entry point also
 * asks for it to be removed on a signal (`removeComposedDirsOnSignals`), which
 * takes effect when the composition is loaded, so a hobo-code that never runs
 * a `/hobo` verb never loads it.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findRepoRoot } from "./generated-app-runtime.js";
import { isJsonString } from "./json.js";

export type ServeProjectOnLocalYard = (options: {
	readonly projectDir: string;
	readonly port?: number;
	readonly hoboHome?: string;
	readonly emitProgress?: (message: string) => void;
	readonly componentHost?: string;
}) => Promise<{
	readonly primaryUrl: string;
	readonly primaryNamedUrl?: string | null;
	readonly namedEndpoints?: readonly {
		readonly url: string;
		readonly external: boolean;
	}[];
	readonly close: () => Promise<void>;
	readonly waitUntilStopped: () => Promise<void>;
}>;

export type ComposedHoboCli = {
	readonly run: (
		argv: readonly string[],
		runOptions?: {
			readonly cwd?: string;
			readonly env?: NodeJS.ProcessEnv;
			readonly onProgress?: (message: string) => void;
		},
	) => Promise<{
		readonly exitCode: number;
		readonly stdout: string;
		readonly stderr: string;
	}>;
};

/** Whether this process's entry point asked for signal removal. */
let entryRemovesDirsOnSignals = false;

/**
 * For the `hobo-code` entry point only: once this process loads the
 * composition, the directories it owns are also removed on SIGTERM, SIGHUP,
 * SIGINT and SIGQUIT (`removeOwnedDirsOnSignals` from `@hobo/hobo`, which
 * leaves a signal the process handles itself to that handler). A library
 * caller never asks, so loading the composition installs no handler.
 */
export function removeComposedDirsOnSignals(): void {
	entryRemovesDirsOnSignals = true;
}

export function explicitHoboBinOverride(
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const override = [env.HOBO_CODE_HOBO_BIN, env.HOBO_BIN]
		.map((value) => (isJsonString(value) ? value.trim() : ""))
		.find((value) => value.length > 0);
	return override;
}

/** Workspace `packages/hobo` root, or undefined when not in this monorepo. */
export function resolveHoboPackageRoot(
	from: string = dirname(fileURLToPath(import.meta.url)),
): string | undefined {
	const repo = findRepoRoot(from);
	if (repo !== undefined) {
		const pkg = join(repo, "packages", "hobo");
		if (existsSync(join(pkg, "package.json"))) return pkg;
	}
	let dir = from;
	for (let i = 0; i < 10; i += 1) {
		const candidates = [join(dir, "hobo"), join(dir, "packages", "hobo")];
		for (const candidate of candidates) {
			if (
				existsSync(join(candidate, "package.json")) ||
				existsSync(join(candidate, "dist", "bin", "hobo.js"))
			) {
				return candidate;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/**
 * Locate the composed `hobo` *binary* for the rare spawn escape hatch.
 * Never returns the bare PATH name `hobo`.
 */
export function resolveHoboBin(
	options: { readonly env?: NodeJS.ProcessEnv; readonly from?: string } = {},
): string {
	const env = options.env ?? process.env;
	const override = explicitHoboBinOverride(env);
	if (override) return override;
	const start = options.from ?? dirname(fileURLToPath(import.meta.url));
	const pkgRoot = resolveHoboPackageRoot(start);
	if (pkgRoot !== undefined) {
		const bin = join(pkgRoot, "dist", "bin", "hobo.js");
		if (existsSync(bin)) return bin;
	}
	// Direct walk for dist/bin (tests stub a tree without package.json).
	let dir = start;
	for (let i = 0; i < 10; i += 1) {
		const candidates = [
			join(dir, "hobo", "dist", "bin", "hobo.js"),
			join(dir, "packages", "hobo", "dist", "bin", "hobo.js"),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) return candidate;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(
		"composed @hobo/hobo not found — build packages/hobo (hobo-code does not require `hobo` on PATH; set HOBO_CODE_HOBO_BIN only for an explicit override)",
	);
}

function resolveHoboDistModule(
	relativeDistFile: string,
	from?: string,
): string {
	const pkgRoot = resolveHoboPackageRoot(
		from ?? dirname(fileURLToPath(import.meta.url)),
	);
	if (pkgRoot === undefined) {
		throw new Error(
			"composed @hobo/hobo package not found beside @hobo/code — build this monorepo; hobo-code does not require `hobo` on PATH",
		);
	}
	const file = join(pkgRoot, "dist", relativeDistFile);
	if (!existsSync(file)) {
		throw new Error(
			`@hobo/hobo dist missing (${file}) — run: pnpm exec turbo run build --filter @hobo/hobo`,
		);
	}
	return file;
}

export async function loadServeProjectOnLocalYard(
	from?: string,
): Promise<ServeProjectOnLocalYard> {
	const file = resolveHoboDistModule("wasm-host.js", from);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const mod = (await import(pathToFileURL(file).href)) as {
		readonly serveProjectOnLocalYard?: ServeProjectOnLocalYard;
	};
	if (!(mod.serveProjectOnLocalYard instanceof Function)) {
		throw new Error(
			"@hobo/hobo dist/wasm-host.js has no serveProjectOnLocalYard export",
		);
	}
	return mod.serveProjectOnLocalYard;
}

export async function loadCreateComposedHoboCli(
	from?: string,
): Promise<() => ComposedHoboCli> {
	const file = resolveHoboDistModule("cli.js", from);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const mod = (await import(pathToFileURL(file).href)) as {
		readonly createComposedHoboCli?: () => ComposedHoboCli;
		readonly removeOwnedDirsOnSignals?: () => void;
	};
	if (!(mod.createComposedHoboCli instanceof Function)) {
		throw new Error(
			"@hobo/hobo dist/cli.js has no createComposedHoboCli export",
		);
	}
	// A dist built before the export has none: its store is then removed on
	// exit only, as it was, rather than failing the verb over a cleanup.
	if (
		entryRemovesDirsOnSignals &&
		mod.removeOwnedDirsOnSignals instanceof Function
	) {
		mod.removeOwnedDirsOnSignals();
	}
	return mod.createComposedHoboCli;
}

// SAFETY: parsed or fixture value is the named domain type after this assertion.
/** Run a composed `hobo` verb in-process (same wiring as the `hobo` binary). */
export async function runComposedHobo(
	argv: readonly string[],
	options: {
		readonly cwd?: string;
		readonly env?: NodeJS.ProcessEnv;
		readonly from?: string;
	} = {},
): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly progress: readonly string[];
}> {
	const create = await loadCreateComposedHoboCli(options.from);
	const progress: string[] = [];
	const previous = { ...process.env };
	if (options.env !== undefined) {
		for (const [key, value] of Object.entries(options.env)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
	try {
		const result = await create().run(argv, {
			...(options.cwd !== undefined ? { cwd: options.cwd } : undefined),
			...(options.env !== undefined ? { env: options.env } : undefined),
			onProgress: (message) => {
				progress.push(message);
			},
		});
		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			progress,
		};
	} finally {
		for (const key of Object.keys(process.env)) {
			if (!(key in previous)) delete process.env[key];
		}
		Object.assign(process.env, previous);
	}
}
