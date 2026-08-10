import {
	TEMPORARY_STATION_TTL_MS as CORE_TEMPORARY_STATION_TTL_MS,
	temporaryStationExpiresAt,
	type TemporaryEnvironmentStationResult as SharedTemporaryEnvironmentStationResult,
} from "@hobo/core";

import {
	assertStationWorkerHasNoAppCode,
	ENVIRONMENT_STATION_WORKER_MODULE,
	ENVIRONMENT_STATION_WORKER_NAME_PREFIX,
} from "./station-worker-source.js";
import {
	solvePreviewChallenge,
	type PreviewChallenge,
} from "./temporary-pow.js";

export const CF_API_BASE = "https://api.cloudflare.com/client/v4"; // public-contract: Cloudflare API v4 base used by Temporary Accounts
export const CF_TERMS_URL = "https://www.cloudflare.com/terms/"; // public-contract: Temporary Accounts terms URL
export const CF_PRIVACY_URL = "https://www.cloudflare.com/privacypolicy/"; // public-contract: Temporary Accounts privacy URL
/** @deprecated Prefer TEMPORARY_STATION_TTL_MS from @hobo/core — re-export for CF callers. */
export const TEMPORARY_STATION_TTL_MS = CORE_TEMPORARY_STATION_TTL_MS;

export const CLOUDFLARE_TEMPORARY_PROVIDER_ID = "cloudflare" as const;

export type TemporaryEnvironmentStationInput = {
	readonly stationId: string;
	readonly scriptName?: string;
	readonly workerModule?: string;
	readonly fetchImpl?: typeof fetch;
	/** Injected for tests — skips live challenge/provision. */
	readonly transport?: TemporaryAccountTransport;
	/** Workers compatibility_flags (e.g. nodejs_compat for sync PoW on relay). */
	readonly compatibilityFlags?: readonly string[];
	/** Plain-text Worker bindings (e.g. TEMP_API_TOKEN for CORS relay). */
	readonly bindings?: Readonly<Record<string, string>>;
};

/** Cloudflare Temporary Accounts result — shared contract + CF scriptName/accountId. */
export type TemporaryEnvironmentStationResult =
	SharedTemporaryEnvironmentStationResult & {
		readonly providerId: typeof CLOUDFLARE_TEMPORARY_PROVIDER_ID;
		readonly scriptName: string;
		readonly accountId: string;
		readonly primaryUrl: string;
	};

export type TemporaryPreviewAccount = {
	readonly accountId: string;
	readonly apiToken: string;
	readonly claimUrl: string;
	readonly workersDevSubdomain?: string;
};

export type TemporaryAccountTransport = {
	requestChallenge(): Promise<PreviewChallenge>;
	createPreviewAccount(
		challenge: PreviewChallenge,
		solution: { checkpoints: string },
	): Promise<TemporaryPreviewAccount>;
	deployWorkerScript(input: {
		accountId: string;
		apiToken: string;
		scriptName: string;
		moduleSource: string;
		compatibilityFlags?: readonly string[];
		bindings?: Readonly<Record<string, string>>;
	}): Promise<{ workersDevUrl: string }>;
};

type CfEnvelope<T> = {
	success: boolean;
	result?: T;
	errors?: Array<{ message?: string; code?: number }>;
};

function sanitizeScriptName(stationId: string, override?: string): string {
	if (override) {
		return override
			.replace(/[^a-z0-9-]/giu, "-")
			.replace(/^-+|-+$/gu, "")
			.slice(0, 63)
			.toLowerCase()
			.replace(/^-+|-+$/gu, "") || "hobo-env-station";
	}
	// Stable short slug — long UUID stationIds truncated mid-hyphen and broke workers.dev.
	const compact = stationId
		.replace(/[^a-z0-9]+/giu, "")
		.toLowerCase()
		.slice(-24);
	return `${ENVIRONMENT_STATION_WORKER_NAME_PREFIX}-${compact || "anon"}`.slice(
		0,
		63,
	);
}

async function readCfJson<T>(
	response: Response,
	label: string,
): Promise<T> {
	const body = (await response.json()) as CfEnvelope<T>;
	if (!response.ok || !body.success || body.result === undefined) {
		const detail =
			body.errors?.map((entry) => entry.message ?? String(entry.code)).join("; ") ||
			`HTTP ${response.status}`;
		throw new Error(`Cloudflare ${label} failed: ${detail}`);
	}
	return body.result;
}

export function createCloudflareTemporaryAccountTransport(
	fetchImpl: typeof fetch = fetch,
): TemporaryAccountTransport {
	return {
		async requestChallenge() {
			const response = await fetchImpl(
				`${CF_API_BASE}/provisioning/previews/challenge`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
				},
			);
			return readCfJson<PreviewChallenge>(response, "preview challenge");
		},

		async createPreviewAccount(challenge, solution) {
			const response = await fetchImpl(`${CF_API_BASE}/provisioning/previews`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					termsOfService: CF_TERMS_URL,
					privacyPolicy: CF_PRIVACY_URL,
					acceptTermsOfService: "yes",
					challengeToken: challenge.challengeToken,
					solution,
				}),
			});
			const result = await readCfJson<{
				accountId?: string;
				account_id?: string;
				apiToken?: string;
				api_token?: string;
				claimUrl?: string;
				claim_url?: string;
				workersDevSubdomain?: string;
				subdomain?: string;
				account?: {
					id?: string;
					apiToken?: string;
					api_token?: string;
				};
				claim?: {
					url?: string;
					token?: string;
				};
			}>(response, "preview account");
			const accountId =
				result.accountId ?? result.account_id ?? result.account?.id;
			const apiToken =
				result.apiToken ??
				result.api_token ??
				result.account?.apiToken ??
				result.account?.api_token;
			const claimUrl =
				result.claimUrl ?? result.claim_url ?? result.claim?.url;
			if (!accountId || !apiToken || !claimUrl) {
				throw new Error(
					"Cloudflare preview account response missing accountId/apiToken/claimUrl",
				);
			}
			const workersDevSubdomain =
				result.workersDevSubdomain ?? result.subdomain;
			return {
				accountId,
				apiToken,
				claimUrl,
				...(workersDevSubdomain ? { workersDevSubdomain } : {}),
			};
		},

		async deployWorkerScript({
			accountId,
			apiToken,
			scriptName,
			moduleSource,
			compatibilityFlags,
			bindings,
		}) {
			const bindingList = bindings
				? Object.entries(bindings).map(([name, text]) => ({
						type: "plain_text",
						name,
						text,
					}))
				: [];
			const metadata = JSON.stringify({
				main_module: "station.js",
				compatibility_date: "2024-11-01",
				...(compatibilityFlags && compatibilityFlags.length > 0
					? { compatibility_flags: [...compatibilityFlags] }
					: {}),
				...(bindingList.length > 0 ? { bindings: bindingList } : {}),
			});
			const form = new FormData();
			form.set(
				"metadata",
				new Blob([metadata], { type: "application/json" }),
			);
			form.set(
				"station.js",
				new File([moduleSource], "station.js", {
					type: "application/javascript+module",
				}),
			);

			const put = await fetchImpl(
				`${CF_API_BASE}/accounts/${accountId}/workers/scripts/${scriptName}`,
				{
					method: "PUT",
					headers: { authorization: `Bearer ${apiToken}` },
					body: form,
				},
			);
			await readCfJson<unknown>(put, "workers script upload");

			const subdomain = await fetchImpl(
				`${CF_API_BASE}/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${apiToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ enabled: true }),
				},
			);
			const subResult = await readCfJson<{
				enabled?: boolean;
				previews_enabled?: boolean;
			}>(subdomain, "workers.dev subdomain enable").catch(() => ({
				enabled: true,
			}));

			const account = await fetchImpl(
				`${CF_API_BASE}/accounts/${accountId}/workers/subdomain`,
				{
					method: "GET",
					headers: { authorization: `Bearer ${apiToken}` },
				},
			);
			const accountSub = await readCfJson<{ subdomain?: string }>(
				account,
				"workers subdomain",
			).catch(() => ({ subdomain: undefined }));

			const host =
				accountSub.subdomain ??
				(subResult as { subdomain?: string }).subdomain;
			if (!host) {
				// Fallback shape used by workers.dev when subdomain lookup lags.
				return {
					workersDevUrl: `https://${scriptName}.${accountId}.workers.dev`,
				};
			}
			return {
				workersDevUrl: `https://${scriptName}.${host}.workers.dev`,
			};
		},
	};
}

/**
 * Request Temporary Accounts challenge, solve PoW, create preview account.
 * Returns temporary credentials — never persist as HoBo permanent secrets.
 */
export async function solveAndProvisionAccount(
	transport: TemporaryAccountTransport,
): Promise<TemporaryPreviewAccount> {
	const challenge = await transport.requestChallenge();
	const solved = await solvePreviewChallenge(challenge);
	return transport.createPreviewAccount(challenge, solved.solution);
}

/**
 * Provision an anonymous Environment Station on a Cloudflare temporary account.
 * No user Cloudflare credentials — Temporary Accounts API + Worker deploy.
 */
export async function provisionTemporaryEnvironmentStation(
	input: TemporaryEnvironmentStationInput,
): Promise<TemporaryEnvironmentStationResult> {
	const moduleSource = input.workerModule ?? ENVIRONMENT_STATION_WORKER_MODULE;
	assertStationWorkerHasNoAppCode(moduleSource);
	const scriptName = sanitizeScriptName(input.stationId, input.scriptName);
	const transport =
		input.transport ??
		createCloudflareTemporaryAccountTransport(input.fetchImpl ?? fetch);

	const account = await solveAndProvisionAccount(transport);
	const deployed = await transport.deployWorkerScript({
		accountId: account.accountId,
		apiToken: account.apiToken,
		scriptName,
		moduleSource,
		...(input.compatibilityFlags
			? { compatibilityFlags: input.compatibilityFlags }
			: {}),
		...(input.bindings ? { bindings: input.bindings } : {}),
	});

	const expiresAt = temporaryStationExpiresAt(TEMPORARY_STATION_TTL_MS);
	return {
		stationId: input.stationId,
		scriptName,
		stationUrl: deployed.workersDevUrl,
		primaryUrl: deployed.workersDevUrl,
		claimUrl: account.claimUrl,
		accountId: account.accountId,
		expiresAt,
		providerId: CLOUDFLARE_TEMPORARY_PROVIDER_ID,
		anonymous: true,
		temporary: true,
	};
}
