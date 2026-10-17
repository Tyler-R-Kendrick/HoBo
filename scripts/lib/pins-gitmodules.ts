/**
 * What `.gitmodules` records for a submodule, read the way git reads it, and
 * the refusals for what git could read differently from the script.
 *
 * Erasable TypeScript with node builtins only.
 */
import { git, Refusal } from "./pins-git-core.ts";

export interface ModulesEntry {
	/** The submodule's name in `.gitmodules` (often, not always, its path). */
	readonly name: string;
	readonly url: string;
}

function hasControl(value: string): boolean {
	return [...value].some((char) => {
		const code = char.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

/** `./a//b/` and `a/b` name the same directory. */
function samePath(left: string, right: string): boolean {
	const normal = (value: string): string =>
		value
			.replace(/^(\.\/)+/u, "")
			.replace(/\/{2,}/gu, "/")
			.replace(/\/+$/u, "");
	return normal(left) === normal(right);
}

/** Every `submodule.<name>.<key>` value, NUL-separated so no value can forge a line. */
function modulesValues(root: string): Map<string, Map<string, string[]>> {
	const out = git(root, [
		"config",
		"-z",
		"-f",
		".gitmodules",
		"--get-regexp",
		"^submodule\\.",
	]).stdout;
	const sections = new Map<string, Map<string, string[]>>();
	for (const entry of out.split("\0")) {
		if (entry === "") continue;
		const cut = entry.indexOf("\n");
		const key = cut === -1 ? entry : entry.slice(0, cut);
		const value = cut === -1 ? "" : entry.slice(cut + 1);
		if (hasControl(key) || hasControl(value)) {
			throw new Refusal(
				"GITMODULES_AMBIGUOUS",
				`.gitmodules: ${key.slice(0, 80)} holds a line break or another control character, which git reads from an escape such as \\n; such a value is refused`,
				`remove the escape from that value in .gitmodules`,
			);
		}
		const dot = key.lastIndexOf(".");
		const name = key.slice("submodule.".length, dot);
		const values = sections.get(name) ?? new Map<string, string[]>();
		values.set(key.slice(dot + 1), [
			...(values.get(key.slice(dot + 1)) ?? []),
			value,
		]);
		sections.set(name, values);
	}
	return sections;
}

/**
 * What `.gitmodules` records for the submodule at `path`, read the way git
 * reads it (`git config -z`). Refused (GITMODULES_AMBIGUOUS) when git could
 * pick a repository the script did not compare: two sections naming the path,
 * a path or url set twice in one section, or a value with a control character.
 */
export function modulesEntry(root: string, path: string): ModulesEntry | null {
	const sections = modulesValues(root);
	const naming = [...sections].filter(([, values]) =>
		(values.get("path") ?? []).some((value) => samePath(value, path)),
	);
	if (naming.length > 1) {
		throw new Refusal(
			"GITMODULES_AMBIGUOUS",
			`.gitmodules has ${naming.length} sections for ${path} (${naming.map(([name]) => `"${name}"`).join(", ")}); git uses one of them, so which repository it would contact is not certain`,
			`keep one [submodule] section for ${path} in .gitmodules`,
		);
	}
	const [found] = naming;
	if (found === undefined) return null;
	const [name, values] = found;
	for (const key of ["path", "url"]) {
		if ((values.get(key) ?? []).length > 1) {
			throw new Refusal(
				"GITMODULES_AMBIGUOUS",
				`.gitmodules sets submodule.${name}.${key} more than once`,
				`keep one ${key} line in the [submodule "${name}"] section of .gitmodules`,
			);
		}
	}
	const url = values.get("url")?.[0];
	return values.get("path")?.[0] === path && url !== undefined
		? { name, url }
		: null;
}

/** The url `.gitmodules` records for the submodule at `path`, if any. */
export function modulesUrl(root: string, path: string): string | null {
	return modulesEntry(root, path)?.url ?? null;
}
