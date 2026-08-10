/**
 * ZeroDeploy Drop API — anon static/site hosting (no auth).
 * POST https://api.zerodeploy.dev/drop — tar.gz → live URL (72h).
 * NOT a Docker/OCI runner — reject for Convex/Wasp server kinds.
 * Sources: zerodeploy.dev/agents (checked 2026-08).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	AnonContainerHostError,
	type AnonContainerDeployInput,
	type AnonContainerHostResult,
} from "./types.mts";

export const ZERODEPLOY_DROP_URL = "https://api.zerodeploy.dev/drop";
export const ZERODEPLOY_TIMEOUT_MS = 45_000;

async function tarGzDir(workDir: string): Promise<Buffer> {
	const staging = await mkdtemp(path.join(tmpdir(), "hobo-zd-tar-"));
	const outFile = path.join(staging, "site.tar.gz");
	try {
		const code = await new Promise<number>((resolve, reject) => {
			const child = spawn("tar", ["czf", outFile, "-C", workDir, "."], {
				stdio: ["ignore", "ignore", "pipe"],
			});
			child.on("error", reject);
			child.on("close", (c) => resolve(c ?? 1));
		});
		if (code !== 0) {
			throw new AnonContainerHostError(
				"zerodeploy",
				`tar czf failed (exit ${code})`,
			);
		}
		return await readFile(outFile);
	} finally {
		await rm(staging, { recursive: true, force: true }).catch(() => {});
	}
}

export async function provisionZerodeployDrop(
	input: AnonContainerDeployInput,
): Promise<AnonContainerHostResult> {
	if (input.mock) {
		return {
			ok: true,
			host: "zerodeploy",
			url: "https://mock-site.zerodeploy.app",
			claimUrl: "https://dashboard.zerodeploy.dev/drop-claim?token=mock",
			kind: "node-source",
			anonymous: true,
			temporary: true,
			mocked: true,
			detail: "mock ZeroDeploy Drop (static/tar only — not OCI)",
		};
	}

	const archive = await tarGzDir(input.workDir);
	const fetchImpl = input.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ZERODEPLOY_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetchImpl(ZERODEPLOY_DROP_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/gzip",
				...(input.projectHint
					? { "X-ZeroDeploy-Name": input.projectHint.slice(0, 64) }
					: {}),
			},
			body: archive,
			signal: input.signal ?? controller.signal,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new AnonContainerHostError(
			"zerodeploy",
			`ZeroDeploy Drop unreachable (one-shot): ${reason}`,
		);
	} finally {
		clearTimeout(timer);
	}

	const text = await response.text();
	let parsed: Record<string, unknown> = {};
	try {
		parsed = JSON.parse(text) as Record<string, unknown>;
	} catch {
		/* raw */
	}
	if (!response.ok) {
		throw new AnonContainerHostError(
			"zerodeploy",
			`ZeroDeploy Drop failed HTTP ${response.status}: ${text.slice(0, 400)}`,
			response.status,
		);
	}
	// Live shape (2026-08): { data: { url, claim_token, expires_at }, next_steps? }
	const data =
		parsed.data && typeof parsed.data === "object"
			? (parsed.data as Record<string, unknown>)
			: parsed;
	const url = typeof data.url === "string" ? data.url : "";
	if (!url) {
		throw new AnonContainerHostError(
			"zerodeploy",
			`ZeroDeploy response missing url: ${text.slice(0, 400)}`,
		);
	}
	const claimToken =
		typeof data.claim_token === "string" ? data.claim_token : "";
	const next = (parsed.next_steps ?? data.next_steps) as
		| { claim?: { url?: string } }
		| undefined;
	return {
		ok: true,
		host: "zerodeploy",
		url,
		claimUrl:
			(typeof next?.claim?.url === "string" && next.claim.url) ||
			(claimToken
				? `https://dashboard.zerodeploy.dev/drop-claim?token=${claimToken}`
				: undefined),
		expiresAt:
			typeof data.expires_at === "string" ? data.expires_at : undefined,
		kind: "node-source",
		anonymous: true,
		temporary: true,
		detail: "ZeroDeploy Drop — static/tar.gz only (not Docker/OCI)",
	};
}
