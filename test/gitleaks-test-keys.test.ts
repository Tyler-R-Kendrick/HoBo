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

	it("are named as the exception in SECURITY.md", () => {
		const security = readFileSync(`${ROOT}SECURITY.md`, "utf8");
		expect(security).toContain("packages/contract-harness/test/fixtures/tls/");
		expect(security).toMatch(/hostname\.key/u);
		expect(security).toMatch(/loopback\.key/u);
	});
});
