/**
 * Which packages turbo builds before a package's task, read from the same
 * inputs turbo reads: the root `turbo.json`, a package's own `turbo.json`
 * (`extends: ["//"]`), and the workspace dependencies in each `package.json`.
 *
 * - `"^build"` reaches the `build` of every workspace package named in
 *   `dependencies`, `devDependencies` or `optionalDependencies`. Not
 *   `peerDependencies`: turbo orders no task on one.
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

export interface TaskConfig {
	readonly dependsOn?: readonly string[];
}

export interface GraphPackage {
	readonly name: string;
	/** Workspace packages it depends on through the fields turbo orders. */
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
