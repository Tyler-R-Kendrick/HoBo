/**
 * The only private keys the repository commits on purpose are the two
 * test-only TLS keys of `@hobo/contract-harness`
 * (packages/contract-harness/test/fixtures/tls/README.md). `.gitleaks.toml`
 * exempts exactly those two files, never their directory, so a key added
 * beside them is still caught; and SECURITY.md says so.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEYS = [
	"packages/contract-harness/test/fixtures/tls/hostname.key",
	"packages/contract-harness/test/fixtures/tls/loopback.key",
];

/** The `paths` entries of `.gitleaks.toml`'s allowlist, as gitleaks reads them: regular expressions. */
function allowlistedPaths(): readonly RegExp[] {
	const toml = readFileSync(`${ROOT}.gitleaks.toml`, "utf8");
	const block = /\bpaths\s*=\s*\[([\s\S]*?)\]/u.exec(toml)?.[1] ?? "";
	return [...block.matchAll(/'''([^']*)'''/gu)].map(
		([, pattern]) => new RegExp(pattern ?? "", "u"),
	);
}

function tracked(): readonly string[] {
	const listing = spawnSync("git", ["ls-files", "-z"], {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	expect(listing.status, listing.stderr).toBe(0);
	return listing.stdout.split("\0").filter((file) => file !== "");
}

describe("committed test-only keys", () => {
	it("are exempted from gitleaks by exactly their two paths, not their directory", () => {
		const patterns = allowlistedPaths();
		const exempted = tracked().filter(
			(file) =>
				file.startsWith("packages/contract-harness/") &&
				patterns.some((pattern) => pattern.test(file)),
		);
		expect(exempted).toEqual(KEYS);
		for (const neighbour of [
			"packages/contract-harness/test/fixtures/tls/ca.pem",
			"packages/contract-harness/test/fixtures/tls/another.key",
			"packages/contract-harness/test/fixtures/tls/sub/loopback.key",
		]) {
			expect(
				patterns.some((pattern) => pattern.test(neighbour)),
				neighbour,
			).toBe(false);
		}
	});

	it("cite a SECURITY.md section that exists", () => {
		const toml = readFileSync(`${ROOT}.gitleaks.toml`, "utf8");
		const cited = /SECURITY\.md, section "([^"]+)"/u.exec(toml)?.[1];
		expect(cited, ".gitleaks.toml cites no SECURITY.md section").toBeDefined();
		const headings = readFileSync(`${ROOT}SECURITY.md`, "utf8")
			.split("\n")
			.filter((line) => line.startsWith("## "))
			.map((line) => line.slice(3).trim());
		expect(headings).toContain(cited);
	});

	it("are used only by the code their README names", () => {
		// `--cached`: the index, so a sparse checkout is searched whole.
		const search = spawnSync(
			"git",
			[
				"grep",
				"-l",
				"--cached",
				"-e",
				"fixtures/tls",
				"--",
				"*.ts",
				"*.mts",
				"*.mjs",
				"*.js",
			],
			{ cwd: ROOT, encoding: "utf8" },
		);
		expect(search.status, search.stderr).toBe(0);
		const users = search.stdout
			.split("\n")
			.filter(
				(file) => file !== "" && file !== "test/gitleaks-test-keys.test.ts",
			);
		const readme = readFileSync(
			`${ROOT}packages/contract-harness/test/fixtures/tls/README.md`,
			"utf8",
		);
		expect(users.length).toBeGreaterThan(0);
		for (const file of users) expect(readme, file).toContain(`\`${file}\``);
	});

	it("are named as the exception in SECURITY.md", () => {
		const security = readFileSync(`${ROOT}SECURITY.md`, "utf8");
		expect(security).toContain("packages/contract-harness/test/fixtures/tls/");
		expect(security).toMatch(/hostname\.key/u);
		expect(security).toMatch(/loopback\.key/u);
	});
});
