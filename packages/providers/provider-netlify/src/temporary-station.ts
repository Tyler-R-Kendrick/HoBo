/**
 * Netlify anonymous Environment Station provision
 * (`netlify deploy --allow-anonymous` / Netlify Drop claim flow).
 *
 * Temporary path never uses permanent `NETLIFY_AUTH_TOKEN` /
 * `NETLIFY_ACCESS_TOKEN`. Tests and CI inject a transport or set
 * `HOBO_NETLIFY_TEMP_MOCK=1` at the Examples broker.
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

import { PROVIDER_TARGET } from "./options.js";

export const NETLIFY_TEMPORARY_PROVIDER_ID = PROVIDER_TARGET;
export const supportsAnonymousTemporaryDeploy = true as const;

/** public-contract: Drop / claim landing for operators. */
export const NETLIFY_DROP_URL = "https://app.netlify.com/drop";

export type NetlifyAnonymousDeployResult = {
	readonly deployId: string;
	readonly stationUrl: string;
	readonly claimUrl: string;
};

export type NetlifyAnonymousTransport = {
	deployAnonymous(input: {
		readonly stationId: string;
		readonly workDir: string;
	}): Promise<NetlifyAnonymousDeployResult>;
};

export type NetlifyDropFile = {
	readonly file: string;
	readonly data: string;
	readonly encoding?: "utf-8" | "base64";
};

export type NetlifyTemporaryStationInput = {
	readonly stationId: string;
	readonly transport?: NetlifyAnonymousTransport;
	readonly files?: readonly NetlifyDropFile[];
	readonly workDir?: string;
};

const DEFAULT_STATION_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HoBo Environment Station · Netlify</title>
</head>
<body data-hobo-station="netlify" data-anonymous="true">
  <main>
    <h1>HoBo Environment Station</h1>
    <p>Provisioned via <code>netlify deploy --allow-anonymous</code> (claim within ~1h).</p>
    <p><a href="${NETLIFY_DROP_URL}">Netlify Drop</a></p>
  </main>
</body>
</html>
`;

function stripPermanentNetlifyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const next = { ...env };
	delete next.NETLIFY_AUTH_TOKEN;
	delete next.NETLIFY_ACCESS_TOKEN;
	delete next.NETLIFY_TOKEN;
	return next;
}

function resultFromNetlifyJson(
	parsed: Record<string, unknown>,
): NetlifyAnonymousDeployResult | null {
	const urlRaw =
		(typeof parsed.site_url === "string" && parsed.site_url) ||
		(typeof parsed.url === "string" && parsed.url) ||
		(typeof parsed.deploy_url === "string" && parsed.deploy_url) ||
		(typeof parsed.deployUrl === "string" && parsed.deployUrl) ||
		(typeof parsed.ssl_url === "string" && parsed.ssl_url) ||
		"";
	const stationUrlRaw = urlRaw.startsWith("http")
		? urlRaw
		: urlRaw
			? `https://${urlRaw}`
			: "";
	// CLI may emit http://*.netlify.app — normalize to https for browsers.
	const stationUrl = stationUrlRaw.replace(/^http:\/\//u, "https://");
	const deployId =
		(typeof parsed.deploy_id === "string" && parsed.deploy_id) ||
		(typeof parsed.deployId === "string" && parsed.deployId) ||
		(typeof parsed.site_id === "string" && parsed.site_id) ||
		(typeof parsed.id === "string" && parsed.id) ||
		"";
	let claimUrl =
		(typeof parsed.claim_url === "string" && parsed.claim_url) ||
		(typeof parsed.claimUrl === "string" && parsed.claimUrl) ||
		"";
	const password =
		typeof parsed.password === "string" && parsed.password.length > 0
			? parsed.password
			: "";
	// Drop sites are password-gated until claimed — surface password on claimUrl.
	if (claimUrl && password && !claimUrl.includes("password=")) {
		const sep = claimUrl.includes("?") ? "&" : "#";
		// Prefer fragment so password is not sent to Netlify as a query param twice.
		claimUrl = `${claimUrl}${claimUrl.includes("#") ? "&" : sep}password=${encodeURIComponent(password)}`;
	}
	if (!stationUrl) return null;
	if (!claimUrl && !deployId) return null;
	const slug = new URL(stationUrl).hostname.split(".")[0] || "anon";
	return {
		deployId: deployId || slug,
		stationUrl,
		claimUrl:
			claimUrl ||
			`https://app.netlify.com/drop/${slug}${password ? `#password=${encodeURIComponent(password)}` : ""}`,
	};
}

/**
 * Parse `netlify deploy --allow-anonymous` stdout for live URL + claim material.
 * CLI `--json` often pretty-prints — accept whole-stdout JSON, single-line JSON,
 * or URL fallback.
 */
export function parseNetlifyAnonymousDeployOutput(
	stdout: string,
): NetlifyAnonymousDeployResult {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("netlify anonymous deploy produced empty output");
	}

	const jsonStart = trimmed.indexOf("{");
	const jsonEnd = trimmed.lastIndexOf("}");
	if (jsonStart >= 0 && jsonEnd > jsonStart) {
		try {
			const parsed = JSON.parse(
				trimmed.slice(jsonStart, jsonEnd + 1),
			) as Record<string, unknown>;
			const fromBlob = resultFromNetlifyJson(parsed);
			if (fromBlob) return fromBlob;
		} catch {
			// fall through to line / URL strategies
		}
	}

	for (const line of trimmed.split(/\r?\n/u)) {
		const candidate = line.trim();
		if (!candidate.startsWith("{")) continue;
		try {
			const fromLine = resultFromNetlifyJson(
				JSON.parse(candidate) as Record<string, unknown>,
			);
			if (fromLine) return fromLine;
		} catch {
			// keep scanning
		}
	}

	// `netlify.app` must be the end of the *host*, not merely present somewhere
	// in the URL. The looser form matched `https://evil.example/netlify.app`,
	// which would have been adopted as the station URL — a path segment is not a
	// hostname, and this is the last-resort strategy, so it is the one place
	// where a wrong match is least likely to be noticed.
	const urlMatch = trimmed.match(
		/https?:\/\/[^\s"'<>/]+\.netlify\.app(?![A-Za-z0-9-])(?!\.[A-Za-z0-9])[^\s"'<>]*/iu,
	);
	if (!urlMatch) {
		throw new Error(
			"netlify anonymous deploy output missing *.netlify.app URL (see netlify deploy --allow-anonymous)",
		);
	}
	const stationUrl = urlMatch[0]
		.replace(/[.,)]+$/u, "")
		.replace(/^http:\/\//u, "https://");
	const deployId = new URL(stationUrl).hostname.split(".")[0] || "anon";
	const claimMatch = trimmed.match(
		/https?:\/\/[^\s"'<>]*app\.netlify\.com\/[^\s"'<>]*(?:claim|drop)[^\s"'<>]*/iu,
	);
	return {
		deployId,
		stationUrl,
		claimUrl:
			claimMatch?.[0]?.replace(/[.,)]+$/u, "") ??
			`https://app.netlify.com/drop/${deployId}`,
	};
}

async function runNetlifyAnonymousCli(input: {
	readonly workDir: string;
}): Promise<NetlifyAnonymousDeployResult> {
	const env = stripPermanentNetlifyEnv(process.env);
	const stdout = await new Promise<string>((resolve, reject) => {
		const child = spawn(
			"npx",
			[
				"--yes",
				"netlify-cli",
				"deploy",
				"--allow-anonymous",
				"--dir",
				".",
				"--prod",
				"--json",
			],
			{
				cwd: input.workDir,
				env,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
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
					`netlify anonymous CLI failed to start: ${error.message}. Install netlify-cli or open ${NETLIFY_DROP_URL}.`,
				),
			);
		});
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`netlify deploy --allow-anonymous exited ${code}: ${err || out || "no output"}. Update netlify-cli, or use ${NETLIFY_DROP_URL}. Never NETLIFY_AUTH_TOKEN on Examples path.`,
					),
				);
				return;
			}
			resolve(out || err);
		});
	});

	return parseNetlifyAnonymousDeployOutput(stdout);
}

export function createNetlifyAnonymousCliTransport(): NetlifyAnonymousTransport {
	return {
		async deployAnonymous({ workDir }) {
			return runNetlifyAnonymousCli({ workDir });
		},
	};
}

export async function materializeNetlifyStation(input: {
	readonly stationId: string;
	readonly files?: readonly NetlifyDropFile[];
	readonly rootDir?: string;
}): Promise<{
	readonly workDir: string;
	readonly files: readonly NetlifyDropFile[];
}> {
	const files =
		input.files ??
		([
			{
				file: "index.html",
				data: DEFAULT_STATION_HTML,
				encoding: "utf-8",
			},
		] as const);
	const workDir =
		input.rootDir ?? (await mkdtemp(path.join(tmpdir(), "hobo-netlify-anon-")));
	for (const entry of files) {
		const abs = path.join(workDir, entry.file);
		await mkdir(path.dirname(abs), { recursive: true });
		const body =
			entry.encoding === "base64"
				? Buffer.from(entry.data, "base64")
				: entry.data;
		await writeFile(abs, body);
	}
	return { workDir, files };
}

/**
 * Provision an Environment Station via Netlify anonymous deploy.
 * Never uses permanent Netlify auth tokens on this path.
 */
export async function provisionTemporaryEnvironmentStation(
	input: NetlifyTemporaryStationInput,
): Promise<TemporaryEnvironmentStationResult> {
	const { workDir } = await materializeNetlifyStation({
		stationId: input.stationId,
		...(input.files ? { files: input.files } : {}),
		...(input.workDir ? { rootDir: input.workDir } : {}),
	});
	const transport = input.transport ?? createNetlifyAnonymousCliTransport();
	const deployed = await transport.deployAnonymous({
		stationId: input.stationId,
		workDir,
	});
	const expiresAt = temporaryStationExpiresAt(TEMPORARY_STATION_TTL_MS);
	return {
		stationId: input.stationId,
		stationUrl: deployed.stationUrl,
		primaryUrl: deployed.stationUrl,
		claimUrl: deployed.claimUrl,
		expiresAt,
		ttlSeconds: temporaryStationTtlSeconds(),
		providerId: NETLIFY_TEMPORARY_PROVIDER_ID,
		accountId: deployed.deployId,
		anonymous: true,
		temporary: true,
	};
}
