/**
 * Deploy real Wasp OpenSaaS client to Cloudflare Temporary Accounts.
 * Zero permanent CLOUDFLARE_API_TOKEN — `wrangler deploy --temporary` logged out.
 */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseWranglerTemporaryOutput } from "../../packages/providers/provider-cloudflare/src/wrangler-temporary.ts";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
export const OPENSAAS_APP_ROOT = path.join(
	REPO_ROOT,
	"examples/wasp-opensaas/app",
);
const CLIENT_BUILD = path.join(
	OPENSAAS_APP_ROOT,
	".wasp/out/web-app/build/index.html",
);

export type OpenSaasTemporaryDeployResult = {
	readonly ok: true;
	readonly clientUrl: string;
	readonly serverUrl: string;
	readonly claimUrl: string;
	readonly expiresAt: string;
	readonly anonymous: true;
	readonly temporary: true;
	readonly exampleId: "opensaas";
};

function run(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, [...args], {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});
		child.on("error", (error) => {
			resolve({ code: 1, stdout, stderr: error.message });
		});
	});
}

async function ensureClientBuild(env: NodeJS.ProcessEnv): Promise<void> {
	try {
		await access(CLIENT_BUILD);
		return;
	} catch {
		/* build missing */
	}

	const waspOk = (await run("wasp", ["version"], OPENSAAS_APP_ROOT, env)).code === 0;
	if (!waspOk) {
		throw new Error(
			"wasp CLI not found. Install: npm i -g @wasp.sh/wasp-cli@^0.25",
		);
	}

	const buildEnv = {
		...env,
		DATABASE_URL:
			env.DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5432/opensaas",
		SMTP_HOST: env.SMTP_HOST ?? "127.0.0.1",
		SMTP_PORT: env.SMTP_PORT ?? "1025",
		SMTP_USERNAME: env.SMTP_USERNAME ?? "x",
		SMTP_PASSWORD: env.SMTP_PASSWORD ?? "x",
	};
	const waspBuild = await run("wasp", ["build"], OPENSAAS_APP_ROOT, buildEnv);
	if (waspBuild.code !== 0) {
		throw new Error(
			waspBuild.stderr.trim() ||
				waspBuild.stdout.trim() ||
				"wasp build failed for OpenSaaS",
		);
	}

	const vite = await run("npx", ["vite", "build"], OPENSAAS_APP_ROOT, {
		...buildEnv,
		REACT_APP_API_URL: env.REACT_APP_API_URL ?? "https://example.com",
	});
	if (vite.code !== 0) {
		throw new Error(
			vite.stderr.trim() || vite.stdout.trim() || "vite build failed for OpenSaaS",
		);
	}
	await access(CLIENT_BUILD);
}

/**
 * Build (if needed) + `wrangler deploy --temporary` for OpenSaaS static client.
 */
export async function deployOpenSaasTemporaryClient(input: {
	readonly wranglerBin?: string;
	readonly skipBuild?: boolean;
} = {}): Promise<OpenSaasTemporaryDeployResult> {
	const env = { ...process.env };
	delete env.CLOUDFLARE_API_TOKEN;
	delete env.CLOUDFLARE_API_KEY;
	delete env.CF_API_TOKEN;
	delete env.CLOUDFLARE_ACCOUNT_ID;

	if (!input.skipBuild) {
		await ensureClientBuild(env);
	} else {
		await access(CLIENT_BUILD);
	}

	const bin = input.wranglerBin ?? "npx";
	const args =
		bin === "npx"
			? ["--yes", "wrangler@4.102.0", "deploy", "--temporary"]
			: ["deploy", "--temporary"];
	const result = await run(bin, args, OPENSAAS_APP_ROOT, env);
	if (result.code !== 0) {
		throw new Error(
			result.stderr.trim() ||
				result.stdout.trim() ||
				"wrangler deploy --temporary failed for OpenSaaS",
		);
	}
	const parsed = parseWranglerTemporaryOutput(result.stdout, result.stderr);
	return {
		ok: true,
		clientUrl: parsed.stationUrl,
		serverUrl: parsed.stationUrl,
		claimUrl: parsed.claimUrl,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
		anonymous: true,
		temporary: true,
		exampleId: "opensaas",
	};
}
