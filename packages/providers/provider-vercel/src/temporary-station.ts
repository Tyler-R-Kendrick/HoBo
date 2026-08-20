/**
 * Vercel Drop temporary Environment Station provision
 * (https://vercel.com/docs/drop).
 *
 * Drop semantics: upload files → **new** project → production URL. No Git,
 * no Vercel CLI required for the browser path; this package mirrors that shape
 * with an injectable transport (tests / Examples mock) and a CLI Drop-equivalent
 * that uses a local `vercel login` session — never a permanent `VERCEL_TOKEN`
 * on the Examples / temporary path (stripped like Cloudflare Temporary Accounts).
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

import {
	isJsonObject,
	isJsonString,
	type JsonValue,
	parseJsonValue,
} from "./json.js";
import { PROVIDER_TARGET } from "./options.js";

export const VERCEL_TEMPORARY_PROVIDER_ID = PROVIDER_TARGET;
export const supportsAnonymousTemporaryDeploy = true as const;

/** public-contract: Drop landing URL agents/operators use. */
export const VERCEL_DROP_URL = "https://vercel.com/drop";

export type VercelDropFile = {
	readonly file: string;
	readonly data: string;
	readonly encoding?: "utf-8" | "base64";
};

export type VercelDropDeployResult = {
	readonly projectName: string;
	readonly deploymentId: string;
	readonly stationUrl: string;
	readonly claimUrl: string;
};

export type VercelDropTransport = {
	deployDrop(input: {
		readonly stationId: string;
		readonly projectName: string;
		readonly files: readonly VercelDropFile[];
		readonly workDir: string;
	}): Promise<VercelDropDeployResult>;
};

export type VercelTemporaryStationInput = {
	readonly stationId: string;
	readonly transport?: VercelDropTransport;
	readonly files?: readonly VercelDropFile[];
	readonly projectName?: string;
};

const DEFAULT_STATION_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HoBo Environment Station · Vercel Drop</title>
</head>
<body data-hobo-station="vercel-drop">
  <main>
    <h1>HoBo Environment Station</h1>
    <p>Provisioned via <a href="${VERCEL_DROP_URL}">Vercel Drop</a> (new project, no Git).</p>
  </main>
</body>
</html>
`;

export function sanitizeVercelDropProjectName(stationId: string): string {
	const compact = stationId
		.replace(/[^a-z0-9]+/giu, "-")
		.replace(/^-+|-+$/gu, "")
		.toLowerCase()
		.slice(-40);
	return `hobo-drop-${compact || "anon"}`.slice(0, 52);
}

/**
 * Parse `vercel deploy` / Drop-equivalent stdout for live URL + project.
 */
type VercelDropDeployOutput = {
	readonly stationUrl: string;
	readonly deploymentId: string;
	readonly projectName?: string;
};

function jsonNonEmptyString(value: JsonValue | undefined): string {
	return isJsonString(value) && value.length > 0 ? value : "";
}

export function parseVercelDropDeployOutput(
	stdout: string,
): VercelDropDeployOutput {
	const trimmed = stdout.trim();
	if (!trimmed) {
		throw new Error("vercel Drop deploy produced empty output");
	}

	for (const line of trimmed.split(/\r?\n/u)) {
		const candidate = line.trim();
		if (!candidate.startsWith("{")) continue;
		const parsed = parseJsonValue(candidate);
		if (!isJsonObject(parsed)) continue;
		const urlRaw =
			jsonNonEmptyString(parsed.url) || jsonNonEmptyString(parsed.alias);
		const stationUrl = urlRaw.startsWith("http")
			? urlRaw
			: urlRaw
				? `https://${urlRaw}`
				: "";
		const deploymentId =
			jsonNonEmptyString(parsed.id) || jsonNonEmptyString(parsed.deploymentId);
		const projectName =
			jsonNonEmptyString(parsed.projectName) || jsonNonEmptyString(parsed.name);
		if (stationUrl) {
			return {
				stationUrl,
				deploymentId: deploymentId || new URL(stationUrl).hostname,
				...(projectName !== "" ? { projectName } : undefined),
			};
		}
	}

	const urlMatch = trimmed.match(
		/https?:\/\/[^\s"'<>]+vercel\.app[^\s"'<>]*/iu,
	);
	if (!urlMatch) {
		throw new Error(
			"vercel Drop deploy output missing *.vercel.app URL (see https://vercel.com/docs/drop)",
		);
	}
	const stationUrl = urlMatch[0].replace(/[.,)]+$/u, "");
	return {
		stationUrl,
		deploymentId: new URL(stationUrl).hostname.split(".")[0] || "drop",
	};
}

function stripPermanentVercelEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const next = { ...env };
	delete next.VERCEL_TOKEN;
	delete next.VERCEL_OIDC_TOKEN;
	delete next.NOW_TOKEN;
	return next;
}

async function runVercelDropCli(input: {
	readonly workDir: string;
	readonly projectName: string;
}): Promise<VercelDropDeployResult> {
	const env = stripPermanentVercelEnv(process.env);
	const stdout = await new Promise<string>((resolve, reject) => {
		const child = spawn(
			"npx",
			[
				"--yes",
				"vercel",
				"deploy",
				"--yes",
				"--prod",
				"--name",
				input.projectName,
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
					`vercel Drop CLI failed to start: ${error.message}. Use browser Drop at ${VERCEL_DROP_URL} or inject a transport.`,
				),
			);
		});
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`vercel Drop deploy exited ${code}: ${err || out || "no output"}. Log in with \`vercel login\` (session, not VERCEL_TOKEN) or open ${VERCEL_DROP_URL}.`,
					),
				);
				return;
			}
			resolve(out || err);
		});
	});

	const parsed = parseVercelDropDeployOutput(stdout);
	const projectName = parsed.projectName ?? input.projectName;
	return {
		projectName,
		deploymentId: parsed.deploymentId,
		stationUrl: parsed.stationUrl,
		// Drop creates a new project — claim/manage via dashboard (or Drop again).
		claimUrl: `https://vercel.com/${projectName}`,
	};
}

export function createVercelDropCliTransport(): VercelDropTransport {
	return {
		async deployDrop({ projectName, workDir }) {
			return runVercelDropCli({ workDir, projectName });
		},
	};
}

export async function materializeVercelDropStation(input: {
	readonly stationId: string;
	readonly files?: readonly VercelDropFile[];
	readonly rootDir?: string;
}): Promise<{
	readonly workDir: string;
	readonly files: readonly VercelDropFile[];
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
		input.rootDir ?? (await mkdtemp(path.join(tmpdir(), "hobo-vercel-drop-")));
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
 * Provision an Environment Station via Vercel Drop semantics.
 * Never uses permanent `VERCEL_TOKEN` on this path.
 */
export async function provisionTemporaryEnvironmentStation(
	input: VercelTemporaryStationInput,
): Promise<TemporaryEnvironmentStationResult> {
	const projectName =
		input.projectName ?? sanitizeVercelDropProjectName(input.stationId);
	const { workDir, files } = await materializeVercelDropStation({
		stationId: input.stationId,
		...(input.files ? { files: input.files } : undefined),
	});
	const transport = input.transport ?? createVercelDropCliTransport();
	const deployed = await transport.deployDrop({
		stationId: input.stationId,
		projectName,
		files,
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
		providerId: VERCEL_TEMPORARY_PROVIDER_ID,
		accountId: deployed.projectName,
		scriptName: deployed.deploymentId,
		anonymous: true,
		temporary: true,
	};
}
