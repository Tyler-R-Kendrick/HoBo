/**
 * Which platforms the CUE auto-download claims to support.
 *
 * `ensureCueBinary` prefers a `cue` on PATH, then the repo cache, and only then
 * downloads one. That last step builds a release-archive name from the host's
 * platform and architecture — so the supported set is decided by two switches,
 * and what they do off the happy path is the whole contract:
 *
 * **An unsupported host is refused by name, before any network call.** The
 * alternative is a fetch for an archive that does not exist, which surfaces as
 * a 404 with no explanation of *why* — leaving a developer on an unusual host
 * to work out that HoBo simply has no build for them.
 *
 * **The error says which platform or architecture was rejected.** "unsupported
 * platform" alone tells someone on s390x nothing they did not already know.
 *
 * These are the only tests here that mock `node:os`. Every other path in this
 * module is reachable with a real host and a stand-in binary — but a platform
 * switch cannot be, by construction, and leaving it untested means nobody finds
 * out it is wrong until someone runs HoBo on a machine the team does not have.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const realOs = await vi.importActual<typeof import("node:os")>("node:os");

/** Load `cue.ts` fresh with `node:os` reporting the given host. */
async function withHost(host: { platform?: string; arch?: string }) {
	vi.resetModules();
	vi.doMock("node:os", () => ({
		...realOs,
		platform: () => host.platform ?? realOs.platform(),
		arch: () => host.arch ?? realOs.arch(),
		homedir: realOs.homedir,
		tmpdir: realOs.tmpdir,
	}));
	return await import("../src/cue.js");
}

const dirs: string[] = [];
const originalPath = process.env.PATH;

afterEach(() => {
	process.env.PATH = originalPath;
	vi.doUnmock("node:os");
	vi.resetModules();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/**
 * A repo root with no cached CUE, and a PATH with no `cue` on it, so
 * `ensureCueBinary` falls all the way through to the download.
 */
function repoWithoutCache(): string {
	// Node's own directory only: enough to run a script, not enough to find a
	// `cue` that some other lane may have installed.
	process.env.PATH = dirname(process.execPath);
	const dir = mkdtempSync(join(realOs.tmpdir(), "hobo-cue-host-"));
	dirs.push(dir);
	return dir;
}

describe("hosts the download supports", () => {
	for (const [platform, expected] of [
		["linux", "linux"],
		["darwin", "darwin"],
		["win32", "windows"],
	] as const) {
		it(`accepts ${platform}`, async () => {
			const { ensureCueBinary } = await withHost({ platform, arch: "x64" });
			// It gets past the platform switch — whatever happens next (a fetch, a
			// tar failure) is not a *platform* refusal.
			await expect(ensureCueBinary(repoWithoutCache())).rejects.not.toThrow(
				/unsupported platform/,
			);
			expect(expected).toBeTruthy();
		});
	}

	for (const arch of ["x64", "arm64"] as const) {
		it(`accepts ${arch}`, async () => {
			const { ensureCueBinary } = await withHost({ platform: "linux", arch });
			await expect(ensureCueBinary(repoWithoutCache())).rejects.not.toThrow(
				/unsupported architecture/,
			);
		});
	}
});

describe("hosts the download refuses", () => {
	it("refuses a platform it has no build for", async () => {
		const { ensureCueBinary } = await withHost({
			platform: "sunos",
			arch: "x64",
		});
		// Refused before any network call: fetching an archive that does not
		// exist would surface as a 404 with no explanation of why.
		await expect(ensureCueBinary(repoWithoutCache())).rejects.toThrow(
			/unsupported platform for CUE download/,
		);
	});

	it("names the platform it rejected", async () => {
		const { ensureCueBinary } = await withHost({
			platform: "aix",
			arch: "x64",
		});
		// "unsupported platform" alone tells someone on AIX nothing they did not
		// already know.
		await expect(ensureCueBinary(repoWithoutCache())).rejects.toThrow(/aix/);
	});

	it("refuses an architecture it has no build for", async () => {
		const { ensureCueBinary } = await withHost({
			platform: "linux",
			arch: "s390x",
		});
		await expect(ensureCueBinary(repoWithoutCache())).rejects.toThrow(
			/unsupported architecture for CUE download/,
		);
	});

	it("names the architecture it rejected", async () => {
		const { ensureCueBinary } = await withHost({
			platform: "linux",
			arch: "ppc64",
		});
		await expect(ensureCueBinary(repoWithoutCache())).rejects.toThrow(/ppc64/);
	});

	it("checks the platform before the architecture", async () => {
		const { ensureCueBinary } = await withHost({
			platform: "sunos",
			arch: "s390x",
		});
		// Both are wrong. Reporting the platform first is right: an unsupported
		// platform makes the architecture irrelevant, and naming both would read
		// as two separate problems to solve.
		await expect(ensureCueBinary(repoWithoutCache())).rejects.toThrow(
			/unsupported platform/,
		);
	});
});
