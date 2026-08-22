/**
 * Pointing a third-party coding harness at the Station.
 *
 * `hobo-code agents init` edits config files that belong to *other* tools —
 * Codex's TOML, an editor's JSON, a shell rc. Writing into someone else's
 * configuration is the highest-consequence thing this package does outside a
 * git operation, so three rules govern every adapter:
 *
 * **Never clobber what is already there.** A JSON edit merges into the parsed
 * document and a TOML edit appends to the existing text. Rewriting the file
 * from a template would silently discard the user's own settings — and they
 * would not find out until the next time that tool behaved oddly.
 *
 * **Do it once.** Each spec carries markers that say "already configured".
 * Re-running init must not append a second copy of the same block; a TOML file
 * with the same key twice is either a parse error or a silent last-wins,
 * neither of which the user asked for.
 *
 * **Never write a credential into a file.** The destination carries an *env
 * reference* — `${HOBO_CODE_SESSION_REF}` — not a session value. The file ends
 * up in dotfile repos and screen shares; a token in it outlives every rotation.
 *
 * A file that cannot be parsed is the interesting case: the adapter refuses to
 * merge rather than replacing it, because a malformed config is usually a
 * half-finished edit, and overwriting it would destroy work in progress.
 *
 * Every adapter returns *hunks* rather than writing, so the caller can show a
 * diff before touching anything — and these tests read those hunks directly.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	type AdapterContext,
	type AgentsInitDestination,
	applyHarnessConfig,
	type HarnessSpec,
	interpolateDest,
} from "../src/agent-harness-adapters.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-cfg-"));
	dirs.push(dir);
	return dir;
}

const DEST: AgentsInitDestination = {
	source: "sidecar",
	openaiUrl: "http://127.0.0.1:4010/v1",
	anthropicUrl: "http://127.0.0.1:4010/anthropic",
	namedUrl: "http://code-mux.hobo.localhost",
	envKey: "HOBO_CODE_SESSION_REF",
};

const ctx = (overrides: Partial<AdapterContext> = {}): AdapterContext => ({
	home: home(),
	dest: DEST,
	...overrides,
});

/** Write `contents` to `rel` under `base`, creating parent directories. */
function seed(base: string, rel: string, contents: string): string {
	const path = join(base, ...rel.split("/"));
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	return path;
}

const spec = (config: Record<string, unknown>): HarnessSpec =>
	({
		id: "example",
		label: "Example Harness",
		kind: "coding-cli",
		config,
		// SAFETY: the adapters read exactly the fields a spec names.
	}) as never;

describe("interpolating the destination", () => {
	it("substitutes the OpenAI base URL", () => {
		expect(interpolateDest("base = {{openaiUrl}}", DEST)).toBe(
			`base = ${DEST.openaiUrl}`,
		);
	});

	it("substitutes the Anthropic base URL", () => {
		// Two protocols reach the same sidecar; a harness speaking one must not
		// be pointed at the other's path.
		expect(interpolateDest("{{anthropicUrl}}", DEST)).toBe(DEST.anthropicUrl);
	});

	it("substitutes the env key by name", () => {
		expect(interpolateDest("{{envKey}}", DEST)).toBe("HOBO_CODE_SESSION_REF");
	});

	it("substitutes an env *reference*, not a value", () => {
		// The whole point: the config file gets `${HOBO_CODE_SESSION_REF}`, so
		// the credential is resolved at run time by the shell and never lands
		// in a file that ends up in a dotfile repo.
		expect(interpolateDest("key = {{envRef}}", DEST)).toBe(
			"key = ${HOBO_CODE_SESSION_REF}",
		);
	});

	it("substitutes every occurrence, not just the first", () => {
		// A template naming a URL twice would otherwise be half-configured —
		// and half-configured points at the wrong host.
		expect(interpolateDest("{{openaiUrl}} and {{openaiUrl}}", DEST)).toBe(
			`${DEST.openaiUrl} and ${DEST.openaiUrl}`,
		);
	});

	it("leaves an unknown placeholder alone rather than emptying it", () => {
		// Blanking it would write a config with a missing value that looks
		// deliberate; leaving the marker makes the mistake visible in the diff.
		expect(interpolateDest("{{notAThing}}", DEST)).toBe("{{notAThing}}");
	});

	it("returns a template with no placeholders unchanged", () => {
		expect(interpolateDest("plain text", DEST)).toBe("plain text");
	});
});

describe("appending to a TOML config", () => {
	const tomlSpec = () =>
		spec({
			format: "toml-append",
			path: ".config/example/config.toml",
			block: '[model_providers.hobo]\nbase_url = "{{openaiUrl}}"',
			configuredWhen: ["model_providers.hobo"],
		});

	it("creates the file when there is none", () => {
		const context = ctx();
		const [hunk] = applyHarnessConfig(tomlSpec(), context);
		expect(hunk?.action).toBe("create");
		expect(hunk?.after).toContain("model_providers.hobo");
	});

	it("interpolates the destination into the block it writes", () => {
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx());
		expect(hunk?.after).toContain(DEST.openaiUrl);
	});

	it("edits rather than creates when the file exists", () => {
		// The distinction drives what the caller shows the user — "we will
		// create this" and "we will change this" are different consents.
		const base = home();
		seed(base, ".config/example/config.toml", "[existing]\nkeep = true\n");
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx({ home: base }));
		expect(hunk?.action).toBe("edit");
	});

	it("keeps what was already in the file", () => {
		// Rewriting from a template would silently discard the user's own
		// settings, and they would not find out until the tool misbehaved.
		const base = home();
		seed(base, ".config/example/config.toml", "[existing]\nkeep = true\n");
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx({ home: base }));
		expect(hunk?.after).toContain("keep = true");
	});

	it("separates the appended block from the existing content", () => {
		// TOML is line-oriented; an appended table glued to the previous line
		// is a parse error.
		const base = home();
		seed(base, ".config/example/config.toml", "[existing]\nkeep = true");
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx({ home: base }));
		expect(hunk?.after).toContain("keep = true\n\n[model_providers.hobo]");
	});

	it("does nothing when the marker is already present", () => {
		// Re-running init must not append a second copy: the same TOML key
		// twice is a parse error or a silent last-wins.
		const base = home();
		seed(
			base,
			".config/example/config.toml",
			'[model_providers.hobo]\nbase_url = "old"\n',
		);
		expect(applyHarnessConfig(tomlSpec(), ctx({ home: base }))).toStrictEqual(
			[],
		);
	});

	it("re-applies when forced", () => {
		// The escape hatch for a destination that changed — otherwise a user
		// who moved their sidecar could never re-point the harness.
		const base = home();
		seed(base, ".config/example/config.toml", "[model_providers.hobo]\n");
		expect(
			applyHarnessConfig(tomlSpec(), ctx({ home: base, force: true })).length,
		).toBeGreaterThan(0);
	});

	it("ends the file with exactly one newline", () => {
		// A config without a trailing newline is a diff that shows the last
		// line as changed on the next edit.
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx());
		expect(hunk?.after.endsWith("\n")).toBe(true);
		expect(hunk?.after.endsWith("\n\n")).toBe(false);
	});

	it("produces nothing without a path", () => {
		// A spec that names no file has nothing to write; inventing a location
		// would put HoBo config somewhere the tool never reads.
		expect(
			applyHarnessConfig(spec({ format: "toml-append", block: "[x]" }), ctx()),
		).toStrictEqual([]);
	});

	it("produces nothing without a block", () => {
		expect(
			applyHarnessConfig(
				spec({ format: "toml-append", path: "a/b.toml" }),
				ctx(),
			),
		).toStrictEqual([]);
	});

	it("names the harness in the summary", () => {
		// The summary is the line the user reads before approving a write into
		// another tool's configuration.
		const [hunk] = applyHarnessConfig(tomlSpec(), ctx());
		expect(hunk?.summary).toContain("Example Harness");
	});
});

describe("merging environment into a JSON config", () => {
	const jsonSpec = () =>
		spec({
			format: "json-env",
			path: ".config/example/settings.json",
			env: { OPENAI_BASE_URL: "{{openaiUrl}}" },
		});

	it("creates the file when there is none", () => {
		const [hunk] = applyHarnessConfig(jsonSpec(), ctx());
		expect(hunk?.action).toBe("create");
	});

	it("writes the interpolated value", () => {
		const [hunk] = applyHarnessConfig(jsonSpec(), ctx());
		expect(hunk?.after).toContain(DEST.openaiUrl);
	});

	it("keeps the user's own keys", () => {
		// Merging rather than replacing — the config belongs to the other tool,
		// and everything in it that is not ours has to survive.
		const base = home();
		seed(base, ".config/example/settings.json", '{"theme":"dark"}');
		const [hunk] = applyHarnessConfig(jsonSpec(), ctx({ home: base }));
		expect(hunk?.after).toContain("dark");
	});

	it("refuses to merge into a file it cannot parse", () => {
		// A malformed config is usually a half-finished edit. Overwriting it
		// would destroy work in progress, so the adapter reports rather than
		// repairs.
		const base = home();
		seed(base, ".config/example/settings.json", "{ not json");
		const hunks = applyHarnessConfig(jsonSpec(), ctx({ home: base }));
		expect(hunks[0]?.action).toBe("note");
	});

	it("says why it refused", () => {
		// A note with no reason leaves the user unable to act; the whole value
		// of refusing is telling them what to fix.
		const base = home();
		seed(base, ".config/example/settings.json", "{ not json");
		const hunks = applyHarnessConfig(jsonSpec(), ctx({ home: base }));
		expect(hunks[0]?.summary.length).toBeGreaterThan(0);
	});

	it("produces nothing without a path", () => {
		expect(
			applyHarnessConfig(spec({ format: "json-env", env: {} }), ctx()),
		).toStrictEqual([]);
	});

	it("produces nothing without an env map", () => {
		expect(
			applyHarnessConfig(spec({ format: "json-env", path: "a/b.json" }), ctx()),
		).toStrictEqual([]);
	});
});

describe("dispatching on the declared format", () => {
	it("does nothing at all for `skip`", () => {
		// Some harnesses need no file written — a note would be noise in the
		// diff the user reviews.
		expect(applyHarnessConfig(spec({ format: "skip" }), ctx())).toStrictEqual(
			[],
		);
	});

	it("emits a note for `note`", () => {
		const hunks = applyHarnessConfig(
			spec({ format: "note", note: "do this by hand" }),
			ctx(),
		);
		expect(hunks[0]?.action).toBe("note");
	});

	it("falls back to a note for an unknown format", () => {
		// A spec naming a format this build does not implement must not be
		// silently skipped: the user would believe their harness was wired up.
		const hunks = applyHarnessConfig(
			// SAFETY: the fixture supplies an out-of-contract format deliberately.
			spec({ format: "not-a-real-format" as never }),
			ctx(),
		);
		expect(hunks[0]?.action).toBe("note");
	});

	it("falls back to a note when no format is declared", () => {
		expect(applyHarnessConfig(spec({}), ctx())[0]?.action).toBe("note");
	});

	it("emits hunks for the SDK env format", () => {
		expect(
			applyHarnessConfig(spec({ format: "sdk-env" }), ctx()).length,
		).toBeGreaterThan(0);
	});

	it("emits hunks for the Eve VFS format", () => {
		expect(
			applyHarnessConfig(spec({ format: "eve-vfs" }), ctx()).length,
		).toBeGreaterThan(0);
	});
});

describe("what every hunk carries", () => {
	const everyFormat = [
		spec({
			format: "toml-append",
			path: "a/b.toml",
			block: "[x]",
			configuredWhen: ["[x]"],
		}),
		spec({ format: "json-env", path: "a/b.json", env: { A: "1" } }),
		spec({ format: "note", note: "n" }),
		spec({ format: "sdk-env" }),
		spec({ format: "eve-vfs" }),
	];

	it("names a path", () => {
		// The caller shows a diff per path; a hunk without one cannot be shown
		// or applied.
		for (const s of everyFormat) {
			for (const hunk of applyHarnessConfig(s, ctx())) {
				expect(hunk.path.length).toBeGreaterThan(0);
			}
		}
	});

	it("declares one of the three actions", () => {
		for (const s of everyFormat) {
			for (const hunk of applyHarnessConfig(s, ctx())) {
				expect(["create", "edit", "note"]).toContain(hunk.action);
			}
		}
	});

	it("explains itself in a summary", () => {
		for (const s of everyFormat) {
			for (const hunk of applyHarnessConfig(s, ctx())) {
				expect(hunk.summary.length).toBeGreaterThan(0);
			}
		}
	});

	it("never carries a resolved credential", () => {
		// The destination carries an env *reference*; a hunk containing the
		// session value would put a token in a file that outlives every
		// rotation.
		for (const s of everyFormat) {
			for (const hunk of applyHarnessConfig(s, ctx())) {
				expect(hunk.after).not.toContain("sk-");
			}
		}
	});

	it("writes under the home it was given, never an ambient one", () => {
		// These adapters edit real dotfiles. Reading the process HOME instead
		// of the supplied one would let a test — or a sandboxed run — write
		// into the developer's actual configuration.
		const base = home();
		const [hunk] = applyHarnessConfig(
			spec({ format: "toml-append", path: "a/b.toml", block: "[x]" }),
			ctx({ home: base }),
		);
		expect(hunk?.path.startsWith(base)).toBe(true);
	});
});
