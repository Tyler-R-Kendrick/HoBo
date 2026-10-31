/**
 * Prints, as one JSON line, what each vitest config named on the command line
 * sets for the fields test/vitest-mirror-exclusion.test.ts reads.
 *
 * Run under `node --import tsx` in a process of its own: tsx loads a config
 * the way the repository's scripts load TypeScript, whatever that config's
 * own directory has installed (site/'s tsconfig extends a package only site
 * installs, which a Vite transform inside the test process would need).
 */
import { pathToFileURL } from "node:url";

/** The fields read, as plain JSON. */
interface ConfigFields {
	readonly config: string;
	readonly root?: string;
	readonly test: {
		readonly include?: readonly string[] | undefined;
		readonly exclude?: readonly string[] | undefined;
		readonly dir?: string | undefined;
		readonly root?: string | undefined;
		readonly projectsDeclared: boolean;
		readonly setupFiles?: readonly string[] | string | undefined;
		readonly globalSetup?: readonly string[] | string | undefined;
		readonly pool?: string | undefined;
		readonly isolate?: boolean | undefined;
		readonly testTimeout?: number | undefined;
		readonly hookTimeout?: number | undefined;
	};
}

/** A vitest UserConfig, as far as this reads it. */
interface UserConfig {
	readonly root?: string;
	readonly test?: Omit<ConfigFields["test"], "projectsDeclared"> & {
		readonly projects?: readonly string[];
	};
}

async function read(config: string): Promise<ConfigFields> {
	const module: { readonly default: UserConfig | (() => UserConfig) } =
		await import(pathToFileURL(config).href);
	const user =
		module.default instanceof Function
			? await module.default()
			: await module.default;
	const test = user?.test ?? {};
	return {
		config,
		...(user?.root === undefined ? undefined : { root: user.root }),
		test: {
			include: test.include,
			exclude: test.exclude,
			dir: test.dir,
			root: test.root,
			projectsDeclared: test.projects !== undefined,
			setupFiles: test.setupFiles,
			globalSetup: test.globalSetup,
			pool: test.pool,
			isolate: test.isolate,
			testTimeout: test.testTimeout,
			hookTimeout: test.hookTimeout,
		},
	};
}

const configs = process.argv.slice(2);
const fields: ConfigFields[] = [];
for (const config of configs) fields.push(await read(config));
process.stdout.write(`${JSON.stringify(fields)}\n`);
