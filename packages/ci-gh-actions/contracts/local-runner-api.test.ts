import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { githubLocalRunnerApi } from "../src/local-runner.js";

const directories: string[] = [];
const originalPath = process.env.PATH;
afterEach(() => {
	process.env.PATH = originalPath;
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});
function provider(response: string, status = 0) {
	const directory = mkdtempSync(join(tmpdir(), "hobo-local-gh-contract-"));
	directories.push(directory);
	const evidence = join(directory, "request.json");
	writeFileSync(
		join(directory, "gh"),
		`#!${process.execPath}
const fs = require('node:fs');
let body = '';
process.stdin.on('data', data => body += data);
function respond() {
  fs.writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({args:process.argv.slice(2),body}));
  process.${status === 0 ? "stdout" : "stderr"}.write(${JSON.stringify(response)});
  process.exitCode = ${status};
}
if (process.argv.includes('--input')) process.stdin.on('end', respond);
else respond();
`,
		{ mode: 0o755 },
	);
	process.env.PATH = `${directory}:${originalPath}`;
	return evidence;
}
describe("GitHub local runner REST wire contract", () => {
	it("posts JSON through stdin with explicit GitHub host/version and only the local host label", async () => {
		const evidence = provider(
			JSON.stringify({ runner: { id: 31 }, encoded_jit_config: "c2VjcmV0" }),
		);
		const body = {
			name: "hobo-local-fixture",
			runner_group_id: 1 as const,
			labels: ["hobo-local-host" as const],
			work_folder: "_work" as const,
		};
		await expect(
			githubLocalRunnerApi(
				"POST",
				"/repos/owner/repo/actions/runners/generate-jitconfig",
				body,
			),
		).resolves.toEqual({ runner: { id: 31 }, encoded_jit_config: "c2VjcmV0" });
		const request = JSON.parse(readFileSync(evidence, "utf8"));
		expect(request.args).toEqual([
			"api",
			"--hostname",
			"github.com",
			"--method",
			"POST",
			"-H",
			"Accept: application/vnd.github+json",
			"-H",
			"X-GitHub-Api-Version: 2022-11-28",
			"/repos/owner/repo/actions/runners/generate-jitconfig",
			"--input",
			"-",
		]);
		expect(JSON.parse(request.body)).toEqual(body);
	});
	it("parses repository visibility before handing it to the controller", async () => {
		provider('{"full_name":"owner/repo","private":true}');
		await expect(
			githubLocalRunnerApi("GET", "/repos/owner/repo"),
		).resolves.toEqual({ full_name: "owner/repo", private: true });
	});
	it("treats an already-removed runner as successful cleanup", async () => {
		provider("gh: Not Found (HTTP 404)", 1);
		await expect(
			githubLocalRunnerApi("DELETE", "/repos/owner/repo/actions/runners/31"),
		).resolves.toBeNull();
	});
	it("does not confuse permission failures with cleanup or expose CLI output", async () => {
		provider("gh: controller-secret (HTTP 403)", 1);
		await expect(
			githubLocalRunnerApi("DELETE", "/repos/owner/repo/actions/runners/31"),
		).rejects.toThrow(
			"GitHub runner API failed; check gh authentication and repository administration permission",
		);
	});
});
