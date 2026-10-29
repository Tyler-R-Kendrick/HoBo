import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import pact from "../contracts/live.pact.json" with { type: "json" };
import {
	adoPlanDigest,
	loadAdoProject,
	parseAdoLiveTarget,
	renderAzurePipeline,
	verifyLiveAdoPipeline,
} from "../src/index.js";

const targetData = {
	organizationUrl: "https://dev.azure.com/example",
	project: "HoBo",
	pipelineId: 7,
	refName: "refs/heads/main",
	sourceVersion: "a".repeat(40),
	tokenEnv: "ADO_TEST_PAT",
	authentication: "pat",
	timeoutSeconds: 5,
};
async function fixture(
	options: {
		hosted?: boolean;
		missingHosted?: boolean;
		wrongPool?: boolean;
		stalePreview?: boolean;
		badSource?: boolean;
		skipVerify?: boolean;
		ambiguous?: boolean;
		cancel?: boolean;
		compiledPreview?: boolean;
		invalidResponse?: boolean;
	} = {},
) {
	const { project, pipeline } = await loadAdoProject(
		new URL("../../..", import.meta.url).pathname,
		"packages/ci-ado/examples/ci.json",
	);
	const requests: { url: string; method: string; body: string | undefined }[] =
		[];
	let queued = false;
	let cancelled = false;
	const stop = new AbortController();
	const fake: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		const headers = new Headers(init?.headers);
		expect(headers.get("Authorization")).toBe(
			`Basic ${Buffer.from(":fixture-pat").toString("base64")}`,
		);
		expect(init?.redirect).toBe("error");
		expect(url.origin).toBe("https://dev.azure.com");
		const body = init?.body ? String(init.body) : undefined;
		requests.push({ url: String(url), method, body });

		if (url.pathname.endsWith("/pools")) {
			if (options.invalidResponse)
				return Response.json({ value: [{ id: "fixture-pat" }] });
			if (options.missingHosted)
				return Response.json({ value: [{ id: 3, name: "hobo-local" }] });
			return Response.json({
				value: [
					{ id: 3, name: "hobo-local", isHosted: options.hosted ?? false },
				],
			});
		}
		if (url.pathname.endsWith("/pipelines/7"))
			return Response.json({ id: 7, revision: 12 });
		if (url.pathname.endsWith("/runs")) {
			expect(url.searchParams.get("pipelineVersion")).toBe("12");
			const request = JSON.parse(body ?? "{}");
			expect(request.resources.repositories.self).toEqual({
				refName: targetData.refName,
				version: targetData.sourceVersion,
			});
			if (request.previewRun) {
				let yaml = renderAzurePipeline(
					project,
					pipeline,
					"packages/ci-ado/examples/ci.json",
				);
				if (options.wrongPool)
					yaml = yaml.replaceAll("name: hobo-local", "name: Azure Pipelines");
				if (options.stalePreview)
					yaml = yaml.replaceAll(
						adoPlanDigest(project, pipeline),
						"b".repeat(64),
					);
				if (options.compiledPreview) {
					const document = parse(yaml);
					for (const job of document.jobs) {
						for (const step of job.steps) {
							if (step.bash) {
								step.task = "Bash@3";
								step.inputs = { targetType: "inline", script: step.bash };
								delete step.bash;
							}
						}
					}
					yaml = stringify({
						stages: [{ stage: "__default", jobs: document.jobs }],
					});
				}
				return Response.json({ finalYaml: yaml });
			}
			queued = true;
			if (options.ambiguous) throw new Error("connection closed after POST");
			return Response.json({ id: 42 });
		}
		if (url.pathname.endsWith("/timeline")) {
			if (options.skipVerify) return Response.json({ records: [] });
			const response = pact.interactions[0]?.response[0]?.contents;
			if (!response) throw new Error("missing timeline Pact");
			return Response.json(response);
		}
		if (url.pathname.endsWith("/artifacts"))
			return Response.json({
				value: [
					{ name: "hobo-producer-1", resource: { type: "PipelineArtifact" } },
				],
			});
		if (url.pathname.endsWith("/builds/42")) {
			if (method === "PATCH") {
				cancelled = true;
				return Response.json({ id: 42 });
			}
			if (options.cancel && !cancelled) stop.abort();
			return Response.json({
				id: 42,
				status: cancelled
					? "completed"
					: options.cancel || options.badSource
						? "inProgress"
						: "completed",
				result: cancelled ? "canceled" : "succeeded",
				sourceVersion: options.badSource
					? "b".repeat(40)
					: targetData.sourceVersion,
				queue: { pool: { id: 3 } },
			});
		}
		throw new Error(`unexpected Azure endpoint ${url.pathname}`);
	};
	return {
		project,
		pipeline,
		requests,
		fake,
		signal: stop.signal,
		get queued() {
			return queued;
		},
		get cancelled() {
			return cancelled;
		},
	};
}
const run = (f: Awaited<ReturnType<typeof fixture>>) =>
	verifyLiveAdoPipeline(
		parseAdoLiveTarget(JSON.stringify(targetData)),
		f.project,
		f.pipeline,
		{
			fetch: f.fake,
			hostEnvironment: { ADO_TEST_PAT: "fixture-pat" },
			signal: f.signal,
			pollMilliseconds: 1,
		},
	);

describe("live Azure acceptance control plane", () => {
	it("accepts Azure-compiled Bash tasks inside an implicit stage", async () => {
		const f = await fixture({ compiledPreview: true });
		await expect(run(f)).resolves.toMatchObject({
			runId: 42,
			result: "succeeded",
		});
	});
	it("does not echo credential-like values from malformed Azure responses", async () => {
		const f = await fixture({ invalidResponse: true });
		await expect(run(f)).rejects.toThrow(/^invalid Azure REST response$/);
		expect(f.queued).toBe(false);
	});
	it("requires exact source, self-hosted pool, successful native tasks, and retained Pipeline Artifacts", async () => {
		const f = await fixture();
		const result = await run(f);
		expect(result).toMatchObject({
			runId: 42,
			result: "succeeded",
			pool: "hobo-local",
			sourceVersion: targetData.sourceVersion,
			artifactNames: ["hobo-producer-1"],
		});
		expect(
			f.requests.filter(
				(request) =>
					request.method === "POST" &&
					!JSON.parse(request.body ?? "{}").previewRun,
			),
		).toHaveLength(1);
	});
	it.each([
		{ hosted: true },
		{ missingHosted: true },
		{ wrongPool: true },
		{ stalePreview: true },
	])("refuses unsafe preview/pool state %j before allocating a run", async (options) => {
		const f = await fixture(options);
		await expect(run(f)).rejects.toThrow();
		expect(f.queued).toBe(false);
	});
	it("requires both real native upload/download verification tasks to finish", async () => {
		const f = await fixture({ skipVerify: true });
		await expect(run(f)).rejects.toThrow(/acceptance step/);
	});
	it("cancels and reconciles a run if source provenance disagrees", async () => {
		const f = await fixture({ badSource: true });
		await expect(run(f)).rejects.toThrow(/provenance/);
		expect(f.cancelled).toBe(true);
	});
	it("cancels the known run and confirms terminal state on interruption", async () => {
		const f = await fixture({ cancel: true });
		await expect(run(f)).rejects.toThrow();
		expect(f.cancelled).toBe(true);
	});
	it("does not retry an ambiguous queue POST or silently allocate twice", async () => {
		const f = await fixture({ ambiguous: true });
		await expect(run(f)).rejects.toThrow(/no automatic retry/);
		expect(
			f.requests.filter(
				(request) =>
					request.method === "POST" &&
					!JSON.parse(request.body ?? "{}").previewRun,
			),
		).toHaveLength(1);
	});
	it("requires configured authentication before network side effects", async () => {
		const f = await fixture();
		await expect(
			verifyLiveAdoPipeline(
				parseAdoLiveTarget(JSON.stringify(targetData)),
				f.project,
				f.pipeline,
				{ fetch: f.fake, hostEnvironment: {} },
			),
		).rejects.toThrow(/authentication is not configured/);
		expect(f.requests).toHaveLength(0);
	});
	it.each([
		{ organizationUrl: "https://dev.azure.com.attacker.test/org" },
		{ organizationUrl: "http://dev.azure.com/org" },
		{ sourceVersion: "main" },
		{ tokenEnv: "BAD-NAME" },
		{ timeoutSeconds: 0 },
		{ project: "../other" },
	])("rejects unsafe target %j", (fields) => {
		expect(() =>
			parseAdoLiveTarget(JSON.stringify({ ...targetData, ...fields })),
		).toThrow();
	});
});
