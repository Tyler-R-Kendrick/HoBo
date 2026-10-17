/**
 * What an operator or the environment hands the pin code is read exactly:
 * two repository URLs are the same only when git would treat them so (the
 * scheme and host fold case, the path does not), and a URL that names the
 * pin's own repository is not announced or rewritten as a move.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { sameRepo } from "../lib/pins-git.ts";
import {
	type FileServer,
	runBootstrapAsync,
	scratch,
	sha256Hex,
	startServer,
	writeManifest,
} from "./support/pins-support.ts";

let server: FileServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

const OLD = Buffer.from("old build\n");
const NEW = Buffer.from("new build, longer\n");

/** A one-target pin of `mirror` at v1.0.0, and v2.0.0 published by the same server. */
async function released(): Promise<{
	root: string;
	srv: FileServer;
	repo: string;
	manifest: string;
}> {
	const srv = await startServer();
	server = srv;
	const root = scratch("inputs");
	const repo = `${srv.origin}/example/mirror`;
	const file = {
		url: `${srv.origin}/old`,
		sha256: sha256Hex(OLD),
		size: OLD.byteLength,
		entry: "mirror",
	};
	writeManifest(
		root,
		`{"mirror":{"repo":"${repo}","tag":"v1.0.0","files":{"linux-x64":${JSON.stringify(file)}}}}`,
	);
	const base = "/example/mirror/releases/download/v2.0.0";
	srv.setFile(`${base}/mirror-linux-x64`, NEW);
	srv.setFile(`${base}/SHA256SUMS`, `${sha256Hex(NEW)}  mirror-linux-x64\n`);
	return { root, srv, repo, manifest: join(root, "tools/pins/siblings.json") };
}

describe("sameRepo", () => {
	it("folds the case of the scheme and the host, never of the path", () => {
		assert.equal(
			sameRepo(
				"HTTPS://Git.Example.com/Org/Repo.git/",
				"https://git.example.com/Org/Repo",
			),
			true,
		);
		assert.equal(
			sameRepo(
				"https://git.example.com/Org/Repo",
				"https://git.example.com/org/repo",
			),
			false,
			"a case-sensitive host serves these as two repositories",
		);
		assert.equal(sameRepo("/srv/A/r", "/srv/a/r"), false);
	});
});

describe("bump --repo naming the pin's own repository", () => {
	for (const spelling of ["/", ".git"]) {
		it(`with a trailing ${spelling} is not a move: nothing announced, the text kept`, async () => {
			const { root, repo, manifest } = await released();
			const run = await runBootstrapAsync(root, [
				"--bump",
				"mirror",
				"v2.0.0",
				"--repo",
				`${repo}${spelling}`,
			]);
			assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
			assert.doesNotMatch(run.stdout, /repo:/u);
			assert.equal(
				JSON.parse(readFileSync(manifest, "utf8")).assets.mirror.repo,
				repo,
			);
		});
	}
});
