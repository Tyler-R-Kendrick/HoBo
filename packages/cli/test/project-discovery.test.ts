/**
 * Which directory the CLI takes for the project (`defaultContextFactory`).
 *
 * Discovery walks up from the working directory to the first marker. `.hobo`
 * is one, because a project keeps its state there (`session.json`,
 * `generated/`, `build/`, `sources/`). But the user's own HoBo home is also
 * called `.hobo`, and it sits in `$HOME`: counting it made every directory
 * under `$HOME` resolve to `$HOME` as its project, and a stray `/tmp/.hobo`
 * made `/tmp` a project for every temp dir under it. So a `.hobo` that is the
 * user's home, or holds nothing but user-level state, is not a marker.
 *
 * `HOBO_CEILING_DIRECTORIES` bounds the walk the way `GIT_CEILING_DIRECTORIES`
 * bounds git's: discovery never moves up into a listed directory. Every case
 * here sets it to its own temp root, so nothing above that root decides the
 * answer.
 */
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	CEILING_DIRECTORIES_ENV,
	defaultContextFactory,
} from "../src/shell/context.js";
import { parseArgv } from "../src/shell/parse.js";

const scratch = mkdtempSync(path.join(tmpdir(), "hobo-cli-discovery-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let cases = 0;

/** A fresh temp root for one case: `<root>/…` paths are made as directories. */
function root(...dirs: string[]): string {
	cases += 1;
	const dir = path.join(scratch, `case-${cases}`);
	for (const sub of ["", ...dirs])
		mkdirSync(path.join(dir, sub), { recursive: true });
	return dir;
}

async function projectDirFrom(
	cwd: string,
	env: NodeJS.ProcessEnv,
	as: { readonly uid?: number; readonly warn?: (line: string) => void } = {},
): Promise<string | null> {
	const context = await defaultContextFactory({
		cwd,
		env,
		flags: parseArgv(["plan"], { cwd }).flags,
		verb: "plan",
		args: [],
		requiresProject: false,
		...as,
	});
	return context.projectDir;
}

/** The uid these files belong to, and one that owns none of them. */
const me = process.getuid?.() ?? 0;
const someoneElse = me + 4242;

describe("a .hobo that is user-level state is not a project", () => {
	it("skips the user's HoBo home in $HOME", async () => {
		const top = root("home/.hobo/durable/code", "home/work/app");
		const home = path.join(top, "home");
		const env = { HOME: home, [CEILING_DIRECTORIES_ENV]: path.dirname(top) };
		expect(await projectDirFrom(path.join(home, "work", "app"), env)).toBe(
			null,
		);
	});

	it("skips the default $HOME/.hobo while HOBO_HOME points elsewhere, whatever it holds", async () => {
		const top = root("home/.hobo/account", "home/work/app", "elsewhere");
		const home = path.join(top, "home");
		writeFileSync(path.join(home, ".hobo", "config.json"), "{}");
		const env = {
			HOME: home,
			HOBO_HOME: path.join(top, "elsewhere"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(await projectDirFrom(path.join(home, "work", "app"), env)).toBe(
			null,
		);
	});

	it("skips a stray .hobo holding only durable/ and runtime/, like /tmp/.hobo", async () => {
		const top = root(
			"shared/.hobo/durable/code/evidence",
			"shared/.hobo/runtime",
			"shared/scratch-123",
		);
		const env = {
			HOME: path.join(top, "nobody"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(
			await projectDirFrom(path.join(top, "shared", "scratch-123"), env),
		).toBe(null);
	});

	it.each([
		"workspaces",
		"connections",
		"claims",
		"auth-md",
		"evidence",
		"trust-roots",
		"identity-migrations",
		"yard.json",
		"installed-runtimes.json",
		"hobo.broker.json",
		"broker-runtime.json",
	])("skips a stray .hobo holding durable/ and %s", async (entry) => {
		const top = root("shared/.hobo/durable/code", "shared/scratch-1");
		const at = path.join(top, "shared", ".hobo", entry);
		if (entry.endsWith(".json")) writeFileSync(at, "{}");
		else mkdirSync(at);
		const env = {
			HOME: path.join(top, "nobody"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(
			await projectDirFrom(path.join(top, "shared", "scratch-1"), env),
		).toBe(null);
	});

	it("ignores dotfiles beside user-level state", async () => {
		const top = root("shared/.hobo/durable", "shared/scratch-1");
		writeFileSync(path.join(top, "shared", ".hobo", ".DS_Store"), "");
		const env = {
			HOME: path.join(top, "nobody"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(
			await projectDirFrom(path.join(top, "shared", "scratch-1"), env),
		).toBe(null);
	});

	it("still takes a .hobo holding project state", async () => {
		const top = root("app/.hobo", "app/src/deep");
		writeFileSync(path.join(top, "app", ".hobo", "session.json"), "{}");
		const env = {
			HOME: path.join(top, "nobody"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(
			await projectDirFrom(path.join(top, "app", "src", "deep"), env),
		).toBe(path.join(top, "app"));
	});

	it("still takes a project's .hobo that holds user-level names beside its own", async () => {
		const top = root("app/.hobo/runtime", "app/.hobo/build", "app/sub");
		const env = {
			HOME: path.join(top, "nobody"),
			[CEILING_DIRECTORIES_ENV]: path.dirname(top),
		};
		expect(await projectDirFrom(path.join(top, "app", "sub"), env)).toBe(
			path.join(top, "app"),
		);
	});
});

describe("a .hobo is trusted only from its owner, like git's safe.directory", () => {
	it("still takes this uid's own .hobo", async () => {
		const top = root("app/.hobo", "app/sub");
		writeFileSync(path.join(top, "app", ".hobo", "session.json"), "{}");
		const warnings: string[] = [];
		expect(
			await projectDirFrom(
				path.join(top, "app", "sub"),
				{ [CEILING_DIRECTORIES_ENV]: path.dirname(top) },
				{ uid: me, warn: (line) => warnings.push(line) },
			),
		).toBe(path.join(top, "app"));
		expect(warnings).toEqual([]);
	});

	it("ignores another uid's readable .hobo in a 1777 parent, and says whose it is", async () => {
		// Anyone can make /tmp/.hobo and plant a session.json in it.
		const top = root("tmp/.hobo", "tmp/scratch-1");
		chmodSync(path.join(top, "tmp"), 0o1777);
		chmodSync(path.join(top, "tmp", ".hobo"), 0o755);
		writeFileSync(path.join(top, "tmp", ".hobo", "session.json"), "{}");
		const warnings: string[] = [];
		expect(
			await projectDirFrom(
				path.join(top, "tmp", "scratch-1"),
				{ [CEILING_DIRECTORIES_ENV]: path.dirname(top) },
				{ uid: someoneElse, warn: (line) => warnings.push(line) },
			),
		).toBe(null);
		expect(warnings).toEqual([
			`hobo: ignoring ${path.join(top, "tmp", ".hobo")} as a project marker: not owned by uid ${someoneElse} (owner uid ${me}, mode 0755)`,
		]);
	});

	it("ignores a 0700 .hobo another uid owns, without reading it", async () => {
		const top = root("shared/.hobo/build", "shared/scratch-1");
		chmodSync(path.join(top, "shared", ".hobo"), 0o700);
		const warnings: string[] = [];
		expect(
			await projectDirFrom(
				path.join(top, "shared", "scratch-1"),
				{ [CEILING_DIRECTORIES_ENV]: path.dirname(top) },
				{ uid: someoneElse, warn: (line) => warnings.push(line) },
			),
		).toBe(null);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(`(owner uid ${me}, mode 0700)`);
	});
});

describe("every marker is trusted only from its owner", () => {
	// Discovery's answer decides what `hobo` imports (cloud/loader.ts loads the
	// project's app.ts or bindle.ts), so a marker a stranger could have put
	// there is code execution as the user. Only a marker this uid owns, that no
	// one else can write, in a directory no one else can write, counts.
	const discover = async (top: string, cwd: string, uid: number) => {
		const warnings: string[] = [];
		const found = await projectDirFrom(
			cwd,
			{ [CEILING_DIRECTORIES_ENV]: path.dirname(top) },
			{ uid, warn: (line) => warnings.push(line) },
		);
		return { found, warnings };
	};

	it.each([
		"app.ts",
		"bindle.ts",
	])("ignores a stranger's %s in a 1777 directory, and says whose it is", async (marker) => {
		const top = root("shared/scratch-1");
		chmodSync(path.join(top, "shared"), 0o1777);
		writeFileSync(path.join(top, "shared", marker), "export default {};\n");
		chmodSync(path.join(top, "shared", marker), 0o644);
		const { found, warnings } = await discover(
			top,
			path.join(top, "shared", "scratch-1"),
			someoneElse,
		);
		expect(found).toBe(null);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(path.join(top, "shared", marker));
		expect(warnings[0]).toContain(`owner uid ${me}`);
		expect(warnings[0]).toContain("mode 0644");
	});

	it("ignores the user's own marker in a world-writable directory", async () => {
		const top = root("shared/scratch-1");
		chmodSync(path.join(top, "shared"), 0o1777);
		writeFileSync(path.join(top, "shared", "app.ts"), "export default {};\n");
		const { found, warnings } = await discover(
			top,
			path.join(top, "shared", "scratch-1"),
			me,
		);
		expect(found).toBe(null);
		expect(warnings.join("\n")).toMatch(/world-writable/u);
	});

	it("ignores a symlinked .hobo, whoever it points at", async () => {
		const top = root("elsewhere/.hobo", "app/sub");
		writeFileSync(path.join(top, "elsewhere", ".hobo", "session.json"), "{}");
		symlinkSync(
			path.join(top, "elsewhere", ".hobo"),
			path.join(top, "app", ".hobo"),
		);
		const { found, warnings } = await discover(
			top,
			path.join(top, "app", "sub"),
			me,
		);
		expect(found).toBe(null);
		expect(warnings.join("\n")).toMatch(/symlink/u);
	});

	it("ignores a 0777 .hobo, and a session.json anyone can write", async () => {
		const open = root("open/.hobo", "open/sub");
		chmodSync(path.join(open, "open", ".hobo"), 0o777);
		writeFileSync(path.join(open, "open", ".hobo", "session.json"), "{}");
		expect(
			(await discover(open, path.join(open, "open", "sub"), me)).found,
		).toBe(null);
		const planted = root("app/.hobo", "app/sub");
		writeFileSync(path.join(planted, "app", ".hobo", "session.json"), "{}");
		chmodSync(path.join(planted, "app", ".hobo", "session.json"), 0o666);
		const { found, warnings } = await discover(
			planted,
			path.join(planted, "app", "sub"),
			me,
		);
		expect(found).toBe(null);
		expect(warnings.join("\n")).toContain(
			path.join(planted, "app", ".hobo", "session.json"),
		);
	});

	it("still finds a normal project", async () => {
		const top = root("app/src/deep");
		writeFileSync(path.join(top, "app", "bindle.ts"), "export default {};\n");
		const { found, warnings } = await discover(
			top,
			path.join(top, "app", "src", "deep"),
			me,
		);
		expect(found).toBe(path.join(top, "app"));
		expect(warnings).toEqual([]);
	});
});

describe(`${CEILING_DIRECTORIES_ENV}`, () => {
	it("stops the walk before it moves into a listed directory", async () => {
		const top = root("outer/inner/app");
		writeFileSync(path.join(top, "outer", "hobo.bindle.json"), "{}");
		const app = path.join(top, "outer", "inner", "app");
		expect(
			await projectDirFrom(app, {
				[CEILING_DIRECTORIES_ENV]: path.join(top, "outer", "inner"),
			}),
		).toBe(null);
		// Without the ceiling the same walk reaches the Bindle above it.
		expect(
			await projectDirFrom(app, {
				[CEILING_DIRECTORIES_ENV]: path.dirname(top),
			}),
		).toBe(path.join(top, "outer"));
	});

	it("still examines the start directory when it is the ceiling", async () => {
		const top = root("app");
		writeFileSync(path.join(top, "app", "hobo.bindle.json"), "{}");
		const app = path.join(top, "app");
		expect(await projectDirFrom(app, { [CEILING_DIRECTORIES_ENV]: app })).toBe(
			app,
		);
	});

	it("does not stop the walk above a ceiling equal to the start directory, as in git", async () => {
		const top = root("outer/app");
		writeFileSync(path.join(top, "outer", "hobo.bindle.json"), "{}");
		const app = path.join(top, "outer", "app");
		expect(await projectDirFrom(app, { [CEILING_DIRECTORIES_ENV]: app })).toBe(
			path.join(top, "outer"),
		);
	});

	it("takes several entries and ignores relative and empty ones", async () => {
		const top = root("outer/inner/app");
		writeFileSync(path.join(top, "outer", "hobo.bindle.json"), "{}");
		const app = path.join(top, "outer", "inner", "app");
		const ceilings = [
			"",
			"outer/inner",
			path.join(scratch, "unrelated"),
			path.join(top, "outer", "inner"),
		].join(path.delimiter);
		expect(
			await projectDirFrom(app, { [CEILING_DIRECTORIES_ENV]: ceilings }),
		).toBe(null);
		expect(
			await projectDirFrom(app, {
				[CEILING_DIRECTORIES_ENV]: ["outer/inner", path.dirname(top)].join(
					path.delimiter,
				),
			}),
		).toBe(path.join(top, "outer"));
	});
});
