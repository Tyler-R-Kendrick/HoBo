/**
 * Failed-run scanner: the reactive backstop. Pulls the most recent failed
 * workflow runs plus their jobs and check-run annotations, and shapes them
 * into classifier evidence. Read-only, best-effort, tightly capped — a
 * scan that cannot complete yields no evidence rather than an error.
 */

import type { FailedJobEvidence } from "../classify.js";
import type { FetchLike } from "./github-billing.js";

export interface ActionsRunsOptions {
	owner: string;
	repo: string;
	token?: string | undefined;
	apiBase?: string;
	fetchImpl?: FetchLike;
	/** Failed runs to inspect (most recent first). */
	maxRuns?: number;
}

interface JobsResponse {
	jobs?: Array<{
		id?: number;
		conclusion?: string | null;
		labels?: string[];
		steps?: Array<{ started_at?: string | null }>;
	}>;
}

export async function collectFailedJobEvidence(
	options: ActionsRunsOptions,
): Promise<FailedJobEvidence[]> {
	if (options.token === undefined || options.token === "") return [];
	const apiBase = options.apiBase ?? "https://api.github.com";
	const fetchImpl = options.fetchImpl ?? fetch;
	const maxRuns = options.maxRuns ?? 5;
	const repoBase = `${apiBase}/repos/${options.owner}/${options.repo}`;
	const headers = {
		Authorization: `Bearer ${options.token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "hobo-example-ci-runner-balancing",
	};

	async function readJson(url: string): Promise<unknown | undefined> {
		try {
			const response = await fetchImpl(url, { headers });
			if (!response.ok) return undefined;
			return await response.json();
		} catch {
			return undefined;
		}
	}

	const runsBody = (await readJson(
		`${repoBase}/actions/runs?status=failure&per_page=${maxRuns}`,
	)) as { workflow_runs?: Array<{ id?: number }> } | undefined;
	const runs = runsBody?.workflow_runs ?? [];

	const evidence: FailedJobEvidence[] = [];
	for (const run of runs.slice(0, maxRuns)) {
		if (typeof run.id !== "number") continue;
		const jobsBody = (await readJson(
			`${repoBase}/actions/runs/${run.id}/jobs?per_page=20`,
		)) as JobsResponse | undefined;
		for (const job of jobsBody?.jobs ?? []) {
			if (job.conclusion !== "failure" || typeof job.id !== "number") continue;
			const annotations = (await readJson(
				`${repoBase}/check-runs/${job.id}/annotations`,
			)) as Array<{ title?: string | null; message?: string | null }> | undefined;
			evidence.push({
				conclusion: "failure",
				labels: job.labels ?? [],
				texts: (annotations ?? []).flatMap((annotation) => [
					annotation.title ?? "",
					annotation.message ?? "",
				]),
				startedStepCount: (job.steps ?? []).filter(
					(step) => step.started_at !== null && step.started_at !== undefined,
				).length,
			});
		}
	}
	return evidence;
}
