import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type LocalRunnerJitRequest,
	LocalRunnerApiRejectedError,
	parseLocalRunnerEnvironment,
	runLocalRunnerSession,
} from "../src/local-runner.js";

const scratch: string[] = [];
function fixture(exitCode = 0) {
	const directory = mkdtempSync(join(tmpdir(), "hobo-local-runner-test-"));
	scratch.push(directory);
	const source = join(directory, "source");
	const state = join(directory, "state");
	mkdirSync(source);
	mkdirSync(state);
	const proof = join(directory, "proof");
	writeFileSync(
		join(source, "run.sh"),
		`#!/bin/sh
set -eu
test "$1" = --jitconfig
test "$2" = c2VjcmV0
test -z "\${GH_TOKEN:-}\${GITHUB_TOKEN:-}\${AWS_ACCESS_KEY_ID:-}\${HOBO_CI_LOCAL_TRUSTED:-}"
test "$HOME" != /controller-home
test -d "$HOME"
test -d "$TMPDIR"
pwd > '${proof}'
exit ${exitCode}
`,
		{ mode: 0o755 },
	);
	const archive = join(directory, "fixture.tar.gz");
	execFileSync("tar", ["czf", archive, "-C", source, "run.sh"]);
	const calls: {
		method: string;
		path: string;
		body?: LocalRunnerJitRequest;
	}[] = [];
	const api = async (
		method: "GET" | "POST" | "DELETE",
		path: string,
		body?: LocalRunnerJitRequest,
	) => {
		calls.push({ method, path, body });
		if (method === "GET") return { full_name: "owner/repo", private: true };
		if (method === "POST")
			return { runner: { id: 41 }, encoded_jit_config: "c2VjcmV0" };
		return null;
	};
	return { directory, state, archive, proof, calls, api };
}
afterEach(() => {
	for (const path of scratch.splice(0))
		rmSync(path, { recursive: true, force: true });
});

describe("local runner lifecycle contract", () => {
	it("requires explicit repository-wide local machine trust", () => {
		expect(() =>
			parseLocalRunnerEnvironment({ HOBO_CI_LOCAL_REPOSITORY: "owner/repo" }),
		).toThrow(/TRUSTED/);
		expect(
			parseLocalRunnerEnvironment({
				HOBO_CI_LOCAL_REPOSITORY: "owner/repo",
				HOBO_CI_LOCAL_TRUSTED: "1",
			}),
		).toBe("owner/repo");
		expect(() =>
			parseLocalRunnerEnvironment({
				HOBO_CI_LOCAL_REPOSITORY: "../repo",
				HOBO_CI_LOCAL_TRUSTED: "1",
			}),
		).toThrow();
	});
	it.each([
		"owner/.github",
		"owner/-private",
		"owner/.dotfiles",
	])("accepts valid GitHub repository %s", (repository) => {
		expect(
			parseLocalRunnerEnvironment({
				HOBO_CI_LOCAL_REPOSITORY: repository,
				HOBO_CI_LOCAL_TRUSTED: "1",
			}),
		).toBe(repository);
	});
	it.each(["owner/.", "owner/.."])("refuses path segment %s", (repository) => {
		expect(() =>
			parseLocalRunnerEnvironment({
				HOBO_CI_LOCAL_REPOSITORY: repository,
				HOBO_CI_LOCAL_TRUSTED: "1",
			}),
		).toThrow();
	});
	it("registers only the host label, executes once without controller secrets, then removes runner and workspace", async () => {
		const f = fixture();
		await runLocalRunnerSession({
			...f,
			repository: "owner/repo",
			env: {
				PATH: process.env.PATH,
				HOME: "/controller-home",
				GH_TOKEN: "controller-secret",
				GITHUB_TOKEN: "controller-secret",
				AWS_ACCESS_KEY_ID: "controller-secret",
				HOBO_CI_LOCAL_TRUSTED: "1",
			},
		});
		expect(f.calls).toEqual([
			{ method: "GET", path: "/repos/owner/repo" },
			{
				method: "POST",
				path: "/repos/owner/repo/actions/runners/generate-jitconfig",
				body: {
					name: expect.stringMatching(/^hobo-local-/),
					runner_group_id: 1,
					labels: ["hobo-local-host"],
					work_folder: "_work",
				},
			},
			{ method: "DELETE", path: "/repos/owner/repo/actions/runners/41" },
		]);
		expect(existsSync(f.proof)).toBe(true);
		expect(existsSync(readFileSync(f.proof, "utf8").trim())).toBe(false);
		expect(readdirSync(f.state)).toEqual([]);
	});
	it("cleans a failed runner instead of reusing its workspace", async () => {
		const f = fixture(7);
		await expect(
			runLocalRunnerSession({ ...f, repository: "owner/repo" }),
		).rejects.toThrow(/failed/);
		expect(f.calls.at(-1)?.method).toBe("DELETE");
		expect(readdirSync(f.state)).toEqual([]);
	});
	it.each([
		"public",
		"renamed",
	])("refuses %s repository before registration", async (condition) => {
		const f = fixture();
		const api = async () => ({
			full_name: condition === "renamed" ? "other/repo" : "owner/repo",
			private: condition !== "public",
		});
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow();
		expect(existsSync(f.proof)).toBe(false);
		expect(readdirSync(f.state)).toEqual([]);
	});
	it("does not launch when stopped during registration, but still removes the registration", async () => {
		const f = fixture();
		const signal = new AbortController();
		const api: typeof f.api = async (...args) => {
			const response = await f.api(...args);
			if (args[0] === "POST") signal.abort();
			return response;
		};
		await expect(
			runLocalRunnerSession({
				...f,
				api,
				repository: "owner/repo",
				signal: signal.signal,
			}),
		).rejects.toThrow();
		expect(existsSync(f.proof)).toBe(false);
		expect(f.calls.at(-1)?.method).toBe("DELETE");
	});
	it("retries failed removal before registering another host", async () => {
		const f = fixture();
		const api: typeof f.api = async (...args) => {
			if (args[0] === "DELETE")
				throw new Error("removal temporarily unavailable");
			return f.api(...args);
		};
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow(/removal/);
		expect(
			JSON.parse(readFileSync(join(f.state, "registration.json"), "utf8")),
		).toEqual({ repository: "owner/repo", id: 41, uncertain: false });
		f.calls.length = 0;
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow(/removal/);
		expect(f.calls).toEqual([]);
		await runLocalRunnerSession({ ...f, repository: "owner/repo" });
		expect(f.calls[0]).toEqual({
			method: "DELETE",
			path: "/repos/owner/repo/actions/runners/41",
			body: undefined,
		});
		expect(readdirSync(f.state)).toEqual([]);
	});
	it("fences an interrupted runner after restart until shutdown is verified", async () => {
		const f = fixture();
		writeFileSync(
			join(f.state, "registration.json"),
			JSON.stringify({ repository: "owner/repo", id: 41, uncertain: true }),
		);
		await expect(
			runLocalRunnerSession({ ...f, repository: "owner/repo" }),
		).rejects.toThrow(/shutdown is uncertain/);
		expect(f.calls).toEqual([]);
		expect(existsSync(f.proof)).toBe(false);
	});
	it("records registration intent and fences a lost POST response across restarts", async () => {
		const f = fixture();
		let creations = 0;
		const api: typeof f.api = async (...args) => {
			if (args[0] === "POST") {
				creations++;
				throw new Error("response lost after registration");
			}
			return f.api(...args);
		};
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow(/registration is uncertain/);
		expect(
			JSON.parse(readFileSync(join(f.state, "registration.json"), "utf8")),
		).toMatchObject({
			repository: "owner/repo",
			name: expect.stringMatching(/^hobo-local-/),
			uncertain: true,
		});
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow(/registration is uncertain/);
		expect(creations).toBe(1);
		expect(existsSync(f.proof)).toBe(false);
	});
	it("retries a known API refusal without retaining an ambiguous registration", async () => {
		const f = fixture();
		const api: typeof f.api = async (...args) => {
			if (args[0] === "POST") throw new LocalRunnerApiRejectedError();
			return f.api(...args);
		};
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow(/authentication/);
		expect(readdirSync(f.state)).toEqual([]);
	});
	it("removes a known runner ID even when its JIT credential is malformed", async () => {
		const f = fixture();
		const api: typeof f.api = async (...args) => {
			if (args[0] === "POST")
				return { runner: { id: 41 }, encoded_jit_config: "invalid!*" };
			return f.api(...args);
		};
		await expect(
			runLocalRunnerSession({ ...f, api, repository: "owner/repo" }),
		).rejects.toThrow();
		expect(f.calls.at(-1)).toMatchObject({
			method: "DELETE",
			path: "/repos/owner/repo/actions/runners/41",
		});
		expect(readdirSync(f.state)).toEqual([]);
		expect(existsSync(f.proof)).toBe(false);
	});
});
