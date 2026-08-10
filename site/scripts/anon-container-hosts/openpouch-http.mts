/**
 * OpenPouch Instant Lane via HTTP (proven anon container competitor baseline).
 * POST https://openpouch.sh/api/deployments — gzip tarball, no API key = anonymous.
 * Docs: openpouch INSTANT-LANE.md — anon cgroup memory.max=256MiB.
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

export const OPENPOUCH_DEPLOY_URL = "https://openpouch.sh/api/deployments";
export const OPENPOUCH_ANON_MEMORY_MAX_BYTES = 268_435_456;

/** Gzipped tar of workDir via system `tar` (no new npm deps). */
export async function gzipTarballOfDir(workDir: string): Promise<Buffer> {
	const staging = await mkdtemp(path.join(tmpdir(), "hobo-op-tar-"));
	const outFile = path.join(staging, "bundle.tgz");
	try {
		const code = await new Promise<number>((resolve, reject) => {
			const child = spawn(
				"tar",
				["czf", outFile, "-C", workDir, "."],
				{ stdio: ["ignore", "ignore", "pipe"] },
			);
			let err = "";
			child.stderr?.on("data", (c) => {
				err += String(c);
			});
			child.on("error", reject);
			child.on("close", (c) => resolve(c ?? 1));
			void err;
		});
		if (code !== 0) {
			throw new AnonContainerHostError(
				"openpouch-http",
				`tar czf failed (exit ${code}) for ${workDir}`,
			);
		}
		return await readFile(outFile);
	} finally {
		await rm(staging, { recursive: true, force: true }).catch(() => {});
	}
}

function envHeader(
	env: Readonly<Record<string, string>> | undefined,
): string | undefined {
	if (!env || Object.keys(env).length === 0) return undefined;
	return Buffer.from(JSON.stringify(env), "utf8").toString("base64");
}

export async function provisionOpenpouchHttp(
	input: AnonContainerDeployInput,
): Promise<AnonContainerHostResult> {
	if (input.mock) {
		const id = `mock-${Date.now().toString(36)}`;
		return {
			ok: true,
			host: "openpouch-http",
			url: `https://${id}.openpouch.sh`,
			claimUrl: `https://openpouch.sh/claim/${id}?token=mock`,
			kind: "node-source",
			anonymous: true,
			temporary: true,
			mocked: true,
			detail: `anon memory.max=${OPENPOUCH_ANON_MEMORY_MAX_BYTES}`,
		};
	}

	const body = await gzipTarballOfDir(input.workDir);
	const headers: Record<string, string> = {
		"Content-Type": "application/gzip",
		"X-Openpouch-Project": (input.projectHint ?? "hobo-anon").slice(0, 64),
	};
	const envB64 = envHeader(input.env);
	if (envB64) headers["x-openpouch-env"] = envB64;

	const fetchImpl = input.fetchImpl ?? fetch;
	const response = await fetchImpl(OPENPOUCH_DEPLOY_URL, {
		method: "POST",
		headers,
		body,
		signal: input.signal,
	});
	const text = await response.text();
	let parsed: Record<string, unknown> = {};
	try {
		parsed = JSON.parse(text) as Record<string, unknown>;
	} catch {
		/* keep raw */
	}
	if (!response.ok) {
		throw new AnonContainerHostError(
			"openpouch-http",
			`OpenPouch HTTP deploy failed HTTP ${response.status}: ${text.slice(0, 400)}`,
			response.status,
		);
	}
	const url = typeof parsed.url === "string" ? parsed.url : "";
	if (!url) {
		throw new AnonContainerHostError(
			"openpouch-http",
			`OpenPouch response missing url: ${text.slice(0, 400)}`,
		);
	}
	return {
		ok: true,
		host: "openpouch-http",
		url,
		claimUrl:
			typeof parsed.claimUrl === "string" ? parsed.claimUrl : undefined,
		expiresAt:
			typeof parsed.expiresAt === "string" ? parsed.expiresAt : undefined,
		kind: "node-source",
		anonymous: true,
		temporary: true,
		detail: `anon memory.max=${OPENPOUCH_ANON_MEMORY_MAX_BYTES}`,
	};
}
