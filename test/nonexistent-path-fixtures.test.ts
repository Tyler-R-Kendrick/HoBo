/**
 * No test hands code a made-up path at the filesystem root.
 *
 * A test that wants "a directory that is not there" is tempted to write
 * `hoboHome: "/nonexistent/hobo-home"`. That is only a fixture when the code
 * under test reads or compares the path. A session store, an event journal and
 * a one-time-action store all create the directory they are given, so a run as
 * root (every CI container) makes `/nonexistent/...` on the machine itself and
 * leaves it there. Every later suite that uses `/nonexistent` to mean "missing"
 * (a PATH entry, a binary that must not resolve) then finds a directory.
 * `packages/code`'s two shell suites did this: `/nonexistent/hobo-home-for-*`
 * held chats and a current-session file on every host that had run them.
 *
 * The guard scans test sources rather than checking that `/nonexistent` is
 * absent after a run, for three reasons:
 *  - An ordinary user cannot create a directory at `/`, so the leak is invisible
 *    on a developer's machine and a runtime check would pass there. The scan
 *    fails the same way for every runner.
 *  - A runtime check reads the host. A directory left by an older run would
 *    fail a suite that did nothing wrong, and a new leak would be blamed on
 *    whichever package ran last.
 *  - Each package has its own vitest config, so a teardown would have to be
 *    wired into every one of them. This file runs once, in the root suite.
 *
 * The rule: a test string that opens with `/nonexistent` is either replaced by
 * a directory the test makes under `tmpdir()` and removes afterwards, or listed
 * in `READ_ONLY` with the reason the code never writes there. The scan finds
 * quoted literals, so a path built from pieces (`join("/", "nonexistent")`) is
 * not seen; that is a limit of the scan, not a licence.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

/** An opening quote or backtick, then the path up to the first character a path would not hold. */
const LITERAL = /["'`](\/nonexistent[\w./-]*)/gu;

const TEST_FILE =
	/(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:test|tests|__tests__)\/.+\.[cm]?[jt]sx?$)/u;

interface Allowance {
	readonly literals: readonly string[];
	readonly why: string;
}

interface Hit {
	readonly file: string;
	readonly line: number;
	readonly literal: string;
}

/** Every `/nonexistent...` literal in `text`, with its 1-based line. */
function literalsIn(text: string): readonly Pick<Hit, "line" | "literal">[] {
	return [...text.matchAll(LITERAL)].map((match) => ({
		line: text.slice(0, match.index).split("\n").length,
		literal: match[1] ?? "",
	}));
}

/** Tracked and not-yet-tracked test sources, outside vendored and built trees. */
function testFiles(): readonly string[] {
	const listed = spawnSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
	);
	expect(listed.status, listed.stderr).toBe(0);
	return listed.stdout
		.split("\0")
		.filter(
			(file) =>
				TEST_FILE.test(file) &&
				!file.startsWith("external/") &&
				!file
					.split("/")
					.some((part) => part === "node_modules" || part === "dist") &&
				file !== SELF &&
				existsSync(join(ROOT, file)),
		);
}

function hitsIn(file: string): readonly Hit[] {
	return literalsIn(readFileSync(join(ROOT, file), "utf8")).map((hit) => ({
		file,
		...hit,
	}));
}

/**
 * The literals that name no directory the code could create: a PATH entry, an
 * executable that must fail to launch, a root handed to a read-only walk, a
 * working directory a command refuses before it reads. Keyed by file; the list
 * is the exact multiset the file holds, so a second literal there, or one that
 * was removed, fails below.
 */
const ALLOWANCES = {
	"packages/code/test/config-surface-secrets.test.ts": {
		literals: ["/nonexistent-hobo-config-test", "/nonexistent"],
		why: "the working directory is only looked up with existsSync, and the other is a PATH entry",
	},
	"packages/code/test/editor-bridge-selection.test.ts": {
		literals: ["/nonexistent"],
		why: "a PATH entry the editor lookup walks",
	},
	"packages/connectivity/test/config-and-portless.test.ts": {
		literals: [
			"/nonexistent/from/env",
			"/nonexistent/explicit/portless",
			"/nonexistent/x",
		],
		why: "binary paths the probe skips on existsSync or never launches",
	},
	"packages/hobo/test/derivative-descriptor-and-conformance.test.ts": {
		literals: ["/nonexistent"],
		why: "the command refuses for a missing runtime before it reads the working directory",
	},
	"packages/iac/iac-crossplane/test/kubectl-cluster.test.ts": {
		literals: ["/nonexistent/kubectl", "/nonexistent/kubectl"],
		why: "an executable that must fail to launch",
	},
	"packages/iac/iac-pulumi/test/pulumi-automation-api-engine.test.ts": {
		literals: ["/nonexistent"],
		why: "a PATH entry, so the engine binary cannot be found",
	},
	"packages/iac/iac-terraform/test/terraform-cli-engine.test.ts": {
		literals: ["/nonexistent/hcl-binary"],
		why: "an executable that must fail to launch",
	},
	"packages/runtimes/runtime-oci/test/kubectl-transport.test.ts": {
		literals: ["/nonexistent/kubectl"],
		why: "an executable that must fail to launch",
	},
	"packages/schema-tools/test/discover.test.ts": {
		literals: ["/nonexistent-root", "/nonexistent-root/packages"],
		why: "roots for a read-only directory walk that must find nothing",
	},
} satisfies Readonly<Record<string, Allowance>>;

const READ_ONLY: ReadonlyMap<string, Allowance> = new Map(
	Object.entries(ALLOWANCES),
);

/** What the scan finds that `READ_ONLY` does not cover, and what `READ_ONLY` names that is gone. */
function audit(hits: readonly Hit[]) {
	const offenders: string[] = [];
	const stale: string[] = [];
	const files = new Set([...hits.map((hit) => hit.file), ...READ_ONLY.keys()]);
	for (const file of [...files].sort()) {
		const unused = [...(READ_ONLY.get(file)?.literals ?? [])];
		for (const hit of hits.filter((entry) => entry.file === file)) {
			const at = unused.indexOf(hit.literal);
			if (at < 0) offenders.push(`${file}:${hit.line}  ${hit.literal}`);
			else unused.splice(at, 1);
		}
		for (const literal of unused) stale.push(`${file}  ${literal}`);
	}
	return { offenders, stale };
}

describe("fixture paths at the filesystem root", () => {
	const files = testFiles();
	const found = audit(files.flatMap(hitsIn));

	it("none of the tests names a /nonexistent path the code could create", () => {
		expect(
			found.offenders,
			[
				"A test hands code a path under /nonexistent. A run as root creates it on the host.",
				"Make a directory with mkdtempSync(join(tmpdir(), ...)) in beforeAll and remove it in afterAll,",
				"or add the literal to READ_ONLY in test/nonexistent-path-fixtures.test.ts with the reason the code never writes there.",
			].join("\n"),
		).toEqual([]);
	});

	it("lists only literals the tests still hold", () => {
		expect(
			found.stale,
			"These READ_ONLY entries no longer match a literal in their file; remove them.",
		).toEqual([]);
	});

	it("scans the suites that leaked, so an empty scan cannot pass", () => {
		expect(files.length).toBeGreaterThan(500);
		expect(files).toContain(
			"packages/code/test/shell-key-reducer-arms.test.ts",
		);
		expect(files).toContain(
			"packages/code/test/shell-view-and-compact.test.ts",
		);
		expect(files).toContain(
			"packages/code/test/config-surface-secrets.test.ts",
		);
	});
});

describe("the literal scan", () => {
	it("finds a path in each quoting form, with its line", () => {
		const text = [
			`const a = { hoboHome: "/nonexistent/hobo-home" };`,
			`const b = { cwd: '/nonexistent-project' };`,
			"const c = { home: `/nonexistent/${name}` };",
		].join("\n");
		expect(literalsIn(text)).toEqual([
			{ line: 1, literal: "/nonexistent/hobo-home" },
			{ line: 2, literal: "/nonexistent-project" },
			{ line: 3, literal: "/nonexistent/" },
		]);
	});

	it("ignores a word that only contains the name", () => {
		const text = [
			`const a = "station:nonexistent";`,
			`const b = path.join(root, "nonexistent");`,
			`const c = "/tmp/nonexistent";`,
		].join("\n");
		expect(literalsIn(text)).toEqual([]);
	});

	it("reports a literal the allowances do not cover, and an allowance with no literal", () => {
		const hits = [
			{
				file: "packages/code/test/new.test.ts",
				line: 7,
				literal: "/nonexistent/home",
			},
			{
				file: "packages/code/test/editor-bridge-selection.test.ts",
				line: 3,
				literal: "/nonexistent/other",
			},
		];
		const { offenders, stale } = audit(hits);
		expect(offenders).toEqual([
			"packages/code/test/editor-bridge-selection.test.ts:3  /nonexistent/other",
			"packages/code/test/new.test.ts:7  /nonexistent/home",
		]);
		expect(stale).toContain(
			"packages/code/test/editor-bridge-selection.test.ts  /nonexistent",
		);
	});
});
