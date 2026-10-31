/**
 * Which packages turbo builds before a package's task, read from the same
 * inputs turbo reads: the root `turbo.json`, a package's own `turbo.json`
 * (`extends: ["//"]`), and the workspace dependencies in each `package.json`.
 *
 * - `"^build"` reaches the `build` of every workspace package named in
 *   `dependencies`, `devDependencies` or `optionalDependencies` with a specifier
 *   turbo orders (`orderedDependency`). Not `peerDependencies`: turbo orders no
 *   task on one.
 * - `"build"` reaches the package's own `build`; `"@s/x#build"` reaches that
 *   package's.
 * - A root `"<pkg>#<task>"` entry replaces the generic `"<task>"` for that
 *   package, and a package's own `turbo.json` replaces that `dependsOn` when it
 *   sets one, unless the list names `"$TURBO_EXTENDS$"`: then turbo appends it
 *   to the inherited list, wherever the marker sits. An override of one task
 *   orders nothing for another.
 * - A task a package has no script for is still a node: turbo follows its
 *   `dependsOn` and runs nothing for it.
 */
const TURBO_EXTENDS = "$TURBO_EXTENDS$";

/** pnpm's link-workspace-packages, as turbo reads it, and why. */
export interface LinkWorkspacePackages {
	readonly enabled: boolean;
	/** Which file sets it, or which default applies. */
	readonly source: string;
}

/** The root files turbo reads link-workspace-packages from; each absent where the file is. */
export interface LinkInputs {
	/** The root `package.json`'s `packageManager`. */
	readonly packageManager?: string | undefined;
	readonly npmrc?: string | undefined;
	readonly workspaceYaml?: string | undefined;
}

function yamlSetting(text: string | undefined): boolean | undefined {
	const match = /^linkWorkspacePackages:[ \t]*(.*?)[ \t]*(?:#.*)?$/mu.exec(
		text ?? "",
	);
	const value = match?.[1];
	if (value === undefined || /^(?:|~|null|Null|NULL)$/u.test(value))
		return undefined;
	if (/^(?:true|True|TRUE)$/u.test(value)) return true;
	if (/^(?:false|False|FALSE)$/u.test(value)) return false;
	// Any other value is a string, and only "deep" turns it on.
	return value.replace(/^(["'])(.*)\1$/u, "$2") === "deep";
}

function npmrcSetting(text: string | undefined): boolean | undefined {
	let setting: boolean | undefined;
	for (const line of (text ?? "").split(/\r?\n/u)) {
		if (/^\s*\[/u.test(line)) break;
		const value = /^\s*link-workspace-packages\s*=\s*(.*?)\s*$/u.exec(
			line,
		)?.[1];
		if (value === "true" || value === "deep") setting = true;
		else if (value === "false") setting = false;
	}
	return setting;
}

/**
 * Whether turbo links a workspace package for a specifier without the
 * `workspace:` protocol, as it decides for pnpm: from pnpm 9,
 * `linkWorkspacePackages` in pnpm-workspace.yaml, else
 * `link-workspace-packages` in .npmrc, else off; before pnpm 9, .npmrc, else
 * on. Read for pnpm only, the package manager this repository names.
 */
export function linkWorkspacePackages(
	inputs: LinkInputs,
): LinkWorkspacePackages {
	const major = /^pnpm@(\d+)\./u.exec(inputs.packageManager ?? "")?.[1];
	const pnpm9 = major === undefined || Number(major) >= 9;
	const yaml = pnpm9 ? yamlSetting(inputs.workspaceYaml) : undefined;
	if (yaml !== undefined)
		return { enabled: yaml, source: "pnpm-workspace.yaml sets it" };
	const npmrc = npmrcSetting(inputs.npmrc);
	if (npmrc !== undefined) return { enabled: npmrc, source: ".npmrc sets it" };
	return pnpm9
		? {
				enabled: false,
				source:
					"the default from pnpm 9; neither pnpm-workspace.yaml nor .npmrc sets it",
			}
		: {
				enabled: true,
				source: "the default before pnpm 9, which reads it from .npmrc only",
			};
}

/** How a dependency's specifier resolves to a workspace package. */
export interface WorkspaceIndex {
	/** The workspace package of that name. */
	byName(name: string): string | undefined;
	/** The workspace package at a path relative to the dependent's directory. */
	byPath(path: string): string | undefined;
	/** Whether a path relative to the dependent's directory stays in the repository. */
	inside(path: string): boolean;
}

/** The workspace package turbo orders a dependency on, or why it orders none. */
export type Ordered =
	| { readonly target: string }
	| { readonly target?: undefined; readonly reason: string };

/**
 * Whether turbo's dependency splitter (2.11.10) counts `"<key>": "<specifier>"`
 * as a workspace package, and which.
 * - `workspace:` always counts: `workspace:<name>@*` (`^`, `~`) names
 *   `<name>`, a specifier with a `/` is a path from the dependent, and
 *   anything else names `<key>`. A path is read from the dependent's directory,
 *   then from the repository root.
 * - Anything else counts only where link-workspace-packages is on, and names
 *   `<key>`: a version, `*`, `npm:<range>`, or a `file:`/`link:` path that
 *   stays in the repository. Not an npm alias (`npm:<name>@<version>`) or
 *   another protocol (`github:`, `git+https:`, `catalog:`, which is not
 *   resolved here).
 *
 * Not modelled: with link-workspace-packages on, turbo leaves a version or
 * range the workspace package's version does not satisfy external.
 */
export function orderedDependency(
	key: string,
	specifier: string,
	link: LinkWorkspacePackages,
	index: WorkspaceIndex,
): Ordered {
	const external = (reason: string): Ordered => ({
		reason: `"${specifier}", and turbo ${reason}`,
	});
	const found = (target: string | undefined): Ordered =>
		target === undefined
			? external("finds no workspace package it names")
			: { target };
	if (specifier.startsWith("workspace:")) {
		const rest = specifier.slice("workspace:".length);
		const alias = /^(.+)@[*^~]$/u.exec(rest)?.[1];
		if (alias !== undefined) return found(index.byName(alias));
		return found(rest.includes("/") ? index.byPath(rest) : index.byName(key));
	}
	if (!link.enabled)
		return external(
			`orders only a workspace: specifier: link-workspace-packages is off (${link.source})`,
		);
	const colon = specifier.indexOf(":");
	const protocol = colon < 0 ? undefined : specifier.slice(0, colon);
	const version = specifier.slice(colon + 1);
	if (protocol === "file" || protocol === "link") {
		if (!index.inside(version))
			return external(`orders no ${protocol}: path outside the repository`);
	} else if (protocol === "npm") {
		if (/^@?[^@]+@/u.test(version))
			return external("orders no npm alias to another package");
	} else if (protocol !== undefined)
		return external(
			`orders no ${protocol}: specifier although link-workspace-packages is on (${link.source})`,
		);
	return found(index.byName(key));
}

export interface TaskConfig {
	readonly dependsOn?: readonly string[];
}

export interface GraphPackage {
	readonly name: string;
	/** Workspace packages it depends on through the fields and specifiers turbo orders. */
	readonly dependencies: readonly string[];
	readonly scripts: ReadonlySet<string>;
	/** The `tasks` of the package's own turbo.json, if it has one. */
	readonly tasks?: Readonly<Record<string, TaskConfig>> | undefined;
}

export class TurboTaskGraph {
	private readonly reached = new Map<string, ReadonlySet<string>>();

	constructor(
		private readonly packages: ReadonlyMap<string, GraphPackage>,
		private readonly rootTasks: Readonly<Record<string, TaskConfig>>,
	) {}

	private dependsOn(pkg: GraphPackage, task: string): readonly string[] {
		const inherited =
			this.rootTasks[`${pkg.name}#${task}`]?.dependsOn ??
			this.rootTasks[task]?.dependsOn ??
			[];
		const own = pkg.tasks?.[task]?.dependsOn;
		if (own === undefined) return inherited;
		if (!own.includes(TURBO_EXTENDS)) return own;
		return [...inherited, ...own.filter((entry) => entry !== TURBO_EXTENDS)];
	}

	/** The packages whose `build` turbo runs before `<pkg>#<task>` (and, for `build`, the package itself). */
	buildsBefore(name: string, task: string): ReadonlySet<string> {
		const key = `${name}#${task}`;
		const cached = this.reached.get(key);
		if (cached !== undefined) return cached;
		const builds = new Set<string>();
		const seen = new Set<string>();
		const queue: [string, string][] = [[name, task]];
		while (queue.length > 0) {
			const [current, currentTask] = queue.pop()!;
			const id = `${current}#${currentTask}`;
			if (seen.has(id)) continue;
			seen.add(id);
			const pkg = this.packages.get(current);
			if (pkg === undefined) continue;
			if (currentTask === "build" && id !== key) builds.add(current);
			for (const entry of this.dependsOn(pkg, currentTask)) {
				if (entry.startsWith("^")) {
					for (const dependency of pkg.dependencies)
						queue.push([dependency, entry.slice(1)]);
				} else if (entry.includes("#")) {
					const at = entry.lastIndexOf("#");
					queue.push([entry.slice(0, at), entry.slice(at + 1)]);
				} else if (!entry.startsWith("$")) queue.push([current, entry]);
			}
		}
		if (task === "build") builds.add(name);
		this.reached.set(key, builds);
		return builds;
	}

	/**
	 * The packages that must be built before code can load `name`'s files: it
	 * and everything its `build` builds first, where each has a `build` script.
	 * Empty for a package whose closure builds nothing.
	 */
	needsBuilt(name: string): string[] {
		return [...this.buildsBefore(name, "build")].filter(
			(item) => this.packages.get(item)?.scripts.has("build") === true,
		);
	}
}
