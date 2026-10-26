import { createSign } from "node:crypto";
import { z } from "zod";

export interface GithubTransport {
	request(
		installationId: number,
		path: string,
		method?: "GET" | "POST" | "DELETE",
		body?: string,
	): Promise<Response>;
}
const Run = z.object({
	id: z.number().int().positive(),
	run_attempt: z.number().int().positive(),
	event: z.string(),
	head_sha: z.string(),
	head_branch: z.string().nullable(),
	path: z.string(),
	display_title: z.string(),
	status: z.string(),
	conclusion: z.string().nullable(),
	run_started_at: z.string().nullable(),
	updated_at: z.string(),
	actor: z.object({ id: z.number().int().positive() }),
	repository: z.object({
		id: z.number().int().positive(),
		private: z.boolean(),
	}),
	head_repository: z.object({ id: z.number().int().positive() }).nullable(),
});
export type GithubRun = z.infer<typeof Run>;
export async function getRun(
	api: GithubTransport,
	installationId: number,
	repository: string,
	runId: number,
): Promise<GithubRun> {
	const response = await api.request(
		installationId,
		`/repos/${repository}/actions/runs/${runId}`,
	);
	if (!response.ok)
		throw new Error(`GitHub run lookup failed (${response.status})`);
	return Run.parse(await response.json());
}
export async function getHostJob(
	api: GithubTransport,
	installationId: number,
	repository: string,
	runId: number,
) {
	const response = await api.request(
		installationId,
		`/repos/${repository}/actions/runs/${runId}/jobs`,
	);
	if (!response.ok)
		throw new Error(`GitHub host job lookup failed (${response.status})`);
	const result = z
		.object({
			jobs: z.array(
				z.object({
					name: z.string(),
					labels: z.array(z.string()),
					status: z.string(),
					started_at: z.string().nullable(),
					completed_at: z.string().nullable(),
				}),
			),
		})
		.parse(await response.json());
	if (result.jobs.length !== 1 || result.jobs[0]?.name !== "host")
		throw new Error("unexpected host job graph");
	return result.jobs[0];
}
export async function getJob(
	api: GithubTransport,
	installationId: number,
	repository: string,
	jobId: number,
) {
	const response = await api.request(
		installationId,
		`/repos/${repository}/actions/jobs/${jobId}`,
	);
	if (!response.ok)
		throw new Error(`GitHub job lookup failed (${response.status})`);
	return z
		.object({
			id: z.number().int().positive(),
			run_id: z.number().int().positive(),
			status: z.string(),
			labels: z.array(z.string()),
		})
		.parse(await response.json());
}

/** Installation credentials stay in the relay. Broker injection is supported by GithubTransport. */
export function createGithubAppTransport(options: {
	appId: string;
	privateKey: string;
	fetch?: typeof fetch;
	now?: () => number;
}): GithubTransport {
	const send = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	return {
		async request(installationId, path, method = "GET", body) {
			if (
				!/^\/(repos|app)\/[A-Za-z0-9_./-]+(?:\?event=workflow_dispatch&per_page=100)?$/.test(
					path,
				) ||
				path.includes("..")
			)
				throw new Error("invalid GitHub API path");
			const issued = Math.floor(now() / 1000) - 60;
			const header = Buffer.from(
				JSON.stringify({ alg: "RS256", typ: "JWT" }),
			).toString("base64url");
			const payload = Buffer.from(
				JSON.stringify({ iat: issued, exp: issued + 600, iss: options.appId }),
			).toString("base64url");
			const signingInput = `${header}.${payload}`;
			const signature = createSign("RSA-SHA256")
				.update(signingInput)
				.sign(options.privateKey)
				.toString("base64url");
			const common = {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
				"Content-Type": "application/json",
			};
			const tokenResponse = await send(
				`https://api.github.com/app/installations/${installationId}/access_tokens`,
				{
					method: "POST",
					headers: {
						...common,
						Authorization: `Bearer ${signingInput}.${signature}`,
					},
					redirect: "error",
					signal: AbortSignal.timeout(15000),
				},
			);
			if (!tokenResponse.ok)
				throw new Error(
					`GitHub App authentication failed (${tokenResponse.status})`,
				);
			const token = z
				.object({ token: z.string().min(1) })
				.parse(await tokenResponse.json()).token;
			const init: RequestInit = {
				method,
				headers: { ...common, Authorization: `Bearer ${token}` },
				redirect: "error",
				signal: AbortSignal.timeout(15000),
			};
			if (body !== undefined) init.body = body;
			return send(`https://api.github.com${path}`, init);
		},
	};
}
