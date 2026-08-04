/**
 * Parse, don't validate: a workspace name that has been through `parseWorkspaceName`
 * is a `WorkspaceName`, and only a `WorkspaceName` can be turned into a path.
 *
 * This is not decoration. The name is joined onto the workspaces directory, so
 * an unparsed string is a path-traversal primitive: `--name ../../etc` would
 * have placed a workspace outside the root, and `--name ..` would have made
 * `remove` delete the root's own bookkeeping. The branded type makes it a type
 * error to reach the filesystem without going through the check.
 */

declare const brand: unique symbol;

/** A name proven safe to use as a single path segment. */
export type WorkspaceName = string & { readonly [brand]: "WorkspaceName" };

export interface ParseFailure {
	readonly ok: false;
	readonly reason: string;
}
export interface ParseSuccess {
	readonly ok: true;
	readonly value: WorkspaceName;
}
export type ParseResult = ParseSuccess | ParseFailure;

/** Length cap keeps the derived paths inside typical PATH_MAX budgets. */
export const MAX_NAME_LENGTH = 64;

export function parseWorkspaceName(raw: string): ParseResult {
	const name = raw.trim();
	if (name.length === 0) return { ok: false, reason: "name is empty" };
	if (name.length > MAX_NAME_LENGTH) {
		return {
			ok: false,
			reason: `name is longer than ${MAX_NAME_LENGTH} characters`,
		};
	}
	if (name === "." || name === "..") {
		return { ok: false, reason: `"${name}" is a directory reference, not a name` };
	}
	if (name.includes("/") || name.includes("\\")) {
		return { ok: false, reason: "name must be a single path segment" };
	}
	if (name.includes("\0")) return { ok: false, reason: "name contains NUL" };
	if (name.startsWith("-")) {
		// A leading dash turns the name into a flag for anything we shell out to.
		return { ok: false, reason: "name must not start with '-'" };
	}
	return { ok: true, value: name as WorkspaceName };
}
