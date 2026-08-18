/**
 * Lakebed anonymous Environment Station provision (zero permanent LAKEBED_TOKEN).
 * Mirrors Cloudflare Temporary Accounts: publish first, claim later.
 *
 * Default transport shells `npx lakebed deploy` (anonymous). Tests inject a
 * transport — never requires live Lakebed or static credentials.
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	TEMPORARY_STATION_TTL_MS,
	type TemporaryEnvironmentStationResult,
	temporaryStationExpiresAt,
	temporaryStationTtlSeconds,
} from "@hobo/core";

import { LAKEBED_PROVIDER_TARGET } from "./options.js";

export const LAKEBED_TEMPORARY_PROVIDER_ID = LAKEBED_PROVIDER_TARGET;
export const supportsAnonymousTemporaryDeploy = true as const;
const LAKEBED_STATION_HOST = /(?:^|\.)lakebed\.app$/u;
const LAKEBED_CLAIM_HOST = "lakebed.dev";

function requireLakebedUrl(value: string, kind: "station" | "claim"): string {
	const parsed = new URL(value);
	if (parsed.protocol !== "https:")
		throw new Error(`lakebed ${kind} URL must use https`);
	if (kind === "station" && !LAKEBED_STATION_HOST.test(parsed.hostname)) {
		throw new Error("lakebed station URL has an unexpected host");
	}
	if (kind === "claim" && parsed.hostname !== LAKEBED_CLAIM_HOST) {
		throw new Error("lakebed claim URL has an unexpected host");
	}
	return value;
}

export type LakebedAnonymousDeployResult = {
	readonly deployId: string;
	readonly stationUrl: string;
	readonly claimUrl: string;
};

export type LakebedAnonymousTransport = {
	deployAnonymous(input: {
		readonly stationId: string;
		readonly capsuleDir: string;
	}): Promise<LakebedAnonymousDeployResult>;
};

export type LakebedTemporaryStationInput = {
	readonly stationId: string;
	readonly transport?: LakebedAnonymousTransport;
	/** When set, deploy this capsule directory instead of a scaffold. */
	readonly capsuleDir?: string;
	/** Override capsule server source for the scaffold. */
	readonly capsuleServerSource?: string;
};

const DEFAULT_CAPSULE_SERVER = `import { capsule, endpoint, json } from "lakebed/server";

export default capsule({
  schema: {},
  queries: {},
  mutations: {},
  endpoints: {
    health: endpoint(async () => json({ ok: true, provider: "lakebed", hobo: "environment-station" })),
  },
});
`;

/**
 * Parse `npx lakebed deploy` stdout for deploy URL / claim material.
 * Accepts JSON lines or plain URL lines — fail closed if neither present.
 */
export function parseLakebedDeployOutput(
	stdout: string,
): LakebedAnonymousDeployResult {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("lakebed deploy produced empty output");
	}

	// Prefer a JSON object anywhere in the output.
	for (const line of trimmed.split(/\r?\n/u)) {
		const candidate = line.trim();
		if (!candidate.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(candidate) as Record<string, unknown>;
			const stationUrl =
				(typeof parsed.url === "string" && parsed.url) ||
				(typeof parsed.deployUrl === "string" && parsed.deployUrl) ||
				(typeof parsed.primaryUrl === "string" && parsed.primaryUrl) ||
				"";
			const deployId =
				(typeof parsed.deployId === "string" && parsed.deployId) ||
				(typeof parsed.id === "string" && parsed.id) ||
				"";
			const claimUrl =
				(typeof parsed.claimUrl === "string" && parsed.claimUrl) ||
				(deployId ? `https://lakebed.dev/claim/${deployId}` : "");
			if (stationUrl && claimUrl) {
				requireLakebedUrl(stationUrl, "station");
				requireLakebedUrl(claimUrl, "claim");
				return {
					deployId: deployId || new URL(stationUrl).hostname,
					stationUrl,
					claimUrl,
				};
			}
		} catch {
			// keep scanning
		}
	}

	const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/u);
	if (!urlMatch) {
		throw new Error(
			"lakebed deploy output missing deploy URL (anonymous Temporary Accounts path)",
		);
	}
	const stationUrl = urlMatch[0].replace(/[.,)]+$/u, "");
	requireLakebedUrl(stationUrl, "station");
	const host = new URL(stationUrl).hostname;
	const deployId = host.split(".")[0] || "anon";
	return {
		deployId,
		stationUrl,
		claimUrl: requireLakebedUrl(
			`https://lakebed.dev/claim/${deployId}`,
			"claim",
		),
	};
}

async function runLakebedCliDeploy(
	capsuleDir: string,
): Promise<LakebedAnonymousDeployResult> {
	// Refuse permanent token env — Temporary/agent path only.
	const env = { ...process.env };
	delete env.LAKEBED_TOKEN;
	delete env.LAKEBED_TOKEN_API;

	const stdout = await new Promise<string>((resolve, reject) => {
		const child = spawn("npx", ["--yes", "lakebed", "deploy", "--json"], {
			cwd: capsuleDir,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let out = "";
		let err = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			out += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			err += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			reject(
				new Error(
					`lakebed CLI failed to start (anonymous deploy): ${error.message}`,
				),
			);
		});
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`lakebed deploy exited ${code}: ${err || out || "no output"}`,
					),
				);
				return;
			}
			resolve(out || err);
		});
	});

	return parseLakebedDeployOutput(stdout);
}

export function createLakebedAnonymousCliTransport(): LakebedAnonymousTransport {
	return {
		async deployAnonymous({ capsuleDir }) {
			return runLakebedCliDeploy(capsuleDir);
		},
	};
}

export async function materializeEnvironmentStationCapsule(input: {
	readonly stationId: string;
	readonly serverSource?: string;
	readonly rootDir?: string;
}): Promise<string> {
	const root =
		input.rootDir ??
		(await mkdtemp(path.join(tmpdir(), "hobo-lakebed-station-")));
	const serverDir = path.join(root, "server");
	await mkdir(serverDir, { recursive: true });
	await writeFile(
		path.join(serverDir, "index.ts"),
		input.serverSource ?? DEFAULT_CAPSULE_SERVER,
		"utf8",
	);
	await writeFile(
		path.join(root, "package.json"),
		JSON.stringify(
			{
				name: `hobo-env-station-${input.stationId}`.slice(0, 64),
				private: true,
				type: "module",
			},
			null,
			2,
		),
		"utf8",
	);
	return root;
}

/**
 * Provision an anonymous Lakebed Environment Station — no LAKEBED_TOKEN.
 */
export async function provisionTemporaryEnvironmentStation(
	input: LakebedTemporaryStationInput,
): Promise<TemporaryEnvironmentStationResult> {
	const capsuleDir =
		input.capsuleDir ??
		(await materializeEnvironmentStationCapsule({
			stationId: input.stationId,
			...(input.capsuleServerSource
				? { serverSource: input.capsuleServerSource }
				: {}),
		}));
	const transport = input.transport ?? createLakebedAnonymousCliTransport();
	const deployed = await transport.deployAnonymous({
		stationId: input.stationId,
		capsuleDir,
	});

	const expiresAt = temporaryStationExpiresAt(TEMPORARY_STATION_TTL_MS);
	return {
		stationId: input.stationId,
		stationUrl: deployed.stationUrl,
		primaryUrl: deployed.stationUrl,
		claimUrl: deployed.claimUrl,
		expiresAt,
		ttlSeconds: temporaryStationTtlSeconds(),
		providerId: LAKEBED_TEMPORARY_PROVIDER_ID,
		accountId: deployed.deployId,
		anonymous: true,
		temporary: true,
	};
}
