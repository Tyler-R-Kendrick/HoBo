import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PactV3, type V3Request, type V3Response } from "@pact-foundation/pact";
import { z } from "zod";
import {
	githubLocalRunnerApi,
	type LocalRunnerJitRequest,
} from "../src/local-runner.js";

export const githubConsumer = "HoboCiLocalController";
export const githubProvider = "GitHubActionsRest";
const repositoryPath = "/repos/owner/repo";
const jitPath = `${repositoryPath}/actions/runners/generate-jitconfig`;
const deletePath = `${repositoryPath}/actions/runners/31`;
const headers = {
	Accept: "application/vnd.github+json",
	"X-GitHub-Api-Version": "2022-11-28",
};
const body: LocalRunnerJitRequest = {
	name: "hobo-local-fixture",
	runner_group_id: 1,
	labels: ["hobo-local-host"],
	work_folder: "_work",
};
const cases = [
	{
		name: "private repository",
		method: "GET",
		path: repositoryPath,
		status: 200,
		response: { full_name: "owner/repo", private: true },
	},
	{
		name: "public repository visibility",
		method: "GET",
		path: repositoryPath,
		status: 200,
		response: { full_name: "owner/repo", private: false },
	},
	{
		name: "repository identity changed",
		method: "GET",
		path: repositoryPath,
		status: 200,
		response: { full_name: "owner/renamed", private: true },
	},
	{
		name: "repository authentication revoked",
		method: "GET",
		path: repositoryPath,
		status: 401,
		response: { message: "Bad credentials" },
	},
	{
		name: "repository administration forbidden",
		method: "GET",
		path: repositoryPath,
		status: 403,
		response: { message: "Forbidden" },
	},
	{
		name: "repository missing",
		method: "GET",
		path: repositoryPath,
		status: 404,
		response: { message: "Not Found" },
	},
	{
		name: "host JIT issued",
		method: "POST",
		path: jitPath,
		status: 201,
		response: { runner: { id: 31 }, encoded_jit_config: "c2VjcmV0" },
	},
	{
		name: "host JIT permission refused",
		method: "POST",
		path: jitPath,
		status: 403,
		response: { message: "Forbidden" },
	},
	{
		name: "host JIT invalid request",
		method: "POST",
		path: jitPath,
		status: 422,
		response: { message: "Validation Failed" },
	},
	{
		name: "host JIT outcome uncertain",
		method: "POST",
		path: jitPath,
		status: 503,
		response: { message: "Unavailable" },
	},
	{
		name: "host JIT missing credential retains ID",
		method: "POST",
		path: jitPath,
		status: 201,
		response: { runner: { id: 31 } },
	},
	{
		name: "host JIT malformed response",
		method: "POST",
		path: jitPath,
		status: 201,
		response: { unexpected: true },
		invalid: true,
	},
	{
		name: "host cleanup confirmed",
		method: "DELETE",
		path: deletePath,
		status: 204,
	},
	{
		name: "host cleanup already removed",
		method: "DELETE",
		path: deletePath,
		status: 404,
		response: { message: "Not Found" },
	},
	{
		name: "host cleanup permission revoked",
		method: "DELETE",
		path: deletePath,
		status: 403,
		response: { message: "Forbidden" },
	},
	{
		name: "host cleanup temporarily unavailable",
		method: "DELETE",
		path: deletePath,
		status: 503,
		response: { message: "Unavailable" },
	},
] as const;
export const githubScenarios = cases.map((item) => item.name);

export async function generateGithubRunnerPact(
	directory: string,
): Promise<string> {
	await mkdir(directory, { recursive: true });
	const bin = join(directory, "bin");
	await mkdir(bin);
	const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
	await writeFile(
		join(bin, "gh"),
		`#!/bin/sh\nexec ${quote(process.execPath)} --experimental-strip-types ${quote(fileURLToPath(new URL("./fixtures/gh-pact.ts", import.meta.url)))} "$@"\n`,
		{ mode: 0o700 },
	);
	const originalPath = process.env.PATH;
	const originalOrigin = process.env.HOBO_PACT_GITHUB_ORIGIN;
	const pact = new PactV3({
		consumer: githubConsumer,
		provider: githubProvider,
		dir: directory,
		logLevel: "error",
	});
	try {
		process.env.PATH = `${bin}:${originalPath ?? ""}`;
		for (const item of cases) {
			const request: V3Request = {
				method: item.method,
				path: item.path,
				headers,
			};
			if (item.method === "POST") {
				request.body = body;
				request.headers = { ...headers, "Content-Type": "application/json" };
			}
			const response: V3Response = { status: item.status };
			if ("response" in item) {
				response.headers = { "Content-Type": "application/json" };
				response.body = item.response;
			}
			pact
				.given(item.name)
				.uponReceiving(item.name)
				.withRequest(request)
				.willRespondWith(response);
			await pact.executeTest(async (mock) => {
				process.env.HOBO_PACT_GITHUB_ORIGIN = mock.url;
				const operation = githubLocalRunnerApi(
					item.method,
					item.path,
					item.method === "POST" ? body : undefined,
				);
				if (item.method === "DELETE" && [204, 404].includes(item.status))
					assert.equal(await operation, null);
				else if (item.status >= 400 || "invalid" in item)
					await assert.rejects(operation);
				else {
					assert.ok("response" in item);
					assert.deepEqual(await operation, item.response);
				}
			});
		}
	} finally {
		if (originalPath === undefined) delete process.env.PATH;
		else process.env.PATH = originalPath;
		if (originalOrigin === undefined)
			delete process.env.HOBO_PACT_GITHUB_ORIGIN;
		else process.env.HOBO_PACT_GITHUB_ORIGIN = originalOrigin;
	}
	const file = join(directory, `${githubConsumer}-${githubProvider}.json`);
	const parsed = z
		.object({ interactions: z.array(z.object({ description: z.string() })) })
		.parse(JSON.parse(await readFile(file, "utf8")));
	assert.deepEqual(
		parsed.interactions.map((item) => item.description).sort(),
		[...githubScenarios].sort(),
	);
	return file;
}
